# GitHub 登录(web 端)实施计划 — Phase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户能在 `hspace.zhanjian.space/console` 用 GitHub 登录,自动获得 API key(明文只展示一次),并能重新生成。

**Architecture:** GitHub OAuth(authorization code flow)→ upsert `users` 表 → 签发 30 天 HMAC 签名 cookie(无 session 表)。`authOwner()` 扩展为「Bearer 或同源 session cookie」双凭据。console v1 只有账户区(登录态 + API key),页面管理属 Phase 2。

**Tech Stack:** Cloudflare Worker(TS)、D1、Web Crypto(项目现有,零新依赖)。

**Spec:** [2026-07-04-github-login-console-design.md](../specs/2026-07-04-github-login-console-design.md)

**验证方式说明:** 本项目无测试框架(约定是 `npx tsc --noEmit` + 手工验证,见 CLAUDE.md)。每个任务以 tsc + `wrangler dev` 下的 curl 断言收尾;OAuth 全流程用本地 dev OAuth App + 浏览器走通,最后生产冒烟。

## 全局分期(本计划只覆盖 Phase 1)

- **Phase 1(本计划)**:schema、session、OAuth 路由、authOwner 扩展、`/me` 端点、console 账户区、部署
- **Phase 2**:console 页面管理(pages 列表/续期/删除 + grants + versions 行展开)——复用现有端点,纯前端 + 少量接线
- **Phase 3**:插件 `hspace.signIn` 命令 + 发版;落地页 Console 链接;operations.md 补 founder 迁移与 OAuth App 说明

---

### Task 1: `users` 表

**Files:**
- Modify: `backend/schema.sql`(文件末尾追加)

- [ ] **Step 1: 在 schema.sql 末尾追加建表语句**

```sql
-- 登录用户(GitHub OAuth):owner_id = 'gh:<github_numeric_id>'
CREATE TABLE IF NOT EXISTS users (
  owner_id      TEXT PRIMARY KEY,
  github_login  TEXT NOT NULL,      -- 展示用,每次登录刷新
  created_at    INTEGER NOT NULL,   -- epoch 秒
  last_login_at INTEGER NOT NULL
);
```

- [ ] **Step 2: 应用到本地 D1(后续任务的 curl 验证依赖它)**

Run: `cd backend && npm run db:init:local`
Expected: 输出 executed 无报错(全部 `CREATE TABLE IF NOT EXISTS`,幂等)

- [ ] **Step 3: 验证表存在**

Run: `cd backend && npx wrangler d1 execute html-share --local --command "SELECT name FROM sqlite_master WHERE name='users'"`
Expected: 结果含 `users`

- [ ] **Step 4: Commit**

```bash
git add backend/schema.sql
git commit -m "D1 新增 users 表(GitHub 登录身份)"
```

---

### Task 2: session 签名/校验(crypto.ts)

**Files:**
- Modify: `backend/src/crypto.ts`(文件末尾追加,复用已有 `hmacKey`/`bufToB64`/`b64ToBytes`/`enc`)

- [ ] **Step 1: 在 crypto.ts 末尾追加两个函数**

```ts
/** 签发登录会话 Cookie 值:"<ownerId>.<exp>.<sig>"(ownerId 形如 gh:123,不含 ".") */
export async function signSession(secret: string, ownerId: string, expEpoch: number): Promise<string> {
  const payload = `${ownerId}.${expEpoch}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${bufToB64(sig)}`;
}

/** 校验会话 Cookie:签名有效且未过期返回 ownerId,否则 null */
export async function verifySession(secret: string, cookie: string): Promise<string | null> {
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [ownerId, exp, sig] = parts;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, b64ToBytes(sig), enc.encode(`${ownerId}.${exp}`));
  return ok ? ownerId : null;
}
```

(与现有 `signCookie`/`verifyCookie` 同一套模式;base64 签名不含 `.`,split 安全。)

- [ ] **Step 2: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 无输出(通过)

- [ ] **Step 3: Commit**

