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
  expiresIn?: number | null; // 秒；null=永不过期（需登录）
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
}

export interface PageStats {
  slug: string;
  hits: number;
  createdAt: number;
  expiresAt: string | null;
  passwordProtected: boolean;
  isCollection: boolean;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      missing_html: "文件内容为空。",
      missing_content: "文件内容为空。",
      content_type_mismatch: "内容类型与原页面不一致（md 页面只能用 md 更新）。",
      collection_too_few: "合集至少需要 2 个文件。",
      too_many_docs: "文件数量超过合集上限。",
      collection_content_immutable: "合集暂不支持修改内容，请删除后重新发布。",
      too_large: "文件超过大小上限（默认 2MB）。",
      content_blocked: "内容被安全扫描拦截。",
      rate_limited: "发布过于频繁，请稍后再试。",
      invalid_api_key: "API Key 无效，请重新设置。",
      forbidden: "没有权限操作此页面。",
      not_found: "页面不存在或已删除。",
    };
    return map[e.code] ?? `请求失败（${e.status} ${e.code}）。`;
  }
  return e instanceof Error ? e.message : String(e);
}
