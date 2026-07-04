// 后端 API 客户端（使用 VS Code 内置的全局 fetch，需 VS Code 1.85+ / Node 18+）

export interface PublishResult {
  slug: string;
  url: string;
  expiresAt: string | null;
  passwordProtected: boolean;
  editToken: string | null;
  docs?: { index: number; title: string }[]; // 合集时返回
}

export interface CollectionFile {
  name: string;
  html?: string;
  markdown?: string; // 每项与 html 二选一
}

export interface PublishOptions {
  html?: string;
  markdown?: string; // 与 html 二选一：md 由后端渲染成阅读页
  files?: CollectionFile[]; // 出现即为合集（2..N 项）
  title?: string; // 合集标题
  filename?: string;
  password?: string;
  expiresIn?: number | null; // 秒；后端钳制在档内上限(匿名 7 天 / 登录 30 天);没有永久链接
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(`API ${status}: ${code}`);
  }
}

export class ApiClient {
  constructor(private baseUrl: string, private apiKey?: string) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    return h;
  }

  private async parse(res: Response): Promise<any> {
    let body: any = {};
    try { body = await res.json(); } catch { /* ignore */ }
    if (!res.ok) throw new ApiError(res.status, body?.error ?? "unknown");
    return body;
  }

  async publish(opts: PublishOptions): Promise<PublishResult> {
    const res = await fetch(`${this.baseUrl}/publish`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(opts),
    });
    return this.parse(res);
  }

  async setPassword(slug: string, password: string | null, editToken?: string): Promise<void> {
    await this.patch(slug, { password }, editToken);
  }

  async patch(slug: string, body: Record<string, unknown>, editToken?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/pages/${slug}`, {
      method: "PATCH",
      headers: this.headers(editToken ? { "X-Edit-Token": editToken } : {}),
      body: JSON.stringify(body),
    });
    await this.parse(res);
  }

  async remove(slug: string, editToken?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/pages/${slug}`, {
      method: "DELETE",
      headers: this.headers(editToken ? { "X-Edit-Token": editToken } : {}),
    });
    await this.parse(res);
  }

  async stats(slug: string, editToken?: string): Promise<PageStats> {
    const res = await fetch(`${this.baseUrl}/pages/${slug}/stats`, {
      headers: this.headers(editToken ? { "X-Edit-Token": editToken } : {}),
    });
    return this.parse(res);
  }

  async createGrant(slug: string, label: string, editToken?: string): Promise<CreatedGrant> {
    const res = await fetch(`${this.baseUrl}/pages/${slug}/grants`, {
      method: "POST",
      headers: this.headers(editToken ? { "X-Edit-Token": editToken } : {}),
      body: JSON.stringify({ label }),
    });
    return this.parse(res);
  }

  async listGrants(slug: string, editToken?: string): Promise<Grant[]> {
    const res = await fetch(`${this.baseUrl}/pages/${slug}/grants`, {
      headers: this.headers(editToken ? { "X-Edit-Token": editToken } : {}),
    });
    const data = await this.parse(res);
    return data.grants as Grant[];
  }

  async revokeGrant(slug: string, id: string, editToken?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/pages/${slug}/grants/${id}`, {
      method: "DELETE",
      headers: this.headers(editToken ? { "X-Edit-Token": editToken } : {}),
    });
    await this.parse(res);
  }

  /** 更新内容(升版):单页传 html/markdown,合集传 files */
  async updateContent(slug: string, body: Partial<PublishOptions>, editToken?: string): Promise<void> {
    await this.patch(slug, body as Record<string, unknown>, editToken);
  }

  async listVersions(slug: string, editToken?: string): Promise<{ current: number; versions: Version[] }> {
    const res = await fetch(`${this.baseUrl}/pages/${slug}/versions`, {
      headers: this.headers(editToken ? { "X-Edit-Token": editToken } : {}),
    });
    return this.parse(res);
  }

  async restoreVersion(slug: string, v: number, editToken?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/pages/${slug}/versions/${v}/restore`, {
      method: "POST",
      headers: this.headers(editToken ? { "X-Edit-Token": editToken } : {}),
    });
    await this.parse(res);
  }
}

export interface Version {
  version: number;
  size_bytes: number;
  created_at: number;
}

export interface CreatedGrant {
  id: string;
  label: string | null;
  password: string;
  url: string;
}

export interface Grant {
  id: string;
  label: string | null;
  created_at: number;
  revoked: number;
  hits: number;
  last_seen_at: number | null;
}

export interface PageStats {
  slug: string;
  hits: number;
  createdAt: number;
  expiresAt: string | null;
  passwordProtected: boolean;
  isCollection: boolean;
  version: number;
  updatedAt: string | null;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      missing_html: "File is empty.",
      missing_content: "File is empty.",
      content_type_mismatch: "Content type doesn't match the original page (a Markdown page can only be updated with Markdown).",
      collection_too_few: "A collection needs at least 2 files.",
      too_many_docs: "Too many docs for a collection (anonymous: 3, signed in: 50). Sign in for bigger collections.",
      collection_content_immutable: "Collections can't be edited in place yet — delete and republish.",
      too_large: "File exceeds the size limit (anonymous 512KB, signed in 2MB). Sign in for larger files.",
      content_blocked: "Blocked by the safety scan.",
      rate_limited: "Publishing too often — try again shortly.",
      invalid_api_key: "API key is invalid — set it again.",
      login_required: "That's a signed-in feature — per-recipient links and version history need a (free) sign-in. Set an API key, then republish.",
      renew_requires_login: "Renewal needs a (free) sign-in. Anonymous links are one-shot (up to 3 days); sign in and republish for renewable 30-day links.",
      expired: "This link has expired and can't be changed — republish to share again.",
      forbidden: "You don't have permission to modify this page.",
      not_found: "Page doesn't exist or was deleted.",
    };
    return map[e.code] ?? `Request failed (${e.status} ${e.code}).`;
  }
  return e instanceof Error ? e.message : String(e);
}