```bash
git add backend/src/crypto.ts
git commit -m "crypto:登录会话 Cookie 的签发与校验"
```

---

### Task 3: OAuth 路由(auth.ts,新文件)

**Files:**
- Create: `backend/src/auth.ts`
- Modify: `backend/src/index.ts`(删除本地 `readCookie`,改从 auth.ts 导入——见 Step 2)

- [ ] **Step 1: 创建 `backend/src/auth.ts`,完整内容如下**

```ts
// GitHub OAuth 登录 + 会话 —— 路由仅挂在 hspace. 落地域
// 流程:/auth/github 跳 GitHub → /auth/github/callback 换 token、upsert users、
// 签发 30 天 HMAC 签名 Cookie(无 session 表;登出即删 Cookie,无服务端吊销,已知取舍)
import { randomToken, signSession, verifySession } from "./crypto";
import type { Env } from "./index";

const SESSION_COOKIE = "hs_sess";
const STATE_COOKIE = "hs_oauth_state";
const SESSION_TTL = 30 * 24 * 3600; // 30 天

const now = () => Math.floor(Date.now() / 1000);

/** hspace. 域上的 auth 路由分发。命中返回响应,否则 null */
export function handleAuth(url: URL, request: Request, env: Env): Promise<Response> | Response | null {
  if (url.pathname === "/auth/github" && request.method === "GET") return startOAuth(url, env);
  if (url.pathname === "/auth/github/callback" && request.method === "GET") return oauthCallback(url, request, env);
  if (url.pathname === "/auth/logout" && request.method === "POST") return logout();
  return null;
}

const callbackUrl = (url: URL) => `${url.protocol}//${url.host}/auth/github/callback`;

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

const clearState = `${STATE_COOKIE}=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// GET /auth/github —— 生成防 CSRF 的 state 存短时 Cookie,跳 GitHub 授权页(scope 为空,只取公开身份)
function startOAuth(url: URL, env: Env): Response {
  const state = randomToken(16);
  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  auth.searchParams.set("redirect_uri", callbackUrl(url));
  auth.searchParams.set("state", state);
  return redirect(auth.toString(), [
    `${STATE_COOKIE}=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  ]);
}

