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
import { passwordPage, notFoundPage, lockedPage, readingPage, tocPage, injectCollectionNav, CollectionNav } from "./html";
import { openapiSpec } from "./openapi";
import { landingPage } from "./landing";
import { privacyPage, termsPage, reportPage } from "./pages";
import { handleAuth, sessionOwner, readCookie, hasSessionCookie } from "./auth";

export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  RATELIMIT: KVNamespace;
  COOKIE_SIGNING_SECRET: string;
  SESSION_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  API_DOMAIN: string;
  USERCONTENT_DOMAIN: string;
  MAX_SIZE_BYTES: string;
  ANON_DEFAULT_TTL: string;
  OWNER_MAX_TTL: string;
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
  version: number;
  updated_at: number | null;
}

const now = () => Math.floor(Date.now() / 1000);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname;

    // 第一方埋点 beacon(与域名无关,任意 origin 命中):无 Cookie、不存 IP、只聚合计数
    if (url.pathname === "/e") return recordEvent(url, env, ctx);

    // 落地页 + 法务/举报页:内容域的 hspace 子域(通配路由已覆盖;www/apex 已被其他服务占用)
    if (host === "hspace." + env.USERCONTENT_DOMAIN) {
      const auth = await handleAuth(url, request, env);
      if (auth) return auth;
      const asset = await serveBrandAsset(url.pathname, env);
      if (asset) return asset;
      const site = await serveSitePage(url.pathname, request, env);
      if (site) return site;
      if (url.pathname === "/") return landingResp(request);
      // console 前端同源调用 /me、/pages 等 API;未知路径由 handleApi 返回 JSON 404
      return handleApi(url, request, env, ctx);
    }

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

  const versionsMatch = path.match(/^\/pages\/([A-Za-z0-9]+)\/versions$/);
  if (versionsMatch && request.method === "GET") return listVersions(versionsMatch[1], request, env);
  const restoreMatch = path.match(/^\/pages\/([A-Za-z0-9]+)\/versions\/(\d+)\/restore$/);
  if (restoreMatch && request.method === "POST") return restoreVersion(restoreMatch[1], Number(restoreMatch[2]), request, env);

  const grantsMatch = path.match(/^\/pages\/([A-Za-z0-9]+)\/grants$/);
  if (grantsMatch) {
    if (request.method === "POST") return createGrant(grantsMatch[1], request, env);
    if (request.method === "GET") return listGrants(grantsMatch[1], request, env);
  }
  const grantMatch = path.match(/^\/pages\/([A-Za-z0-9]+)\/grants\/([A-Za-z0-9]+)$/);
  if (grantMatch && request.method === "DELETE") return revokeGrant(grantMatch[1], grantMatch[2], request, env);

  const pageMatch = path.match(/^\/pages\/([A-Za-z0-9]+)$/);
  if (pageMatch) {
    const slug = pageMatch[1];
    if (request.method === "PATCH") return patchPage(slug, request, env);
    if (request.method === "DELETE") return deletePage(slug, request, env);
  }

  if (path === "/pages" && request.method === "GET") return listPages(request, env);

  if (path === "/health") return json({ ok: true, service: "hspace" });
  if (path === "/") return landingResp(request);
  const asset = await serveBrandAsset(path, env);
  if (asset) return asset;
  const site = await serveSitePage(path, request, env);
  if (site) return site;

  // AI 工具就绪:OpenAPI 规范(GPT Actions / agent 框架可直接消费),servers 按当前 origin 填充
  if (path === "/openapi.json" && request.method === "GET") {
    return json(openapiSpec(url.origin));
  }

  return json({ error: "not_found" }, 404);
}

