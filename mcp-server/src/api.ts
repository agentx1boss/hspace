// HSpace API 客户端 —— MCP server(index.ts)与 CLI(cli.ts)共用这一份。
//
// 鉴权两条路:
//   · Bearer API Key(登录)—— 解锁 30 天可续、更大体积、每人一链、版本历史、列表
//   · X-Edit-Token(匿名发布时返回)—— 改/删/查回执自己那一页,不需要账户
// 没有第三条:密码是给读者开门的,不是给发布方鉴权的。

export const DEFAULT_API_BASE = "https://html-share.kzhan.workers.dev";

export function apiBase(): string {
  return (process.env.HSPACE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
}

export interface Auth {
  apiKey?: string;
  editToken?: string;
}

export interface PublishResult {
  slug: string;
  url: string;
  expiresAt: string | null;
  passwordProtected: boolean;
  editToken: string | null;
  docs?: { index: number; title: string }[];
}

export interface PageStats {
  slug: string;
  hits: number;
  createdAt: number;
  expiresAt: string | null;
  passwordProtected: boolean;
  isCollection: boolean;
}

export interface PageSummary {
  slug: string;
  filename: string | null;
  created_at: number;
  expires_at: number | null;
  hits: number;
  protected: number;
}

export interface Grant {
  id: string;
  label: string | null;
  created_at: number;
  revoked: number;
  hits: number;
  last_seen_at: number | null;
}

export interface VersionList {
  current: number;
  versions: { version: number; size_bytes: number; created_at: number }[];
}

/** 随机 4 位数字密码——私密分享是产品默认,客户端一律自动生成(不给「发个公开页」留快捷入口) */
export function randomPin(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** 天 → 秒。没有永久链接:钳在 [1, 30] 天,后端再按登录/匿名档二次钳制 */
export function expiryFromDays(days?: number): number | undefined {
  if (days === undefined) return undefined; // 用后端默认(匿名 7 天 / 登录 30 天)
  return Math.min(Math.max(1, Math.floor(days)), 30) * 86400;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code ? `${status} ${code}` : `HTTP ${status}`);
  }
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; auth?: Auth } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.auth?.apiKey) headers["Authorization"] = `Bearer ${init.auth.apiKey}`;
  if (init.auth?.editToken) headers["X-Edit-Token"] = init.auth.editToken;

  const res = await fetch(`${apiBase()}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, typeof data.error === "string" ? data.error : "");
  return data as T;
}

export const publish = (body: Record<string, unknown>, auth?: Auth) =>
  call<PublishResult>("/publish", { method: "POST", body, auth });

export const patchPage = (slug: string, body: Record<string, unknown>, auth: Auth) =>
  call<{ ok: boolean; slug: string; version?: number }>(`/pages/${slug}`, { method: "PATCH", body, auth });

export const deletePage = (slug: string, auth: Auth) =>
  call<{ ok: boolean }>(`/pages/${slug}`, { method: "DELETE", auth });

export const pageStats = (slug: string, auth: Auth) =>
  call<PageStats>(`/pages/${slug}/stats`, { auth });

export const listPages = (auth: Auth) => call<{ pages: PageSummary[] }>("/pages", { auth });

export const listVersions = (slug: string, auth: Auth) =>
  call<VersionList>(`/pages/${slug}/versions`, { auth });

export const restoreVersion = (slug: string, v: number, auth: Auth) =>
  call<{ ok: boolean; version: number; restoredFrom: number }>(`/pages/${slug}/versions/${v}/restore`, {
    method: "POST",
    auth,
  });

export const createGrant = (slug: string, label: string | undefined, auth: Auth) =>
  call<{ id: string; label: string | null; password: string; url: string }>(`/pages/${slug}/grants`, {
    method: "POST",
    body: label ? { label } : {},
    auth,
  });

export const listGrants = (slug: string, auth: Auth) =>
  call<{ grants: Grant[] }>(`/pages/${slug}/grants`, { auth });

export const revokeGrant = (slug: string, id: string, auth: Auth) =>
  call<{ ok: boolean }>(`/pages/${slug}/grants/${id}`, { method: "DELETE", auth });
