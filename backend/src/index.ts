// HSpace —— Cloudflare Worker
// 一个 Worker 同时承载：
//   1) API 域名(api.myhost.com)：发布/更新/删除/列表
//   2) 用户内容子域(<slug>.usercontent-host.com)：实际访问 + 密码网关 + 计数
//
// 本地开发(wrangler dev)：API 走 http://localhost:8787/publish，
// 访问页面走 http://localhost:8787/p/<slug> (dev 便利路由)。

import {
  randomSlug,
  randomToken,
  sha256b64,
  hashPassword,
  verifyPassword,
  signCookie,
  verifyCookie,
} from "./crypto";
import { marked } from "marked";
import { passwordPage, notFoundPage, lockedPage, readingPage, tocPage, injectBackButton, CollectionNav } from "./html";
import { openapiSpec } from "./openapi";

export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  RATELIMIT: KVNamespace;
  COOKIE_SIGNING_SECRET: string;
  API_DOMAIN: string;
  USERCONTENT_DOMAIN: string;
  MAX_SIZE_BYTES: string;
  ANON_DEFAULT_TTL: string;
  RATE_LIMIT_PER_HOUR: string;
  RATE_LIMIT_PER_DAY: string;
  ANON_MAX_SIZE_BYTES: string;
  ANON_MAX_HITS: string;
  ANON_DAILY_GLOBAL_BYTES: string;
  COLLECTION_MAX_SIZE_BYTES: string;
  ANON_MAX_DOCS: string;
  MAX_DOCS: string;
}

/** R2 中合集清单(pages/<slug>/index.json)的结构 */
interface CollectionIndex {
  title: string;
  docs: { name: string; title: string; ext: "md" | "html" }[];
}

interface PageRow {
  slug: string;
  owner_id: string | null;
  edit_token_hash: string | null;
  object_key: string;
  filename: string | null;
  password_hash: string | null;
  password_salt: string | null;
  created_at: number;
  expires_at: number | null;
  size_bytes: number;
  hits: number;
  status: string;
}

const now = () => Math.floor(Date.now() / 1000);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname;

    // ── 路由：用户内容子域 → 提供页面 ──
    if (host.endsWith("." + env.USERCONTENT_DOMAIN)) {
      const slug = host.slice(0, host.length - env.USERCONTENT_DOMAIN.length - 1);
      return servePage(slug, url.pathname, request, env, ctx);
    }
    // dev 便利：/p/<slug>[/<n>] 也提供页面
    if (url.pathname.startsWith("/p/")) {
      const rest = url.pathname.slice(3);            // "<slug>" 或 "<slug>/2"
      const slash = rest.indexOf("/");
      const slug = slash === -1 ? rest : rest.slice(0, slash);
      const docPath = slash === -1 ? "/" : rest.slice(slash); // "/" 或 "/2"
      return servePage(slug, docPath, request, env, ctx);
    }

    // ── 其余按 API 处理 ──
    return handleApi(url, request, env, ctx);
  },
};

// ============================ API ============================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Edit-Token",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function handleApi(url: URL, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

  const path = url.pathname;

  if (path === "/publish" && request.method === "POST") return publish(request, env);

  const statsMatch = path.match(/^\/pages\/([A-Za-z0-9]+)\/stats$/);
  if (statsMatch && request.method === "GET") return statsPage(statsMatch[1], request, env);

  const pageMatch = path.match(/^\/pages\/([A-Za-z0-9]+)$/);
  if (pageMatch) {
    const slug = pageMatch[1];
    if (request.method === "PATCH") return patchPage(slug, request, env);
    if (request.method === "DELETE") return deletePage(slug, request, env);
  }

  if (path === "/pages" && request.method === "GET") return listPages(request, env);

  if (path === "/" || path === "/health") return json({ ok: true, service: "hspace" });

  // AI 工具就绪:OpenAPI 规范(GPT Actions / agent 框架可直接消费),servers 按当前 origin 填充
  if (path === "/openapi.json" && request.method === "GET") {
    return json(openapiSpec(url.origin));
  }

  return json({ error: "not_found" }, 404);
}