// GET /auth/github/callback —— 校验 state → 换 token → 取 GitHub 用户 → upsert → 签发会话
async function oauthCallback(url: URL, request: Request, env: Env): Promise<Response> {
  const fail = () => redirect("/console?error=auth_failed", [clearState]);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = readCookie(request, STATE_COOKIE);
  if (!code || !state || !saved || state !== saved) return fail();

  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(url),
    }),
  });
  if (!tokenResp.ok) return fail();
  const accessToken = ((await tokenResp.json()) as { access_token?: string }).access_token;
  if (!accessToken) return fail();

  const userResp = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "hspace", // GitHub API 必需
    },
  });
  if (!userResp.ok) return fail();
  const ghUser = (await userResp.json()) as { id: number; login: string };
  if (typeof ghUser.id !== "number" || typeof ghUser.login !== "string") return fail();

  const ownerId = `gh:${ghUser.id}`;
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO users (owner_id, github_login, created_at, last_login_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET github_login = excluded.github_login, last_login_at = excluded.last_login_at`
  ).bind(ownerId, ghUser.login, ts, ts).run();

  const session = await signSession(env.SESSION_SECRET, ownerId, ts + SESSION_TTL);
  return redirect("/console", [
    `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`,
    clearState,
  ]);
}

// POST /auth/logout —— 删 Cookie 回落地页
function logout(): Response {
  return redirect("/", [`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`]);
}

/** 从请求读取并校验登录会话,返回 owner_id 或 null */
export async function sessionOwner(request: Request, env: Env): Promise<string | null> {
  const cookie = readCookie(request, SESSION_COOKIE);
  if (!cookie) return null;
  return verifySession(env.SESSION_SECRET, cookie);
}

/** 读取指定名字的 Cookie(从 index.ts 迁来,密码门与会话共用) */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
```

- [ ] **Step 2: index.ts 删除本地 `readCookie`,改为导入**

删除 index.ts 中的整个 `readCookie` 函数(位于「工具」区,`function readCookie(request: Request, name: string): string | null { ... }`),并在文件头部 import 区加:

```ts
import { handleAuth, sessionOwner, readCookie } from "./auth";
```

(`sessionOwner` 本任务还未使用,Task 4 会用到;auth.ts 对 index.ts 只有 `import type { Env }`,类型引用编译期擦除,无运行时循环依赖。)

- [ ] **Step 3: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 报错仅可能是 `Env` 缺 `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/`SESSION_SECRET` 字段——这是预期的,Task 4 Step 1 补上后消除。若报其他错误需先修复。

- [ ] **Step 4: Commit(与 Task 4 合并提交亦可,若此时 tsc 未过则顺延到 Task 4 一起提交)**

```bash
git add backend/src/auth.ts backend/src/index.ts
git commit -m "GitHub OAuth 登录路由 + 签名会话(auth.ts)"
```

---

### Task 4: index.ts 接线(Env、路由、authOwner 双凭据)

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/wrangler.toml`(密钥注释)
- Create: `backend/.dev.vars`(本地开发假值,不提交)

- [ ] **Step 1: Env 接口补三个 secret 字段**

在 `COOKIE_SIGNING_SECRET: string;` 之后加:

```ts
  SESSION_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
```

- [ ] **Step 2: hspace. 落地域分支加 auth 路由 + API fallthrough**

把 fetch handler 中的:

```ts
    if (host === "hspace." + env.USERCONTENT_DOMAIN) {
      const asset = await serveBrandAsset(url.pathname, env);
      if (asset) return asset;
      const site = await serveSitePage(url.pathname, request, env);
      if (site) return site;
      return landingResp(request);
    }
```

替换为:

```ts
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
```

**行为变化(有意为之)**:hspace 域上未知路径从「返回落地页」变为「JSON 404」。落地页仍在 `/` 正常服务。

- [ ] **Step 3: authOwner 扩展为双凭据**

把现有 `authOwner` 整函数替换为:

```ts
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
```

- [ ] **Step 4: wrangler.toml 密钥注释区补两行**

在 `# COOKIE_SIGNING_SECRET ...` 下加:

```toml
# SESSION_SECRET         登录会话 Cookie 签名(随机长字符串)
# GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET  GitHub OAuth App 凭据
```

- [ ] **Step 5: 创建 `backend/.dev.vars`(本地假值)并确认 gitignore**

```
COOKIE_SIGNING_SECRET=dev-cookie-secret
SESSION_SECRET=dev-session-secret
GITHUB_CLIENT_ID=dev-client-id
GITHUB_CLIENT_SECRET=dev-client-secret
```

Run: `git check-ignore backend/.dev.vars && echo ignored`
Expected: `ignored`。若未被忽略,在 `.gitignore` 加一行 `.dev.vars` 并纳入本任务提交。

- [ ] **Step 6: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 无输出(Task 3 的 Env 报错此时应消除)

- [ ] **Step 7: wrangler dev 下 curl 验证 OAuth 入口与失败路径**

Run: `cd backend && npx wrangler dev`(后台),然后:

```bash
curl -si http://localhost:8787/auth/github | grep -iE "^(HTTP|Location|Set-Cookie)"
```
Expected: `302`;`Location: https://github.com/login/oauth/authorize?client_id=dev-client-id&redirect_uri=...%2Fauth%2Fgithub%2Fcallback&state=<32hex>`;`Set-Cookie: hs_oauth_state=...Max-Age=600`

```bash
curl -si "http://localhost:8787/auth/github/callback?code=x&state=y" | grep -iE "^(HTTP|Location)"
```
Expected: `302` + `Location: /console?error=auth_failed`(无 state cookie → 拒绝)

```bash
curl -si http://localhost:8787/ | head -3
```
Expected: `200` + 落地页 HTML(landing 回归不受影响;dev 下 host 不是 hspace 子域,走 handleApi 的 `path === "/"` 分支)

- [ ] **Step 8: Commit**

```bash
git add backend/src/index.ts backend/wrangler.toml .gitignore
git commit -m "接线:hspace 域 auth 路由 + API fallthrough;authOwner 支持会话 Cookie"
```

---

### Task 5: `/me` 与 `/me/api-key` 端点

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: handleApi 中加两条路由**

在 `if (path === "/pages" && request.method === "GET") return listPages(request, env);` 之后加:

```ts
  if (path === "/me" && request.method === "GET") return me(request, env);
  if (path === "/me/api-key" && request.method === "POST") return regenerateApiKey(request, env);
```

- [ ] **Step 2: 在 `listPages` 函数后追加两个 handler**

```ts
// ---- GET /me ----(console:当前登录用户信息 + key 状态,不含 key 明文)
async function me(request: Request, env: Env): Promise<Response> {
  const ownerId = await authOwner(request, env);
  if (!ownerId) return json({ error: "unauthorized" }, 401);
  const user = await env.DB.prepare(
    "SELECT github_login FROM users WHERE owner_id = ?"
  ).bind(ownerId).first<{ github_login: string }>();
  const key = await env.DB.prepare(
    "SELECT created_at FROM api_keys WHERE owner_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1"
  ).bind(ownerId).first<{ created_at: number }>();
  return json({
    ownerId,
    githubLogin: user?.github_login ?? null,
    apiKey: key ? { createdAt: key.created_at } : null,
  });
}

// ---- POST /me/api-key ----(吊销旧 key、生成新 key;明文仅本次响应返回)
async function regenerateApiKey(request: Request, env: Env): Promise<Response> {
  const ownerId = await authOwner(request, env);
  if (!ownerId) return json({ error: "unauthorized" }, 401);
  const key = randomToken(24);
  const ts = now();
  await env.DB.prepare("UPDATE api_keys SET revoked = 1 WHERE owner_id = ?").bind(ownerId).run();
  await env.DB.prepare(
    "INSERT INTO api_keys (key_hash, owner_id, created_at) VALUES (?, ?, ?)"
  ).bind(await sha256b64(key), ownerId, ts).run();
  return json({ apiKey: key, createdAt: ts });
}
```

(openapi.ts **不**收录 `/me` 端点:它是 console 内部接口,凭 Cookie,不面向 API 消费者。)

- [ ] **Step 3: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 4: curl 端到端验证(伪造 dev 会话,绕过 GitHub)**

前置:wrangler dev 运行中、本地 D1 已 init(Task 1)。用 dev secret 铸一个合法会话 Cookie:

```bash
SESS=$(node -e '
const secret="dev-session-secret", owner="gh:1", exp=Math.floor(Date.now()/1000)+3600;
(async()=>{const enc=new TextEncoder();
const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
const sig=await crypto.subtle.sign("HMAC",key,enc.encode(owner+"."+exp));
console.log(owner+"."+exp+"."+Buffer.from(sig).toString("base64"));})()')
```

```bash
curl -s http://localhost:8787/me   # 无 Cookie
```
Expected: `{"error":"unauthorized"}`(401)

```bash
curl -s http://localhost:8787/me -H "Cookie: hs_sess=$SESS"   # 有 Cookie 但无来源头
```
Expected: `{"error":"unauthorized"}`(Origin/Referer 校验生效)

```bash
curl -s http://localhost:8787/me -H "Cookie: hs_sess=$SESS" -H "Referer: http://localhost:8787/console"
```
Expected: `{"ownerId":"gh:1","githubLogin":null,"apiKey":null}`(gh:1 未走过 OAuth,users 无行,属预期)

```bash
KEY=$(curl -s -X POST http://localhost:8787/me/api-key -H "Cookie: hs_sess=$SESS" \
  -H "Origin: http://localhost:8787" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).apiKey))')
curl -s http://localhost:8787/pages -H "Authorization: Bearer $KEY"
```
Expected: `{"pages":[]}`——**会话 Cookie 生成的 key 能走通既有 Bearer 链路,双凭据闭环**。

再跑一次 `POST /me/api-key` 后用旧 `$KEY` 请求 `/pages`,Expected: `{"error":"unauthorized"}`(旧 key 已吊销)。

- [ ] **Step 5: Commit**

```bash
git add backend/src/index.ts
git commit -m "console 端点:GET /me + POST /me/api-key(key 明文只返回一次)"
```

---

### Task 6: console 账户页(console.ts,新文件)

**Files:**
- Create: `backend/src/console.ts`
- Modify: `backend/src/index.ts`(挂路由)

- [ ] **Step 1: 创建 `backend/src/console.ts`,完整内容如下**

```ts
// Web console —— hspace.<domain>/console
// 自包含单页(内联 CSS/JS,不引外部资源,项目红线)。v1 只有账户区:
// 登录态 + API key(首次登录自动生成,明文服务端渲染,仅出现一次)。英文文案,zh 后置。
import { randomToken, sha256b64 } from "./crypto";
import { sessionOwner } from "./auth";
import type { Env } from "./index";

const now = () => Math.floor(Date.now() / 1000);

export async function serveConsole(url: URL, request: Request, env: Env): Promise<Response> {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store", // 页面可能含一次性明文 key
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  const ownerId = await sessionOwner(request, env);
  if (!ownerId) {
    return new Response(signedOutPage(url.searchParams.get("error")), { status: 200, headers });
  }

  const user = await env.DB.prepare(
    "SELECT github_login FROM users WHERE owner_id = ?"
  ).bind(ownerId).first<{ github_login: string }>();

  let freshKey: string | null = null;
  let keyRow = await env.DB.prepare(
    "SELECT created_at FROM api_keys WHERE owner_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1"
  ).bind(ownerId).first<{ created_at: number }>();
  if (!keyRow) {
    // 首次登录:自动生成 key,明文渲染进本次响应,之后只有哈希
    freshKey = randomToken(24);
    const ts = now();
    await env.DB.prepare(
      "INSERT INTO api_keys (key_hash, owner_id, created_at) VALUES (?, ?, ?)"
    ).bind(await sha256b64(freshKey), ownerId, ts).run();
    keyRow = { created_at: ts };
  }

  const html = consolePage({
    githubLogin: user?.github_login ?? ownerId,
    freshKey,
    keyCreatedAt: keyRow.created_at,
    fromVscode: url.searchParams.get("from") === "vscode",
  });
  return new Response(html, { status: 200, headers });
}

const ESC_MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC_MAP[c]);

// GitHub 官方 mark(16×16 单 path,内联 SVG)
const GH_ICON = `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

const STYLE = `<style>
*{box-sizing:border-box;margin:0}
body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;color:#1b1f24}
.wrap{max-width:640px;margin:0 auto;padding:40px 20px}
.center{display:flex;min-height:85vh;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border:1px solid #e3e6ea;border-radius:10px;padding:28px}
.login{text-align:center;width:360px;max-width:100%}
h1{font-size:20px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#666e77;margin:20px 0 8px}
.sub{color:#666e77;margin:6px 0 20px}
.bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.btn{font:inherit;padding:7px 14px;border:1px solid #cfd4da;border-radius:8px;background:#fff;cursor:pointer;text-decoration:none;color:inherit;display:inline-flex;align-items:center;gap:8px}
.btn:hover{background:#f0f2f4}
.btn.gh{background:#1b1f24;color:#fff;border-color:#1b1f24;justify-content:center;width:100%}
.btn.gh:hover{background:#32383f}
.btn.plain{border:none;background:none;color:#666e77}
.keyrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
code{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f0f2f4;padding:6px 10px;border-radius:6px;word-break:break-all}
.note{color:#666e77;font-size:13px;margin-top:8px}
.err{color:#c0392b;margin-bottom:14px}
.tip{background:#fff8e1;border:1px solid #f0e0a0;border-radius:8px;padding:10px 14px;margin-bottom:16px}
</style>`;

const shell = (inner: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Console · HSpace</title>
${STYLE}
</head>
<body>
${inner}
</body>
</html>`;

function signedOutPage(error: string | null): string {
  return shell(`<main class="center">
  <div class="card login">
    <h1>HSpace Console</h1>
    <p class="sub">Manage your API key and shared pages.</p>
    ${error ? `<p class="err">Sign-in failed. Please try again.</p>` : ""}
    <a class="btn gh" href="/auth/github">${GH_ICON} Sign in with GitHub</a>
  </div>
</main>`);
}

interface ConsoleData {
  githubLogin: string;
  freshKey: string | null;
  keyCreatedAt: number;
  fromVscode: boolean;
}

function consolePage(d: ConsoleData): string {
  const date = new Date(d.keyCreatedAt * 1000).toISOString().slice(0, 10);
  const keyBlock = d.freshKey
    ? `<div class="keyrow"><code id="key">${esc(d.freshKey)}</code><button class="btn" id="copy">Copy</button></div>
<p class="note">Save it now — it won't be shown again.</p>`
    : `<div class="keyrow"><code>••••••••••••••••••••</code><button class="btn" id="regen">Regenerate</button></div>
<p class="note">Created ${date}. Regenerating revokes the current key immediately.</p>`;

  return shell(`<main class="wrap">
  ${d.fromVscode ? `<div class="tip">Copy your API key below, then paste it back into the editor.</div>` : ""}
  <div class="bar">
    <h1>HSpace Console</h1>
    <form method="post" action="/auth/logout"><button class="btn plain">Sign out</button></form>
  </div>
  <div class="card">
    <h2>Account</h2>
    <p>Signed in as <b>${esc(d.githubLogin)}</b> (GitHub)</p>
    <h2>API key</h2>
    <div id="keyarea">${keyBlock}</div>
    <p class="note">Use it in the VS Code extension ("HSpace: Set API Key") or as <code>Authorization: Bearer &lt;key&gt;</code>.</p>
  </div>
</main>
<script>
(function () {
  var area = document.getElementById("keyarea");
  function bind() {
    var copy = document.getElementById("copy");
    if (copy) copy.onclick = function () {
      navigator.clipboard.writeText(document.getElementById("key").textContent).then(function () {
        copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1500);
      });
    };
    var regen = document.getElementById("regen");
    if (regen) regen.onclick = function () {
      if (!confirm("Regenerate API key? The current key stops working immediately.")) return;
      fetch("/me/api-key", { method: "POST" }).then(function (r) {
        if (r.status === 401) { location.reload(); return null; }
        return r.json();
      }).then(function (data) {
        if (!data) return;
        area.innerHTML = '<div class="keyrow"><code id="key"></code><button class="btn" id="copy">Copy</button></div>' +
          "<p class=\\"note\\">Save it now — it won't be shown again.</p>";
        document.getElementById("key").textContent = data.apiKey;
        bind();
      });
    };
  }
  bind();
})();
</script>`);
}
```

- [ ] **Step 2: index.ts 挂路由**

import 区加:

```ts
import { serveConsole } from "./console";
```

hspace 分支中 `const auth = await handleAuth(url, request, env);` / `if (auth) return auth;` 之后加:

```ts
      if (url.pathname === "/console") return serveConsole(url, request, env);
```

**dev 便利**:本地 host 不是 hspace 子域,console 走不到。在 `handleApi` 里 `if (path === "/health")` 之前加一行,让 localhost 也能打开:

```ts
  if (path === "/console" && request.method === "GET") return serveConsole(url, request, env);
```

- [ ] **Step 3: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 4: curl 验证三种渲染态**

(wrangler dev 运行中;`$SESS` 沿用 Task 5 Step 4 的铸造命令)

```bash
curl -s http://localhost:8787/console | grep -o "Sign in with GitHub"
```
Expected: `Sign in with GitHub`(未登录态)

```bash
curl -s "http://localhost:8787/console?error=auth_failed" | grep -o "Sign-in failed"
```
Expected: `Sign-in failed`

```bash
curl -s http://localhost:8787/console -H "Cookie: hs_sess=$SESS" | grep -oE "(Save it now|Regenerate)"
```
Expected: 首次 `Save it now`(自动生成 key 明文展示);再跑一次同命令,Expected: `Regenerate`(已有 key → 掩码态)。

```bash
curl -si http://localhost:8787/console | grep -i "cache-control"
```
Expected: `Cache-Control: no-store`

- [ ] **Step 5: 浏览器手工检查(可选但建议)**

打开 `http://localhost:8787/console`:未登录卡片样式正常;带伪造 Cookie(devtools 手动设 `hs_sess`)刷新后 Regenerate 按钮全流程可用(confirm → 新 key 展示 → Copy)。

- [ ] **Step 6: Commit**

```bash
git add backend/src/console.ts backend/src/index.ts
git commit -m "console 账户页:登录态 + API key 一次性展示/重新生成"
```

---

### Task 7: 真实 OAuth 本地走通(需要你操作 GitHub)

**Files:**
- Modify: `backend/.dev.vars`(换成真实 dev OAuth App 凭据)

- [ ] **Step 1(人工): 创建本地开发用 GitHub OAuth App**

https://github.com/settings/applications/new
- Application name: `HSpace (dev)`
- Homepage URL: `http://localhost:8787`
- Authorization callback URL: `http://localhost:8787/auth/github/callback`

生成 client secret,把 `backend/.dev.vars` 的 `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` 换成真实值,重启 wrangler dev。

- [ ] **Step 2: 浏览器全流程验证**

`http://localhost:8787/console` → Sign in with GitHub → GitHub 授权 → 跳回 `/console`:
- 首次:自动生成的 key 明文 + Copy 可用;`users` 表有 `gh:<你的id>` 行(`npx wrangler d1 execute html-share --local --command "SELECT * FROM users"`)
- 刷新:掩码态 + Regenerate
- Sign out → 回落地页,再访 /console 是未登录态
- 再登录:不新建用户,`last_login_at` 更新,key 保持不变(不重复生成)

---

### Task 8: 生产配置、部署与冒烟(需要你操作 GitHub / Cloudflare)

- [ ] **Step 1(人工): 创建生产 GitHub OAuth App**

同 Task 7,但:Homepage `https://hspace.zhanjian.space`,callback `https://hspace.zhanjian.space/auth/github/callback`,名字 `HSpace`。

- [ ] **Step 2(人工): 设置 Worker secrets**

```bash
cd backend
npx wrangler secret put GITHUB_CLIENT_ID      # 粘贴生产 client id
npx wrangler secret put GITHUB_CLIENT_SECRET  # 粘贴生产 client secret
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
```

- [ ] **Step 3: 应用 schema 到生产 D1**

```bash
cd backend && npx wrangler d1 execute html-share --remote --file=./schema.sql
```
Expected: executed 无报错(幂等)

- [ ] **Step 4: 合并部署**

分支合入 main(`backend/**` 变更触发 Deploy Backend),`gh run watch` 确认绿灯;或先 `npx wrangler deploy` 手动验证。

- [ ] **Step 5: 生产冒烟**

- `https://hspace.zhanjian.space/console` 浏览器完整走一遍 Task 7 Step 2 清单
- 用生成的 key:`curl -s https://html-share.kzhan.workers.dev/pages -H "Authorization: Bearer <key>"` → `{"pages":[]}`
- 回归:落地页 `/`、`/privacy`、任一内容页(密码门)、插件既有 Bearer 发布不受影响
- `curl -s https://hspace.zhanjian.space/health` → `{"ok":true,...}`(API fallthrough 生效)

- [ ] **Step 6: 收尾提交(如有 .dev.vars 示例或文档变更)并在 PR 描述记录「hspace 未知路径改为 JSON 404」的行为变化**
