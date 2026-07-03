// HTML Share —— Cloudflare Worker
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
import { passwordPage, notFoundPage, lockedPage } from "./html";

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
      return servePage(slug, request, env, ctx);
    }
    // dev 便利：/p/<slug> 也提供页面
    if (url.pathname.startsWith("/p/")) {
      return servePage(url.pathname.slice(3), request, env, ctx);
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

  const pageMatch = path.match(/^\/pages\/([A-Za-z0-9]+)$/);
  if (pageMatch) {
    const slug = pageMatch[1];
    if (request.method === "PATCH") return patchPage(slug, request, env);
    if (request.method === "DELETE") return deletePage(slug, request, env);
  }

  if (path === "/pages" && request.method === "GET") return listPages(request, env);

  if (path === "/" || path === "/health") return json({ ok: true, service: "html-share" });

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

  const html: unknown = body?.html;
  if (typeof html !== "string" || html.trim() === "") {
    return json({ error: "missing_html" }, 400);
  }

  // 体积上限：匿名比登录更小
  const maxSize = Number(ownerId ? env.MAX_SIZE_BYTES : env.ANON_MAX_SIZE_BYTES);
  const size = new TextEncoder().encode(html).length;
  if (size > maxSize) return json({ error: "too_large", maxBytes: maxSize }, 413);

  if (isSuspicious(html)) return json({ error: "content_blocked" }, 422);
  // 匿名内容从严：命中钓鱼特征直接拒绝
  if (!ownerId && isPhishy(html)) return json({ error: "content_blocked" }, 422);

  // 全局匿名日配额熔断：兜住 R2/D1 成本
  if (!ownerId && !(await allowGlobalBudget(size, env))) {
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

  // 生成唯一 slug 并写 R2
  const slug = await uniqueSlug(env);
  const objectKey = `pages/${slug}.html`;
  await env.BUCKET.put(objectKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });

  // 匿名编辑凭据
  const editToken = ownerId ? null : randomToken();
  const editTokenHash = editToken ? await sha256b64(editToken) : null;

  await env.DB.prepare(
    `INSERT INTO pages (slug, owner_id, edit_token_hash, object_key, filename,
       password_hash, password_salt, created_at, expires_at, size_bytes, hits, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active')`
  ).bind(
    slug, ownerId, editTokenHash, objectKey,
    typeof body.filename === "string" ? body.filename.slice(0, 200) : null,
    passwordHash, passwordSalt, now(), expiresAt, size
  ).run();

  return json({
    slug,
    url: `https://${slug}.${env.USERCONTENT_DOMAIN}`,
    expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    passwordProtected: !!passwordHash,
    editToken,
  });
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

  if (typeof body.html === "string" && body.html !== "") {
    // 匿名不允许覆盖内容：防止先发正常页面过扫描、再整体换成钓鱼页
    if (!isOwner) return json({ error: "content_update_requires_login" }, 403);
    if (isSuspicious(body.html)) return json({ error: "content_blocked" }, 422);
    const size = new TextEncoder().encode(body.html).length;
    if (size > Number(env.MAX_SIZE_BYTES)) return json({ error: "too_large" }, 413);
    await env.BUCKET.put(page.object_key, body.html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
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

  await env.BUCKET.delete(page.object_key);
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

async function servePage(slug: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        const headers = new Headers({ Location: "/" });
        headers.append(
          "Set-Cookie",
          `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
        );
        return new Response(null, { status: 303, headers });
      }
      await env.RATELIMIT.put(attemptKey, String(failed + 1), { expirationTtl: 900 });
      return htmlResp(passwordPage(slug, true), 401);
    } else {
      return htmlResp(passwordPage(slug, false), 401);
    }
  }

  // 计数（异步，不阻塞响应）
  ctx.waitUntil(
    env.DB.prepare("UPDATE pages SET hits = hits + 1 WHERE slug = ?").bind(slug).run()
  );

  const obj = await env.BUCKET.get(page.object_key);
  if (!obj) return htmlResp(notFoundPage(), 404);

  return new Response(obj.body, { status: 200, headers: securityHeaders() });
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