/** 解析 Authorization: Bearer <key> → owner_id | null */
async function authOwner(request: Request, env: Env): Promise<string | null> {
  const h = request.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const keyHash = await sha256b64(h.slice(7).trim());
  const row = await env.DB.prepare(
    "SELECT owner_id FROM api_keys WHERE key_hash = ? AND revoked = 0"
  ).bind(keyHash).first<{ owner_id: string }>();
  return row?.owner_id ?? null;
}

// ---- POST /publish ----
async function publish(request: Request, env: Env): Promise<Response> {
  // 鉴权（可选）
  const hasAuthHeader = !!request.headers.get("Authorization");
  const ownerId = await authOwner(request, env);
  if (hasAuthHeader && !ownerId) return json({ error: "invalid_api_key" }, 401);

  // 频率限制（按 IP）：小时窗口对所有人生效，日窗口只限匿名
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  if (!(await allowRate(ip, env, !ownerId))) return json({ error: "rate_limited" }, 429);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // 内容收集与逐篇校验：files[] 为合集,否则 html/markdown 单文件
  const rawFiles = (body as any)?.files;
  const isCollection = Array.isArray(rawFiles);
  const prepared: PreparedDoc[] = [];

  if (isCollection) {
    const maxDocs = Number(ownerId ? env.MAX_DOCS : env.ANON_MAX_DOCS);
    if (rawFiles.length < 2) return json({ error: "collection_too_few" }, 400);
    if (rawFiles.length > maxDocs) return json({ error: "too_many_docs", maxDocs }, 400);
    for (const f of rawFiles) {
      const p = prepareDoc(f, ownerId, prepared.length + 1);
      if ("error" in p) return json({ error: p.error, file: p.name }, p.status);
      prepared.push(p);
    }
  } else {
    const p = prepareDoc(body, ownerId, 1, typeof body.filename === "string" ? body.filename : undefined);
    if ("error" in p) return json({ error: p.error }, p.status);
    prepared.push(p);
  }

  // 体积上限（合集看总量,单文件看单量;匿名更小）
  const totalSize = prepared.reduce((a, p) => a + p.size, 0);
  const maxSize = Number(
    isCollection
      ? (ownerId ? env.COLLECTION_MAX_SIZE_BYTES : env.ANON_MAX_SIZE_BYTES)
      : (ownerId ? env.MAX_SIZE_BYTES : env.ANON_MAX_SIZE_BYTES)
  );
  if (totalSize > maxSize) return json({ error: "too_large", maxBytes: maxSize }, 413);

  // 全局匿名日配额熔断：兜住 R2/D1 成本
  if (!ownerId && !(await allowGlobalBudget(totalSize, env))) {
    return json({ error: "service_busy" }, 503);
  }

  // 过期：匿名的 TTL 钳制在 [60 秒, ANON_DEFAULT_TTL] 内，防止传超长 expiresIn 变相拿永久链接
  let ttl = typeof body.expiresIn === "number" ? body.expiresIn : Number(env.ANON_DEFAULT_TTL);
  if (!ownerId) ttl = Math.min(Math.max(ttl, 60), Number(env.ANON_DEFAULT_TTL));
  const expiresAt = ownerId && body.expiresIn === null ? null : now() + ttl;

  // 密码
  let passwordHash: string | null = null;
  let passwordSalt: string | null = null;
  if (typeof body.password === "string" && body.password !== "") {
    const p = await hashPassword(body.password);
    passwordHash = p.hash;
    passwordSalt = p.salt;
  }

  // 生成唯一 slug 并写 R2（后缀即内容类型：单文件 pages/<slug>.<ext>；合集 pages/<slug>/…）
  const slug = await uniqueSlug(env);
  const ct = (ext: string) => ext === "md" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";
  let objectKey: string;
  let dbFilename: string | null;
  let docsResp: { index: number; title: string }[] | undefined;

  if (isCollection) {
    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.slice(0, 200) : (prepared[0].title || "合集");
    const index: CollectionIndex = {
      title,
      docs: prepared.map((p) => ({ name: p.name, title: p.title, ext: p.ext })),
    };
    await Promise.all(prepared.map((p, i) =>
      env.BUCKET.put(`pages/${slug}/${i + 1}.${p.ext}`, p.content, { httpMetadata: { contentType: ct(p.ext) } })
    ));
    await env.BUCKET.put(`pages/${slug}/index.json`, JSON.stringify(index),
      { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    objectKey = `pages/${slug}/index.json`;
    dbFilename = title;
    docsResp = prepared.map((p, i) => ({ index: i + 1, title: p.title }));
  } else {
    const p = prepared[0];
    objectKey = `pages/${slug}.${p.ext}`;
    await env.BUCKET.put(objectKey, p.content, { httpMetadata: { contentType: ct(p.ext) } });
    dbFilename = typeof body.filename === "string" ? body.filename.slice(0, 200) : null;
  }

  // 匿名编辑凭据
  const editToken = ownerId ? null : randomToken();
  const editTokenHash = editToken ? await sha256b64(editToken) : null;

  await env.DB.prepare(
    `INSERT INTO pages (slug, owner_id, edit_token_hash, object_key, filename,
       password_hash, password_salt, created_at, expires_at, size_bytes, hits, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active')`
  ).bind(
    slug, ownerId, editTokenHash, objectKey, dbFilename,
    passwordHash, passwordSalt, now(), expiresAt, totalSize
  ).run();

  return json({
    slug,
    url: `https://${slug}.${env.USERCONTENT_DOMAIN}`,
    expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    passwordProtected: !!passwordHash,
    ...(docsResp ? { docs: docsResp } : {}),
    editToken,
  });
}

interface PreparedDoc { name: string; content: string; ext: "md" | "html"; title: string; size: number; }

/** 校验并准备单篇内容(体积在上层按单/合集分别判定,这里只做类型/扫描/取标题) */
function prepareDoc(
  src: any, ownerId: string | null, ordinal: number, filename?: string
): PreparedDoc | { error: string; status: number; name?: string } {
  const picked = pickContent(src);
  const name = typeof src?.name === "string" ? src.name.slice(0, 200)
    : (filename ? filename.slice(0, 200) : `${ordinal}`);
  if (!picked) return { error: "missing_content", status: 400, name };
  if (isSuspicious(picked.content)) return { error: "content_blocked", status: 422, name };
  if (!ownerId && isPhishy(picked.content)) return { error: "content_blocked", status: 422, name };
  return {
    name,
    content: picked.content,
    ext: picked.ext,
    title: docTitle(picked.content, picked.ext, name),
    size: new TextEncoder().encode(picked.content).length,
  };
}

// ---- PATCH /pages/:slug ----（改密码 / 覆盖内容 / 改过期）
async function patchPage(slug: string, request: Request, env: Env): Promise<Response> {
  const page = await getPage(env, slug);
  if (!page || page.status !== "active") return json({ error: "not_found" }, 404);
  const who = await mutateRole(page, request, env);
  if (who === "none") return json({ error: "forbidden" }, 403);
  const isOwner = who === "owner";

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const sets: string[] = [];
  const args: unknown[] = [];

  const picked = pickContent(body);
  if (picked) {
    // 合集 MVP 不可变：增删改篇目并入"内容版本化"里程碑
    if (page.object_key.endsWith("/index.json")) return json({ error: "collection_content_immutable" }, 400);
    // 匿名不允许覆盖内容：防止先发正常页面过扫描、再整体换成钓鱼页
    if (!isOwner) return json({ error: "content_update_requires_login" }, 403);
    // 类型不可变：md 页面只能用 markdown 更新,html 页面只能用 html 更新
    if (!page.object_key.endsWith("." + picked.ext)) return json({ error: "content_type_mismatch" }, 400);
    if (isSuspicious(picked.content)) return json({ error: "content_blocked" }, 422);
    const size = new TextEncoder().encode(picked.content).length;
    if (size > Number(env.MAX_SIZE_BYTES)) return json({ error: "too_large" }, 413);
    await env.BUCKET.put(page.object_key, picked.content, {
      httpMetadata: { contentType: picked.ext === "md" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8" },
    });
    sets.push("size_bytes = ?"); args.push(size);
  }

  if ("password" in body) {
    if (body.password === null || body.password === "") {
      // 匿名页面必须保持密码保护
      if (!isOwner) return json({ error: "password_removal_requires_login" }, 403);
      sets.push("password_hash = NULL", "password_salt = NULL");
    } else if (typeof body.password === "string") {
      const p = await hashPassword(body.password);
      sets.push("password_hash = ?", "password_salt = ?"); args.push(p.hash, p.salt);
    }
  }

  if (typeof body.expiresIn === "number") {
    // 匿名改过期同样钳制上限
    const ttl = isOwner ? body.expiresIn : Math.min(Math.max(body.expiresIn, 60), Number(env.ANON_DEFAULT_TTL));
    sets.push("expires_at = ?"); args.push(now() + ttl);
  }
  if (body.expiresIn === null) {
    if (!isOwner) return json({ error: "permanent_requires_login" }, 403);
    sets.push("expires_at = NULL");
  }

  if (sets.length === 0) return json({ error: "nothing_to_update" }, 400);

  args.push(slug);
  await env.DB.prepare(`UPDATE pages SET ${sets.join(", ")} WHERE slug = ?`).bind(...args).run();
  return json({ ok: true, slug });
}

// ---- DELETE /pages/:slug ----
async function deletePage(slug: string, request: Request, env: Env): Promise<Response> {
  const page = await getPage(env, slug);
  if (!page || page.status !== "active") return json({ error: "not_found" }, 404);
  if ((await mutateRole(page, request, env)) === "none") return json({ error: "forbidden" }, 403);

  if (page.object_key.endsWith("/index.json")) {
    // 合集：按前缀清空整本册子
    const listed = await env.BUCKET.list({ prefix: `pages/${slug}/` });
    await Promise.all(listed.objects.map((o) => env.BUCKET.delete(o.key)));
  } else {
    await env.BUCKET.delete(page.object_key);
  }
  await env.DB.prepare("UPDATE pages SET status = 'deleted' WHERE slug = ?").bind(slug).run();
  return json({ ok: true });
}

// ---- GET /pages ----（列出当前登录用户的页面）
async function listPages(request: Request, env: Env): Promise<Response> {
  const ownerId = await authOwner(request, env);
  if (!ownerId) return json({ error: "unauthorized" }, 401);
  const { results } = await env.DB.prepare(
    `SELECT slug, filename, created_at, expires_at, hits, (password_hash IS NOT NULL) AS protected
     FROM pages WHERE owner_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 200`
  ).bind(ownerId).all();
  return json({ pages: results });
}

// ---- GET /pages/:slug/stats ----（访问回执：凭 owner 或 editToken 查访问量）
async function statsPage(slug: string, request: Request, env: Env): Promise<Response> {
  const page = await getPage(env, slug);
  if (!page || page.status !== "active") return json({ error: "not_found" }, 404);
  if ((await mutateRole(page, request, env)) === "none") return json({ error: "forbidden" }, 403);
  return json({
    slug,
    hits: page.hits,
    createdAt: page.created_at,
    expiresAt: page.expires_at ? new Date(page.expires_at * 1000).toISOString() : null,
    passwordProtected: !!page.password_hash,
    isCollection: page.object_key.endsWith("/index.json"),
  });
}

/** 校验修改权限并区分角色：owner（登录且匹配）/ anon（editToken 匹配）/ none */
async function mutateRole(page: PageRow, request: Request, env: Env): Promise<"owner" | "anon" | "none"> {
  const ownerId = await authOwner(request, env);
  if (page.owner_id && ownerId && page.owner_id === ownerId) return "owner";
  const token = request.headers.get("X-Edit-Token");
  if (token && page.edit_token_hash && (await sha256b64(token)) === page.edit_token_hash) {
    return "anon";
  }
  return "none";
}

// ============================ 提供页面 ============================

async function servePage(slug: string, docPath: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  slug = slug.toLowerCase(); // 域名不区分大小写，slug 统一按小写存取
  if (!/^[a-z0-9]+$/.test(slug)) return htmlResp(notFoundPage(), 404);

  const page = await getPage(env, slug);
  if (!page || page.status !== "active") return htmlResp(notFoundPage(), 404);
  if (page.expires_at && page.expires_at < now()) return htmlResp(notFoundPage(), 404);
  // 匿名页面访问量封顶,防止被当成免费 CDN / 钓鱼分发渠道
  if (!page.owner_id && page.hits >= Number(env.ANON_MAX_HITS)) return htmlResp(notFoundPage(), 404);

  // 密码网关
  if (page.password_hash && page.password_salt) {
    const cookieName = `hs_${slug}`;
    const cookie = readCookie(request, cookieName);

    if (cookie && (await verifyCookie(env.COOKIE_SIGNING_SECRET, slug, cookie))) {
      // 已通过，放行
    } else if (request.method === "POST") {
      // 防暴力破解：同一 IP 对同一页面 15 分钟内最多失败 10 次
      const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
      const attemptKey = `pw:${ip}:${slug}`;
      const failed = Number((await env.RATELIMIT.get(attemptKey)) ?? "0");
      if (failed >= 10) return htmlResp(lockedPage(), 429);

      const form = await request.formData();
      const pw = String(form.get("password") ?? "");
      if (await verifyPassword(pw, page.password_hash, page.password_salt)) {
        const exp = now() + 24 * 3600; // Cookie 24h 有效
        const value = await signCookie(env.COOKIE_SIGNING_SECRET, slug, exp);
        // 跳回原请求路径,合集深链(/3)验密后直达该篇,而非被扔回目录
        const back = new URL(request.url).pathname || "/";
        const headers = new Headers({ Location: back });
        headers.append(
          "Set-Cookie",
          `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
        );
        return new Response(null, { status: 303, headers });
      }
      await env.RATELIMIT.put(attemptKey, String(failed + 1), { expirationTtl: 900 });
      return htmlResp(passwordPage(true), 401);
    } else {
      return htmlResp(passwordPage(false), 401);
    }
  }

  // 计数（异步，不阻塞响应）
  ctx.waitUntil(
    env.DB.prepare("UPDATE pages SET hits = hits + 1 WHERE slug = ?").bind(slug).run()
  );

  // 合集：目录页 / 篇目页
  if (page.object_key.endsWith("/index.json")) {
    return serveCollection(env, page, docPath);
  }

  const obj = await env.BUCKET.get(page.object_key);
  if (!obj) return htmlResp(notFoundPage(), 404);

  // Markdown:边缘渲染进阅读模板(存原文,模板升级即时生效)
  if (page.object_key.endsWith(".md")) {
    const md = await obj.text();
    const article = await marked.parse(md, { gfm: true, async: true });
    return htmlResp(readingPage(mdTitle(md, page.filename), article), 200);
  }

  return new Response(obj.body, { status: 200, headers: securityHeaders() });
}

/** 合集分发：docPath "/" → 目录页；"/<n>" → 第 n 篇 */
async function serveCollection(env: Env, page: PageRow, docPath: string): Promise<Response> {
  const idxObj = await env.BUCKET.get(page.object_key);
  if (!idxObj) return htmlResp(notFoundPage(), 404);
  const index = JSON.parse(await idxObj.text()) as CollectionIndex;
  const navDocs = index.docs.map((d, i) => ({ index: i + 1, title: d.title }));
  const slug = page.slug;

  const path = docPath.replace(/\/+$/, "") || "/";
  if (path === "/") {
    const date = new Date(page.created_at * 1000).toISOString().slice(0, 10);
    const meta = `${index.docs.length} 篇 · ${date} 分享`;
    return htmlResp(tocPage(index.title, navDocs, meta), 200);
  }

  const m = path.match(/^\/(\d+)$/);
  if (!m) return htmlResp(notFoundPage(), 404);
  const n = Number(m[1]);
  if (n < 1 || n > index.docs.length) return htmlResp(notFoundPage(), 404);

  const doc = index.docs[n - 1];
  const obj = await env.BUCKET.get(`pages/${slug}/${n}.${doc.ext}`);
  if (!obj) return htmlResp(notFoundPage(), 404);

  if (doc.ext === "md") {
    const article = await marked.parse(await obj.text(), { gfm: true, async: true });
    const nav: CollectionNav = { collectionTitle: index.title, docs: navDocs, current: n };
    return htmlResp(readingPage(doc.title, article, nav), 200);
  }
  // html 篇目:保留原样,仅注入一个悬浮「← 目录」按钮(不改动用户 DOM 结构)
  return new Response(injectBackButton(await obj.text()), { status: 200, headers: securityHeaders() });
}

function htmlResp(body: string, status: number): Response {
  return new Response(body, { status, headers: securityHeaders() });
}

/** 隔离域名上的安全响应头 */
function securityHeaders(): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    // 允许页面自带内联脚本/样式(AI 生成常见)，但禁止被主站以外嵌套
    "Content-Security-Policy": "frame-ancestors 'none';",
    "X-Frame-Options": "DENY",
  };
}

// ============================ 工具 ============================

/** 从请求体取内容：html 与 markdown 二选一,markdown 优先级更高 */
function pickContent(body: any): { content: string; ext: "md" | "html" } | null {
  if (typeof body?.markdown === "string" && body.markdown.trim() !== "") {
    return { content: body.markdown, ext: "md" };
  }
  if (typeof body?.html === "string" && body.html.trim() !== "") {
    return { content: body.html, ext: "html" };
  }
  return null;
}

/** md 标题：第一个 # 标题,退回文件名(去扩展名),再退回品牌名 */
function mdTitle(md: string, filename: string | null): string {
  const m = md.match(/^#\s+(.+)$/m);
  if (m) return m[1].replace(/[*_`~\[\]]/g, "").trim().slice(0, 120);
  if (filename) return filename.replace(/\.(md|markdown)$/i, "");
  return "HSpace";
}

/** 篇目标题：md 取首个 # 标题；html 取 <title>；均退回文件名(去扩展名) */
function docTitle(content: string, ext: "md" | "html", name: string): string {
  if (ext === "md") return mdTitle(content, name);
  const m = content.match(/<title>([^<]*)<\/title>/i);
  if (m && m[1].trim()) return m[1].trim().slice(0, 120);
  return name.replace(/\.(html?|md|markdown)$/i, "");
}

function getPage(env: Env, slug: string): Promise<PageRow | null> {
  return env.DB.prepare("SELECT * FROM pages WHERE slug = ?").bind(slug).first<PageRow>();
}

async function uniqueSlug(env: Env): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const slug = randomSlug(7);
    const exists = await env.DB.prepare("SELECT 1 FROM pages WHERE slug = ?").bind(slug).first();
    if (!exists) return slug;
  }
  return randomSlug(9);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

async function allowRate(ip: string, env: Env, anonymous: boolean): Promise<boolean> {
  const hourBucket = `rl:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
  const hourCount = Number((await env.RATELIMIT.get(hourBucket)) ?? "0");
  if (hourCount >= Number(env.RATE_LIMIT_PER_HOUR)) return false;

  // 匿名再加一道日配额，拦住"每小时不超但全天挂机刷"的滥用
  const dayBucket = `rl:d:${ip}:${Math.floor(Date.now() / 86_400_000)}`;
  if (anonymous) {
    const dayCount = Number((await env.RATELIMIT.get(dayBucket)) ?? "0");
    if (dayCount >= Number(env.RATE_LIMIT_PER_DAY)) return false;
    await env.RATELIMIT.put(dayBucket, String(dayCount + 1), { expirationTtl: 86_400 });
  }

  await env.RATELIMIT.put(hourBucket, String(hourCount + 1), { expirationTtl: 3600 });
  return true;
}

/** 匿名内容加严：钓鱼页最强特征——密码输入框、提交到外部域的表单 */
function isPhishy(html: string): boolean {
  const patterns = [
    /<input[^>]+type\s*=\s*["']?password/i,
    /<form[^>]+action\s*=\s*["']?https?:\/\//i,
  ];
  return patterns.some((re) => re.test(html));
}

/** 全局匿名日配额（字节）：超过后当天匿名发布一律 503 */
async function allowGlobalBudget(size: number, env: Env): Promise<boolean> {
  const key = `gb:${Math.floor(Date.now() / 86_400_000)}`;
  const used = Number((await env.RATELIMIT.get(key)) ?? "0");
  if (used + size > Number(env.ANON_DAILY_GLOBAL_BYTES)) return false;
  await env.RATELIMIT.put(key, String(used + size), { expirationTtl: 86_400 });
  return true;
}

/** 极简内容扫描：命中明显恶意特征则拦截（MVP 版，后续接专业服务） */
function isSuspicious(html: string): boolean {
  const lower = html.toLowerCase();
  const patterns = [
    /eval\s*\(\s*atob\s*\(/,          // 混淆解码执行
    /document\.write\s*\(\s*unescape/, // 老式混淆
    /<iframe[^>]+src=["']?https?:\/\/[^"'>]*\.(ru|tk|top|xyz)\b/, // 可疑外链域后缀(示例)
  ];
  return patterns.some((re) => re.test(lower));
}