/** 解析凭据 → owner_id:优先 Bearer key;无 Bearer 时接受同源请求的登录会话 Cookie(console 前端) */
async function authOwner(request: Request, env: Env): Promise<string | null> {
  const h = request.headers.get("Authorization");
  if (h?.startsWith("Bearer ")) {
    const keyHash = await sha256b64(h.slice(7).trim());
    const row = await env.DB.prepare(
      "SELECT owner_id FROM api_keys WHERE key_hash = ? AND revoked = 0"
    ).bind(keyHash).first<{ owner_id: string }>();
    return row?.owner_id ?? null;
  }
  // CSRF 防护:Cookie 凭据仅在请求来源为 hspace 落地域(或本地 dev)时被接受,配合 SameSite=Lax
  const src = request.headers.get("Origin") || request.headers.get("Referer") || "";
  const allowed = [`https://hspace.${env.USERCONTENT_DOMAIN}`, "http://localhost:8787"];
  if (allowed.some((a) => src === a || src.startsWith(a + "/"))) {
    return sessionOwner(request, env);
  }
  return null;
}

// ---- POST /publish ----
async function publish(request: Request, env: Env): Promise<Response> {
  // 鉴权（可选）
  const hasAuthHeader = !!request.headers.get("Authorization");
  const ownerId = await authOwner(request, env);
  if (hasAuthHeader && !ownerId) return json({ error: "invalid_api_key" }, 401);
  // 带会话 Cookie 但未通过校验(过期/来源不符):明确 401,绝不静默降级为匿名发布
  if (!hasAuthHeader && !ownerId && hasSessionCookie(request)) return json({ error: "session_expired" }, 401);

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

  // 过期：没有永久链接。每档 TTL 钳制在 [60 秒, 该档上限] 内(匿名 7 天 / 登录 30 天),
  // expiresIn===null 或缺省都按该档上限处理，不再产生永久页(永久仅限第一方置顶内容，靠直接改库)。
  const maxTtl = Number(ownerId ? env.OWNER_MAX_TTL : env.ANON_DEFAULT_TTL);
  const reqTtl = typeof body.expiresIn === "number" ? body.expiresIn : maxTtl;
  const ttl = Math.min(Math.max(reqTtl, 60), maxTtl);
  const expiresAt = now() + ttl;

  // 密码
  let passwordHash: string | null = null;
  let passwordSalt: string | null = null;
  if (typeof body.password === "string" && body.password !== "") {
    const p = await hashPassword(body.password);
    passwordHash = p.hash;
    passwordSalt = p.salt;
  }

  // 生成唯一 slug 并写 R2(v1 用现有 key 布局)
  const slug = await uniqueSlug(env);
  const collectionTitle = isCollection
    ? (typeof body.title === "string" && body.title.trim() ? body.title.slice(0, 200) : (prepared[0].title || "合集"))
    : "";
  const written = await writeContentVersion(env, slug, 1, isCollection, prepared, collectionTitle);
  const objectKey = written.objectKey;
  const docsResp = written.docsResp;
  const dbFilename = isCollection ? collectionTitle : (typeof body.filename === "string" ? body.filename.slice(0, 200) : null);

  // 匿名编辑凭据
  const editToken = ownerId ? null : randomToken();
  const editTokenHash = editToken ? await sha256b64(editToken) : null;

  const ts = now();
  await env.DB.prepare(
    `INSERT INTO pages (slug, owner_id, edit_token_hash, object_key, filename,
       password_hash, password_salt, created_at, expires_at, size_bytes, hits, status, version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', 1, ?)`
  ).bind(
    slug, ownerId, editTokenHash, objectKey, dbFilename,
    passwordHash, passwordSalt, ts, expiresAt, totalSize, ts
  ).run();
  await env.DB.prepare(
    "INSERT INTO versions (slug, version, object_key, size_bytes, created_at) VALUES (?, 1, ?, ?, ?)"
  ).bind(slug, objectKey, totalSize, ts).run();

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

const ct = (ext: string) => ext === "md" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";

/** 把某一版内容写入 R2:v1 用现有布局,vN(>1)写到带版本的 key。返回 objectKey 与合集篇目清单 */
async function writeContentVersion(
  env: Env, slug: string, version: number, isCollection: boolean, prepared: PreparedDoc[], collectionTitle: string
): Promise<{ objectKey: string; docsResp?: { index: number; title: string }[] }> {
  if (isCollection) {
    const base = version === 1 ? `pages/${slug}` : `pages/${slug}/v${version}`;
    const index: CollectionIndex = {
      title: collectionTitle,
      docs: prepared.map((p) => ({ name: p.name, title: p.title, ext: p.ext })),
    };
    await Promise.all(prepared.map((p, i) =>
      env.BUCKET.put(`${base}/${i + 1}.${p.ext}`, p.content, { httpMetadata: { contentType: ct(p.ext) } })
    ));
    await env.BUCKET.put(`${base}/index.json`, JSON.stringify(index),
      { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    return { objectKey: `${base}/index.json`, docsResp: prepared.map((p, i) => ({ index: i + 1, title: p.title })) };
  }
  const p = prepared[0];
  const key = version === 1 ? `pages/${slug}.${p.ext}` : `pages/${slug}.v${version}.${p.ext}`;
  await env.BUCKET.put(key, p.content, { httpMetadata: { contentType: ct(p.ext) } });
  return { objectKey: key };
}

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
  // 弃置即死:已过期的链接不可再更新/续期,只能重新发布(拿新链接)
  if (page.expires_at && page.expires_at < now()) return json({ error: "expired" }, 410);
  const who = await mutateRole(page, request, env);
  if (who === "none") return json({ error: "forbidden" }, 403);
  const isOwner = who === "owner";

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const sets: string[] = [];
  const args: unknown[] = [];

  // 内容更新(版本化):html/markdown 单篇,或 files[] 合集;每次升一版,旧版保留
  const pageIsCollection = page.object_key.endsWith("/index.json");
  const wantCollectionUpdate = Array.isArray((body as any)?.files);
  const picked = wantCollectionUpdate ? null : pickContent(body);

  if (picked || wantCollectionUpdate) {
    // 类型必须一致:单页↔单页、合集↔合集
    if (pageIsCollection !== wantCollectionUpdate) return json({ error: "content_type_mismatch" }, 400);

    // 准备并扫描新内容
    const newDocs: PreparedDoc[] = [];
    if (wantCollectionUpdate) {
      const files = (body as any).files;
      const maxDocs = Number(isOwner ? env.MAX_DOCS : env.ANON_MAX_DOCS);
      if (files.length < 2) return json({ error: "collection_too_few" }, 400);
      if (files.length > maxDocs) return json({ error: "too_many_docs", maxDocs }, 400);
      for (const f of files) {
        const p = prepareDoc(f, isOwner ? "owner" : null, newDocs.length + 1);
        if ("error" in p) return json({ error: p.error, file: p.name }, p.status);
        newDocs.push(p);
      }
    } else {
      // 单页:md/html 类型需与原页面一致
      const pageExt = page.object_key.endsWith(".md") ? "md" : "html";
      if (picked!.ext !== pageExt) return json({ error: "content_type_mismatch" }, 400);
      const p = prepareDoc(body, isOwner ? "owner" : null, 1);
      if ("error" in p) return json({ error: p.error }, p.status);
      newDocs.push(p);
    }

    const totalSize = newDocs.reduce((a, d) => a + d.size, 0);
    const maxSize = Number(
      wantCollectionUpdate
        ? (isOwner ? env.COLLECTION_MAX_SIZE_BYTES : env.ANON_MAX_SIZE_BYTES)
        : (isOwner ? env.MAX_SIZE_BYTES : env.ANON_MAX_SIZE_BYTES)
    );
    if (totalSize > maxSize) return json({ error: "too_large", maxBytes: maxSize }, 413);

    const nextVersion = page.version + 1;
    const collTitle = wantCollectionUpdate
      ? (typeof body.title === "string" && body.title.trim() ? body.title.slice(0, 200) : (page.filename || "合集"))
      : "";
    const written = await writeContentVersion(env, slug, nextVersion, wantCollectionUpdate, newDocs, collTitle);
    const ts = now();
    await env.DB.prepare(
      "INSERT INTO versions (slug, version, object_key, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(slug, nextVersion, written.objectKey, totalSize, ts).run();
    sets.push("object_key = ?", "size_bytes = ?", "version = ?", "updated_at = ?");
    args.push(written.objectKey, totalSize, nextVersion, ts);
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

  // 续期是登录专属:匿名链接一次性、到期即消失(想保命→登录)。匿名传 expiresIn 直接拒。
  if (typeof body.expiresIn === "number" || body.expiresIn === null) {
    if (!isOwner) return json({ error: "renew_requires_login" }, 403);
    const maxTtl = Number(env.OWNER_MAX_TTL);
    const reqTtl = typeof body.expiresIn === "number" ? body.expiresIn : maxTtl;
    const ttl = Math.min(Math.max(reqTtl, 60), maxTtl);
    sets.push("expires_at = ?"); args.push(now() + ttl);
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

  // 清理所有版本对象:合集在 pages/<slug>/ 前缀下(含各 vN 目录);单页在 pages/<slug>. 前缀下(含 .vN.)
  for (const prefix of [`pages/${slug}/`, `pages/${slug}.`]) {
    const listed = await env.BUCKET.list({ prefix });
    await Promise.all(listed.objects.map((o) => env.BUCKET.delete(o.key)));
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
    version: page.version,
    updatedAt: page.updated_at ? new Date(page.updated_at * 1000).toISOString() : null,
  });
}

// ---- GET /pages/:slug/versions ----（版本历史）
async function listVersions(slug: string, request: Request, env: Env): Promise<Response> {
  const page = await getPage(env, slug);
  if (!page || page.status !== "active") return json({ error: "not_found" }, 404);
  // 版本历史/回滚是登录专属;匿名仍可覆盖更新内容(见 patchPage),只是不能翻历史/回滚
  if ((await mutateRole(page, request, env)) !== "owner") return json({ error: "login_required" }, 403);
  const { results } = await env.DB.prepare(
    "SELECT version, size_bytes, created_at FROM versions WHERE slug = ? ORDER BY version DESC"
  ).bind(slug).all();
  return json({ current: page.version, versions: results });
}

// ---- POST /pages/:slug/versions/:v/restore ----（回滚到某版:升为新版,复用旧对象）
async function restoreVersion(slug: string, v: number, request: Request, env: Env): Promise<Response> {
  const page = await getPage(env, slug);
  if (!page || page.status !== "active") return json({ error: "not_found" }, 404);
  if ((await mutateRole(page, request, env)) !== "owner") return json({ error: "login_required" }, 403);
  const row = await env.DB.prepare(
    "SELECT object_key, size_bytes FROM versions WHERE slug = ? AND version = ?"
  ).bind(slug, v).first<{ object_key: string; size_bytes: number }>();
  if (!row) return json({ error: "version_not_found" }, 404);

  const nextVersion = page.version + 1;
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO versions (slug, version, object_key, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(slug, nextVersion, row.object_key, row.size_bytes, ts).run();
  await env.DB.prepare(
    "UPDATE pages SET object_key = ?, size_bytes = ?, version = ?, updated_at = ? WHERE slug = ?"
  ).bind(row.object_key, row.size_bytes, nextVersion, ts, slug).run();
  return json({ ok: true, slug, version: nextVersion, restoredFrom: v });
}

// ============================ 访问人（每人一链 / 多口令） ============================

interface GrantRow {
  id: string; slug: string; label: string | null;
  password_hash: string; password_salt: string;
  created_at: number; revoked: number; hits: number; last_seen_at: number | null;
}

/** 4 位随机数字密码 */
function randomPin(len = 4): string {
  const b = crypto.getRandomValues(new Uint8Array(len));
  let s = ""; for (const x of b) s += x % 10; return s;
}

async function hasActiveGrants(env: Env, slug: string): Promise<boolean> {
  const r = await env.DB.prepare("SELECT 1 FROM grants WHERE slug = ? AND revoked = 0 LIMIT 1").bind(slug).first();
  return !!r;
}
function getGrant(env: Env, id: string): Promise<GrantRow | null> {
  return env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(id).first<GrantRow>();
}
/** 逐个比对未撤销访问人的密码,命中返回其 id */
async function matchGrant(env: Env, slug: string, pw: string): Promise<string | null> {
  const { results } = await env.DB.prepare(
    "SELECT id, password_hash, password_salt FROM grants WHERE slug = ? AND revoked = 0"
  ).bind(slug).all<{ id: string; password_hash: string; password_salt: string }>();
  for (const g of results) {
    if (await verifyPassword(pw, g.password_hash, g.password_salt)) return g.id;
  }
  return null;
}

// ---- POST /pages/:slug/grants ----（创建访问人,返回一次性密码）
async function createGrant(slug: string, request: Request, env: Env): Promise<Response> {
  const page = await getPage(env, slug);
  if (!page || page.status !== "active") return json({ error: "not_found" }, 404);
  // 每人一链是登录专属:匿名页面无 owner,拿不到这个能力(鼓励登录)
  if ((await mutateRole(page, request, env)) !== "owner") return json({ error: "login_required" }, 403);

  let body: any = {};
  try { body = await request.json(); } catch { /* 允许空 body */ }
  const label = typeof body.label === "string" ? body.label.slice(0, 100) : null;
  const password = typeof body.password === "string" && body.password !== "" ? body.password : randomPin();
  const { hash, salt } = await hashPassword(password);
  const id = randomToken(9);

  await env.DB.prepare(
    `INSERT INTO grants (id, slug, label, password_hash, password_salt, created_at, revoked, hits)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0)`
  ).bind(id, slug, label, hash, salt, now()).run();

  return json({ id, label, password, url: `https://${slug}.${env.USERCONTENT_DOMAIN}` });
}

// ---- GET /pages/:slug/grants ----（列出访问人,不含密码）
async function listGrants(slug: string, request: Request, env: Env): Promise<Response> {
  const page = await getPage(env, slug);
  if (!page || page.status !== "active") return json({ error: "not_found" }, 404);
  if ((await mutateRole(page, request, env)) !== "owner") return json({ error: "login_required" }, 403);
  const { results } = await env.DB.prepare(
    `SELECT id, label, created_at, revoked, hits, last_seen_at
     FROM grants WHERE slug = ? ORDER BY created_at`
  ).bind(slug).all();
  return json({ grants: results });
}

// ---- DELETE /pages/:slug/grants/:id ----（撤销,软删保留统计）
async function revokeGrant(slug: string, id: string, request: Request, env: Env): Promise<Response> {
  const page = await getPage(env, slug);
  if (!page || page.status !== "active") return json({ error: "not_found" }, 404);
  if ((await mutateRole(page, request, env)) !== "owner") return json({ error: "login_required" }, 403);
  await env.DB.prepare("UPDATE grants SET revoked = 1 WHERE id = ? AND slug = ?").bind(id, slug).run();
  return json({ ok: true });
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

  // 密码网关：共享密码 + 多个"访问人"独立密码
  const hasPagePw = !!(page.password_hash && page.password_salt);
  const gated = hasPagePw || (await hasActiveGrants(env, slug));
  let attributedGrantId = ""; // "" = 共享密码/无归因;非空 = 某访问人
  if (gated) {
    const cookieName = `hs_${slug}`;
    const cookie = readCookie(request, cookieName);
    let authed = false;

    if (cookie) {
      const gid = await verifyCookie(env.COOKIE_SIGNING_SECRET, slug, cookie);
      if (gid === "") {
        authed = true;
      } else if (gid) {
        // 访问人 Cookie:确认该访问人仍有效(撤销后即使持旧 Cookie 也被挡)
        const g = await getGrant(env, gid);
        if (g && g.slug === slug && g.revoked === 0) { authed = true; attributedGrantId = gid; }
      }
    }

    if (!authed && request.method === "POST") {
      // 防暴力破解：同一 IP 对同一页面 15 分钟内最多失败 10 次
      const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
      const attemptKey = `pw:${ip}:${slug}`;
      const failed = Number((await env.RATELIMIT.get(attemptKey)) ?? "0");
      if (failed >= 10) return htmlResp(lockedPage(), 429);

      const form = await request.formData();
      const pw = String(form.get("password") ?? "");
      let matched: string | null = null;
      if (hasPagePw && (await verifyPassword(pw, page.password_hash!, page.password_salt!))) {
        matched = ""; // 共享密码
      } else {
        matched = await matchGrant(env, slug, pw); // 访问人密码 → 其 id
      }
      if (matched !== null) {
        const exp = now() + 24 * 3600; // Cookie 24h 有效
        const value = await signCookie(env.COOKIE_SIGNING_SECRET, slug, matched, exp);
        const back = new URL(request.url).pathname || "/"; // 深链验密后直达原路径
        const headers = new Headers({ Location: back });
        headers.append(
          "Set-Cookie",
          `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
        );
        return new Response(null, { status: 303, headers });
      }
      await env.RATELIMIT.put(attemptKey, String(failed + 1), { expirationTtl: 900 });
      return htmlResp(passwordPage(true, pickLang(request), page.expires_at), 401);
    }
    if (!authed) return htmlResp(passwordPage(false, pickLang(request), page.expires_at), 401);
  }

  // 计数（异步，不阻塞响应）:总量 + 按访问人归因
  ctx.waitUntil(
    env.DB.prepare("UPDATE pages SET hits = hits + 1 WHERE slug = ?").bind(slug).run()
  );
  if (attributedGrantId) {
    ctx.waitUntil(
      env.DB.prepare("UPDATE grants SET hits = hits + 1, last_seen_at = ? WHERE id = ? AND slug = ?")
        .bind(now(), attributedGrantId, slug).run()
    );
  }

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
    const updated = page.version > 1 && page.updated_at ? page.updated_at : null;
    return htmlResp(readingPage(mdTitle(md, page.filename), article, undefined, updated), 200);
  }

  return new Response(obj.body, { status: 200, headers: securityHeaders() });
}

/** 合集分发：docPath "/" → 目录页；"/<n>" → 第 n 篇 */
async function serveCollection(env: Env, page: PageRow, docPath: string): Promise<Response> {
  const idxObj = await env.BUCKET.get(page.object_key);
  if (!idxObj) return htmlResp(notFoundPage(), 404);
  const index = JSON.parse(await idxObj.text()) as CollectionIndex;
  const navDocs = index.docs.map((d, i) => ({ index: i + 1, title: d.title }));
  // 篇目与 index.json 同目录(v1: pages/<slug>/;vN: pages/<slug>/v<n>/)
  const dir = page.object_key.replace(/index\.json$/, "");
  const updated = page.version > 1 && page.updated_at ? page.updated_at : null;

  const path = docPath.replace(/\/+$/, "") || "/";
  if (path === "/") {
    const date = new Date(page.created_at * 1000).toISOString().slice(0, 10);
    let meta = `${index.docs.length} 篇 · ${date} 分享`;
    if (updated) meta += ` · 更新于 ${new Date(updated * 1000).toISOString().slice(0, 10)}`;
    return htmlResp(tocPage(index.title, navDocs, meta), 200);
  }

  const m = path.match(/^\/(\d+)$/);
  if (!m) return htmlResp(notFoundPage(), 404);
  const n = Number(m[1]);
  if (n < 1 || n > index.docs.length) return htmlResp(notFoundPage(), 404);

  const doc = index.docs[n - 1];
  const obj = await env.BUCKET.get(`${dir}${n}.${doc.ext}`);
  if (!obj) return htmlResp(notFoundPage(), 404);

  if (doc.ext === "md") {
    const article = await marked.parse(await obj.text(), { gfm: true, async: true });
    const nav: CollectionNav = { collectionTitle: index.title, docs: navDocs, current: n };
    return htmlResp(readingPage(doc.title, article, nav, updated), 200);
  }
  // html 篇目:保留原样,注入一个 Shadow DOM 隔离的悬浮导航(目录+翻页,不影响用户页面)
  const nav: CollectionNav = { collectionTitle: index.title, docs: navDocs, current: n };
  return new Response(injectCollectionNav(await obj.text(), nav), { status: 200, headers: securityHeaders() });
}

function htmlResp(body: string, status: number): Response {
  return new Response(body, { status, headers: securityHeaders() });
}

/** 第一方埋点:GET /e?n=<事件>&l=<语言> → 聚合计数入 D1。只收白名单事件,无 PII */
async function recordEvent(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const noStore = { "Cache-Control": "no-store", "Content-Type": "text/plain" };
  const n = url.searchParams.get("n") || "";
  if (!["pv", "install", "try", "gh", "vsx"].includes(n)) return new Response(null, { status: 204, headers: noStore });
  const l = url.searchParams.get("l");
  const lang = l === "zh" || l === "en" ? l : "";
  const day = new Date().toISOString().slice(0, 10);
  ctx.waitUntil(
    env.DB.prepare(
      "INSERT INTO metrics (day, name, lang, count) VALUES (?, ?, ?, 1) ON CONFLICT(day, name, lang) DO UPDATE SET count = count + 1"
    ).bind(day, n, lang).run()
  );
  return new Response(null, { status: 204, headers: noStore });
}

/** 品牌静态资源(og 卡片 / favicon),存于 R2 assets/ 前缀,长缓存 */
async function serveBrandAsset(path: string, env: Env): Promise<Response | null> {
  const map: Record<string, string> = {
    "/og-card.png": "assets/og-card.png",
    "/favicon.ico": "assets/favicon.ico",
  };
  const key = map[path];
  if (!key) return null;
  const obj = await env.BUCKET.get(key);
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

/** 选择语言:英文默认;?lang=zh/en 显式覆盖,否则看浏览器 Accept-Language */
function pickLang(request: Request): "en" | "zh" {
  const q = new URL(request.url).searchParams.get("lang");
  if (q === "zh" || q === "en") return q;
  const al = (request.headers.get("Accept-Language") || "").toLowerCase();
  return al.startsWith("zh") ? "zh" : "en";
}

/** 落地页响应:英文默认;?lang=zh 或浏览器 Accept-Language 为中文则出中文 */
function landingResp(request: Request): Response {
  const lang = pickLang(request);
  return new Response(landingPage(lang), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "public, max-age=60",
      "Vary": "Accept-Language",
    },
  });
}

const siteHtml = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" } });

/** 法务/举报页(隐私、条款、举报)。命中返回响应,否则 null */
async function serveSitePage(path: string, request: Request, env: Env): Promise<Response | null> {
  if (path === "/privacy") return siteHtml(privacyPage());
  if (path === "/terms") return siteHtml(termsPage());
  if (path === "/report") {
    if (request.method === "GET") {
      const pre = new URL(request.url).searchParams.get("slug") || "";
      return siteHtml(reportPage(pre));
    }
    if (request.method === "POST") {
      const form = await request.formData();
      const raw = String(form.get("slug") ?? "").trim();
      // 从链接或短码中抽出 slug
      const m = raw.match(/([a-z0-9]{4,})(?:\.[a-z0-9.-]+)?\/?$/i) || raw.match(/^([a-z0-9]+)$/i);
      const slug = m ? m[1].toLowerCase() : (raw ? raw.slice(0, 200) : null);
      const reason = String(form.get("reason") ?? "other").slice(0, 40);
      const detail = String(form.get("detail") ?? "").slice(0, 2000);
      const reporter = String(form.get("reporter") ?? "").slice(0, 200);
      const ipHash = await sha256b64(request.headers.get("CF-Connecting-IP") || "0.0.0.0");
      await env.DB.prepare(
        `INSERT INTO reports (id, slug, reason, detail, reporter, ip_hash, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`
      ).bind(randomToken(9), slug, reason, detail, reporter || null, ipHash, now()).run();
      return siteHtml(reportPage("", true));
    }
  }
  return null;
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
