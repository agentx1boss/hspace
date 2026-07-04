// GitHub OAuth 登录 + 会话 —— 路由仅挂在 hspace. 落地域
// 流程:/auth/github 跳 GitHub → /auth/github/callback 换 token、upsert users、
// 签发 30 天 HMAC 签名 Cookie(无 session 表;登出即删 Cookie,无服务端吊销,已知取舍)
// Cookie 用 __Host- 前缀:用户内容子域与登录域同注册域,防其种 domain cookie 冒充会话
import { randomToken, signSession, verifySession } from "./crypto";
import type { Env } from "./index";

const SESSION_COOKIE = "__Host-hs_sess";
const STATE_COOKIE = "__Host-hs_oauth_state";
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

const clearState = `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// GET /auth/github —— 生成防 CSRF 的 state 存短时 Cookie,跳 GitHub 授权页(scope 为空,只取公开身份)
function startOAuth(url: URL, env: Env): Response {
  // state 随机值防 CSRF;插件入口(?from=vscode)加 ".v" 后缀,登录成功后把提示条参数带回 console
  const state = randomToken(16) + (url.searchParams.get("from") === "vscode" ? ".v" : "");
  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  auth.searchParams.set("redirect_uri", callbackUrl(url));
  auth.searchParams.set("state", state);
  return redirect(auth.toString(), [
    `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
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
  const dest = state.endsWith(".v") ? "/console?from=vscode" : "/console";
  return redirect(dest, [
    `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`,
    clearState,
  ]);
}

// POST /auth/logout —— 删 Cookie 回落地页
function logout(): Response {
  return redirect("/", [`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`]);
}

/** 请求是否带会话 Cookie(不校验签名;用于区分"未登录"与"会话无效/过期") */
export function hasSessionCookie(request: Request): boolean {
  return readCookie(request, SESSION_COOKIE) !== null;
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
