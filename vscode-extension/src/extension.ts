import * as vscode from "vscode";
import { ApiClient, PublishResult, CollectionFile, Grant, errorMessage } from "./api";

const SECRET_KEY = "hspace.apiKey";
const STATE_KEY = "hspace.recent";

interface Record {
  slug: string;
  url: string;
  filename: string;
  createdAt: string;
  editToken: string | null;
  passwordProtected: boolean;
  kind?: "single" | "collection";
  docs?: { index: number; title: string }[]; // 合集篇目
  hits?: number;         // 访问回执:累计访问量
  statsAt?: string;      // 上次拉取访问量的时间
  contentType?: "md" | "html"; // 单页内容类型(用于更新校验)
  version?: number;      // 当前内容版本
  updatedAt?: string | null; // 最近更新时间(ISO)
}

// ─────────────────────────── activate ───────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const provider = new RecentProvider(context);
  vscode.window.registerTreeDataProvider("hspace.recent", provider);

  const reg = (id: string, fn: (...a: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg("hspace.publish", (uri?: vscode.Uri) => publishCommand(context, provider, uri));
  reg("hspace.publishFolder", (uri?: vscode.Uri, uris?: vscode.Uri[]) => publishFolderCommand(context, provider, uri, uris));
  reg("hspace.setApiKey", () => setApiKey(context));
  reg("hspace.signOut", () => signOut(context));
  reg("hspace.setPassword", (node?: RecentNode) => setPassword(context, provider, node));
  reg("hspace.manageGrants", (node?: RecentNode) => node && manageGrants(context, node.record));
  reg("hspace.updateContent", (node?: RecentNode) => node && updateContent(context, provider, node.record));
  reg("hspace.versions", (node?: RecentNode) => node && showVersions(context, node.record));
  reg("hspace.copyLink", (node?: RecentNode) => node && copyLink(node.record.url));
  reg("hspace.openInBrowser", (node?: RecentNode) => node && vscode.env.openExternal(vscode.Uri.parse(node.record.url)));
  reg("hspace.delete", (node?: RecentNode) => node && deletePage(context, provider, node.record));
  reg("hspace.refresh", () => refreshStats(context, provider));
}

export function deactivate() {}

// ─────────────────────────── 命令 ───────────────────────────

const DEFAULT_API_BASE = "https://html-share.kzhan.workers.dev";

async function getClient(context: vscode.ExtensionContext): Promise<ApiClient> {
  // 兜底:配置为空(如旧 htmlshare.* 迁移后遗留空值)时回退到官方实例,避免 fetch 相对 URL 失败
  let base = vscode.workspace.getConfiguration("hspace").get<string>("apiBaseUrl", "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = DEFAULT_API_BASE;
  const key = await context.secrets.get(SECRET_KEY);
  return new ApiClient(base, key || undefined);
}

async function publishCommand(context: vscode.ExtensionContext, provider: RecentProvider, uriArg?: vscode.Uri) {
  const uri = resolveTargetUri(uriArg);
  if (!uri) {
    vscode.window.showWarningMessage("请先打开或选中一个 .html 文件。");
    return;
  }
  const path = uri.path.toLowerCase();
  const isMd = path.endsWith(".md") || path.endsWith(".markdown");
  if (!isMd && !path.endsWith(".html") && !path.endsWith(".htm")) {
    vscode.window.showWarningMessage("只能发布 .html / .htm / .md 文件。");
    return;
  }

  const cfg = vscode.workspace.getConfiguration("hspace");
  // 所有发布强制带密码：默认随机 4 位数字（alwaysAskPassword 暂时屏蔽）
  const password = randomPin();

  const hasKey = !!(await context.secrets.get(SECRET_KEY));
  const days = cfg.get<number>("defaultExpiryDays", 7);
  const expiresIn = days === 0 && hasKey ? null : Math.max(1, days) * 86400;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "正在发布…" },
    async () => {
      try {
        const text = await readHtml(uri);
        const client = await getClient(context);
        const filename = uri.path.split("/").pop() || (isMd ? "index.md" : "index.html");
        const result: PublishResult = await client.publish({
          ...(isMd ? { markdown: text } : { html: text }),
          filename, password, expiresIn,
        });

        await saveRecord(context, {
          slug: result.slug,
          url: result.url,
          filename,
          createdAt: new Date().toISOString(),
          editToken: result.editToken,
          passwordProtected: result.passwordProtected,
          kind: "single",
          contentType: isMd ? "md" : "html",
          version: 1,
        });
        provider.refresh();

        await vscode.env.clipboard.writeText(`${result.url} 密码：${password}`);
        const actions = ["浏览器打开", "修改密码"];
        const pick = await vscode.window.showInformationMessage(
          `已发布：${result.url}（密码 ${password}，链接和密码已复制）`,
          ...actions
        );
        if (pick === "浏览器打开") vscode.env.openExternal(vscode.Uri.parse(result.url));
        if (pick && pick.endsWith("密码")) {
          const rec = (loadRecords(context)).find((r) => r.slug === result.slug);
          if (rec) await setPasswordFor(context, provider, rec);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`发布失败：${errorMessage(e)}`);
      }
    }
  );
}

// ---- 发布文件夹 / 多选文件为合集 ----
interface Candidate { uri: vscode.Uri; name: string; isMd: boolean; text: string; title: string; }

async function publishFolderCommand(
  context: vscode.ExtensionContext,
  provider: RecentProvider,
  uri?: vscode.Uri,
  uris?: vscode.Uri[]
) {
  // 收集候选文件：多选文件优先,否则把 uri 当文件夹读取单层
  let candidates: Candidate[];
  let defaultTitle = "文档合集";
  try {
    if (uris && uris.length > 1) {
      candidates = await collectFiles(uris);
      defaultTitle = "文档合集";
    } else if (uri) {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type & vscode.FileType.Directory) {
        const entries = await vscode.workspace.fs.readDirectory(uri);
        const files = entries
          .filter(([n, t]) => t === vscode.FileType.File && isPublishable(n))
          .map(([n]) => vscode.Uri.joinPath(uri, n));
        candidates = await collectFiles(files);
        defaultTitle = uri.path.split("/").pop() || defaultTitle;
      } else {
        vscode.window.showWarningMessage("请右键一个文件夹,或多选文件后发布为合集。");
        return;
      }
    } else {
      vscode.window.showWarningMessage("请在资源管理器右键文件夹,或多选文件后使用「发布为合集」。");
      return;
    }
  } catch (e) {
    vscode.window.showErrorMessage(`读取文件失败：${errorMessage(e)}`);
    return;
  }

  if (candidates.length < 2) {
    vscode.window.showWarningMessage("合集至少需要 2 个 .md / .html 文件。");
    return;
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  // ① 确认清单(默认全选)——隐私底线:上传前让用户看清在分享什么
  const picks = await vscode.window.showQuickPick(
    candidates.map((c) => ({
      label: (c.isMd ? "$(markdown) " : "$(file-code) ") + c.name,
      description: c.title,
      picked: true,
      c,
    })),
    { canPickMany: true, placeHolder: "选择要放进合集的文件(默认全选,按文件名排序)", ignoreFocusOut: true }
  );
  if (!picks || picks.length === 0) return;
  if (picks.length < 2) {
    vscode.window.showWarningMessage("合集至少需要 2 个文件。");
    return;
  }

  // ② 合集标题
  const title = await vscode.window.showInputBox({
    prompt: "合集标题(接收方在目录页看到)",
    value: defaultTitle,
    ignoreFocusOut: true,
  });
  if (title === undefined) return;

  // ③ 发布
  const password = randomPin();
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "正在发布合集…" },
    async () => {
      try {
        const files: CollectionFile[] = picks.map((p) =>
          p.c.isMd ? { name: p.c.name, markdown: p.c.text } : { name: p.c.name, html: p.c.text }
        );
        const client = await getClient(context);
        const hasKey = !!(await context.secrets.get(SECRET_KEY));
        const days = vscode.workspace.getConfiguration("hspace").get<number>("defaultExpiryDays", 7);
        const expiresIn = days === 0 && hasKey ? null : Math.max(1, days) * 86400;

        const result: PublishResult = await client.publish({
          files, title: title || defaultTitle, password, expiresIn,
        });

        await saveRecord(context, {
          slug: result.slug,
          url: result.url,
          filename: title || defaultTitle,
          createdAt: new Date().toISOString(),
          editToken: result.editToken,
          passwordProtected: result.passwordProtected,
          kind: "collection",
          docs: result.docs,
        });
        provider.refresh();

        await vscode.env.clipboard.writeText(`${result.url} 密码：${password}`);
        const pick = await vscode.window.showInformationMessage(
          `合集已发布：${result.url}（${files.length} 篇，密码 ${password}，链接和密码已复制）`,
          "浏览器打开", "修改密码"
        );
        if (pick === "浏览器打开") vscode.env.openExternal(vscode.Uri.parse(result.url));
        if (pick === "修改密码") {
          const rec = loadRecords(context).find((r) => r.slug === result.slug);
          if (rec) await setPasswordFor(context, provider, rec);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`发布失败：${errorMessage(e)}`);
      }
    }
  );
}

function isPublishable(path: string): boolean {
  const p = path.toLowerCase();
  return p.endsWith(".md") || p.endsWith(".markdown") || p.endsWith(".html") || p.endsWith(".htm");
}

async function collectFiles(uris: vscode.Uri[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const u of uris) {
    if (!isPublishable(u.path)) continue;
    const name = u.path.split("/").pop() || "untitled";
    const isMd = /\.(md|markdown)$/i.test(name);
    const text = await readHtml(u);
    out.push({ uri: u, name, isMd, text, title: extractTitle(text, name, isMd) });
  }
  return out;
}

/** 客户端轻量标题提取(仅用于清单预览,权威标题由后端生成) */
function extractTitle(text: string, name: string, isMd: boolean): string {
  if (isMd) {
    const m = text.match(/^#\s+(.+)$/m);
    if (m) return m[1].replace(/[*_`~\[\]]/g, "").trim().slice(0, 80);
  } else {
    const m = text.match(/<title>([^<]*)<\/title>/i);
    if (m && m[1].trim()) return m[1].trim().slice(0, 80);
  }
  return name.replace(/\.(html?|md|markdown)$/i, "");
}

// ---- 内容版本化:更新内容 ----
async function updateContent(context: vscode.ExtensionContext, provider: RecentProvider, rec: Record) {
  const client = await getClient(context);
  if (rec.kind === "collection") {
    // 合集:重新选文件夹整组替换
    const folder = await vscode.window.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false, openLabel: "选择文件夹更新此合集",
    });
    if (!folder || folder.length === 0) return;
    let candidates: Candidate[];
    try {
      const entries = await vscode.workspace.fs.readDirectory(folder[0]);
      const files = entries.filter(([n, t]) => t === vscode.FileType.File && isPublishable(n))
        .map(([n]) => vscode.Uri.joinPath(folder[0], n));
      candidates = await collectFiles(files);
    } catch (e) { vscode.window.showErrorMessage(`读取失败：${errorMessage(e)}`); return; }
    if (candidates.length < 2) { vscode.window.showWarningMessage("合集至少需要 2 个 .md / .html 文件。"); return; }
    candidates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const ok = await vscode.window.showWarningMessage(
      `用「${folder[0].path.split("/").pop()}」里的 ${candidates.length} 个文件替换合集「${rec.filename}」的全部内容？链接与密码不变,升为新版本。`,
      { modal: true }, "更新"
    );
    if (ok !== "更新") return;
    const files: CollectionFile[] = candidates.map((c) =>
      c.isMd ? { name: c.name, markdown: c.text } : { name: c.name, html: c.text });
    await runUpdate(client, rec, { files, title: rec.filename }, provider, context);
    return;
  }

  // 单页:用当前编辑器文件更新(类型需一致)
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) { vscode.window.showWarningMessage("请先打开要用作新内容的文件。"); return; }
  const p = uri.path.toLowerCase();
  const isMd = p.endsWith(".md") || p.endsWith(".markdown");
  const isHtml = p.endsWith(".html") || p.endsWith(".htm");
  if (!isMd && !isHtml) { vscode.window.showWarningMessage("当前文件不是 .html / .md。"); return; }
  const type = isMd ? "md" : "html";
  if (rec.contentType && rec.contentType !== type) {
    vscode.window.showWarningMessage(`类型不符:该页面是 ${rec.contentType},不能用 ${type} 文件更新。`);
    return;
  }
  const ok = await vscode.window.showWarningMessage(
    `用当前文件「${uri.path.split("/").pop()}」更新「${rec.filename}」?链接与密码不变,升为新版本。`,
    { modal: true }, "更新"
  );
  if (ok !== "更新") return;
  const text = await readHtml(uri);
  await runUpdate(client, rec, isMd ? { markdown: text } : { html: text }, provider, context);
}

async function runUpdate(
  client: ApiClient, rec: Record, body: any, provider: RecentProvider, context: vscode.ExtensionContext
) {
  await vscode.window.withProgress(
    { location: { viewId: "hspace.recent" } },
    async () => {
      try {
        await client.updateContent(rec.slug, body, rec.editToken || undefined);
        const v = await client.listVersions(rec.slug, rec.editToken || undefined);
        rec.version = v.current;
        rec.updatedAt = new Date().toISOString();
        await replaceRecord(context, rec);
        provider.refresh();
        vscode.window.showInformationMessage(`已更新「${rec.filename}」到 v${v.current}(链接与密码不变)。`);
      } catch (e) {
        vscode.window.showErrorMessage(`更新失败：${errorMessage(e)}`);
      }
    }
  );
}

// ---- 内容版本化:版本历史与回滚 ----
async function showVersions(context: vscode.ExtensionContext, rec: Record) {
  const client = await getClient(context);
  let data: { current: number; versions: { version: number; size_bytes: number; created_at: number }[] };
  try {
    data = await client.listVersions(rec.slug, rec.editToken || undefined);
  } catch (e) { vscode.window.showErrorMessage(`读取版本失败：${errorMessage(e)}`); return; }
  if (data.versions.length <= 1) { vscode.window.showInformationMessage("该页面暂无历史版本(仅初版)。"); return; }

  const pick = await vscode.window.showQuickPick(
    data.versions.map((v) => ({
      label: `v${v.version}${v.version === data.current ? "（当前）" : ""}`,
      description: `${new Date(v.created_at * 1000).toLocaleString()} · ${(v.size_bytes / 1024).toFixed(1)} KB`,
      v,
    })),
    { placeHolder: `「${rec.filename}」版本历史 — 选择要回滚到的版本`, ignoreFocusOut: true }
  );
  if (!pick || pick.v.version === data.current) return;
  const ok = await vscode.window.showWarningMessage(
    `回滚到 v${pick.v.version}?当前内容会被替换为该版本(并记为新版本),链接与密码不变。`,
    { modal: true }, "回滚"
  );
  if (ok !== "回滚") return;
  try {
    await client.restoreVersion(rec.slug, pick.v.version, rec.editToken || undefined);
    rec.updatedAt = new Date().toISOString();
    await replaceRecord(context, rec);
    vscode.window.showInformationMessage(`已回滚到 v${pick.v.version} 的内容。`);
  } catch (e) {
    vscode.window.showErrorMessage(`回滚失败：${errorMessage(e)}`);
  }
}

async function setApiKey(context: vscode.ExtensionContext) {
  const key = await vscode.window.showInputBox({
    prompt: "粘贴你的 API Key（在网站账户页生成）",
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) return;
  if (key === "") {
    await context.secrets.delete(SECRET_KEY);
    vscode.window.showInformationMessage("已清除 API Key（当前为匿名模式）。");
  } else {
    await context.secrets.store(SECRET_KEY, key.trim());
    vscode.window.showInformationMessage("API Key 已保存。");
  }
}

async function signOut(context: vscode.ExtensionContext) {
  await context.secrets.delete(SECRET_KEY);
  vscode.window.showInformationMessage("已退出登录。");
}

async function setPassword(context: vscode.ExtensionContext, provider: RecentProvider, node?: RecentNode) {
  let rec = node?.record;
  if (!rec) {
    const records = loadRecords(context);
    if (records.length === 0) {
      vscode.window.showInformationMessage("还没有已发布的页面。");
      return;
    }
    const pick = await vscode.window.showQuickPick(
      records.map((r) => ({ label: r.filename, description: r.url, rec: r })),
      { placeHolder: "选择要设置密码的页面" }
    );
    rec = pick?.rec;
  }
  if (rec) await setPasswordFor(context, provider, rec);
}

async function setPasswordFor(context: vscode.ExtensionContext, provider: RecentProvider, rec: Record) {
  const input = await vscode.window.showInputBox({
    prompt: `为「${rec.filename}」设置密码（留空则移除密码）`,
    password: true,
  });
  if (input === undefined) return;
  try {
    const client = await getClient(context);
    await client.setPassword(rec.slug, input === "" ? null : input, rec.editToken || undefined);
    rec.passwordProtected = input !== "";
    await replaceRecord(context, rec);
    provider.refresh();
    vscode.window.showInformationMessage(input === "" ? "已移除密码。" : "密码已更新。");
  } catch (e) {
    vscode.window.showErrorMessage(`设置密码失败：${errorMessage(e)}`);
  }
}

async function deletePage(context: vscode.ExtensionContext, provider: RecentProvider, rec: Record) {
  const ok = await vscode.window.showWarningMessage(
    `确认删除「${rec.filename}」？链接将立即失效。`,
    { modal: true },
    "删除"
  );
  if (ok !== "删除") return;
  try {
    const client = await getClient(context);
    await client.remove(rec.slug, rec.editToken || undefined);
  } catch (e) {
    // 即使后端报错(如已过期)，也从本地列表移除
    vscode.window.showWarningMessage(`后端删除返回：${errorMessage(e)}（已从本地列表移除）`);
  }
  await removeRecord(context, rec.slug);
  provider.refresh();
}

async function copyLink(url: string) {
  await vscode.env.clipboard.writeText(url);
  vscode.window.showInformationMessage("链接已复制。");
}

// ---- 每人一链:管理访问人 ----
async function manageGrants(context: vscode.ExtensionContext, rec: Record) {
  const client = await getClient(context);
  let grants: Grant[];
  try {
    grants = await client.listGrants(rec.slug, rec.editToken || undefined);
  } catch (e) {
    vscode.window.showErrorMessage(`读取访问人失败：${errorMessage(e)}`);
    return;
  }

  const fmtSeen = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString() : "未访问");
  const active = grants.filter((g) => !g.revoked);
  const items: (vscode.QuickPickItem & { grant?: Grant; add?: boolean })[] = [
    { label: "$(add) 添加访问人", detail: "生成一个独立密码,单独统计、可随时撤销", add: true },
    ...active.map((g) => ({
      label: `$(person) ${g.label || "(未命名)"}`,
      description: `👁 ${g.hits} · 最近 ${fmtSeen(g.last_seen_at)}`,
      detail: "选择以撤销此人的访问",
      grant: g,
    })),
  ];

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `「${rec.filename}」的访问人（共 ${active.length} 人）`,
    ignoreFocusOut: true,
  });
  if (!pick) return;

  if (pick.add) {
    const label = await vscode.window.showInputBox({
      prompt: "访问人标签（如“张三”“客户A”，仅你可见）",
      ignoreFocusOut: true,
    });
    if (label === undefined) return;
    try {
      const g = await client.createGrant(rec.slug, label.trim(), rec.editToken || undefined);
      await vscode.env.clipboard.writeText(`${g.url} 密码：${g.password}`);
      vscode.window.showInformationMessage(
        `已为「${label || "访问人"}」创建专属密码 ${g.password}（链接+密码已复制,发给 TA 即可）`
      );
    } catch (e) {
      vscode.window.showErrorMessage(`创建失败：${errorMessage(e)}`);
    }
    return;
  }

  if (pick.grant) {
    const g = pick.grant;
    const ok = await vscode.window.showWarningMessage(
      `撤销「${g.label || "该访问人"}」的访问？TA 的密码将立即失效,其他人不受影响。`,
      { modal: true },
      "撤销"
    );
    if (ok !== "撤销") return;
    try {
      await client.revokeGrant(rec.slug, g.id, rec.editToken || undefined);
      vscode.window.showInformationMessage(`已撤销「${g.label || "该访问人"}」的访问。`);
    } catch (e) {
      vscode.window.showErrorMessage(`撤销失败：${errorMessage(e)}`);
    }
  }
}

// ---- 访问回执:刷新时拉取各页面访问量 ----
async function refreshStats(context: vscode.ExtensionContext, provider: RecentProvider) {
  const records = loadRecords(context);
  if (records.length === 0) { provider.refresh(); return; }

  await vscode.window.withProgress(
    { location: { viewId: "hspace.recent" } },
    async () => {
      const client = await getClient(context);
      // 分批并发,避免一次打太多请求
      const batchSize = 8;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await Promise.all(batch.map(async (rec) => {
          try {
            const s = await client.stats(rec.slug, rec.editToken || undefined);
            rec.hits = s.hits;
            rec.version = s.version;
            rec.updatedAt = s.updatedAt;
            rec.statsAt = new Date().toISOString();
          } catch {
            // 页面可能已过期/删除;保留原值,不打断整体刷新
          }
        }));
      }
      await context.globalState.update(STATE_KEY, records);
      provider.refresh();
    }
  );
}

// ─────────────────────────── 工具 ───────────────────────────

/** 随机 4 位数字密码 */
function randomPin(len = 4): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join("");
}

function resolveTargetUri(uriArg?: vscode.Uri): vscode.Uri | undefined {
  if (uriArg instanceof vscode.Uri) return uriArg;
  return vscode.window.activeTextEditor?.document.uri;
}

async function readHtml(uri: vscode.Uri): Promise<string> {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) return open.getText();
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString("utf8");
}

function loadRecords(context: vscode.ExtensionContext): Record[] {
  return context.globalState.get<Record[]>(STATE_KEY, []);
}
async function saveRecord(context: vscode.ExtensionContext, rec: Record) {
  const list = loadRecords(context).filter((r) => r.slug !== rec.slug);
  list.unshift(rec);
  await context.globalState.update(STATE_KEY, list.slice(0, 200));
}
async function replaceRecord(context: vscode.ExtensionContext, rec: Record) {
  const list = loadRecords(context).map((r) => (r.slug === rec.slug ? rec : r));
  await context.globalState.update(STATE_KEY, list);
}
async function removeRecord(context: vscode.ExtensionContext, slug: string) {
  await context.globalState.update(STATE_KEY, loadRecords(context).filter((r) => r.slug !== slug));
}

// ─────────────────────────── TreeView ───────────────────────────

class RecentNode extends vscode.TreeItem {
  constructor(public record: Record) {
    const isColl = record.kind === "collection";
    super(
      record.filename,
      isColl ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    const views = record.hits === undefined ? "" : `👁 ${record.hits}`;
    const ver = record.version && record.version > 1 ? `v${record.version}` : "";
    const base = isColl ? `合集 · ${record.docs?.length ?? 0} 篇` : new URL(record.url).hostname;
    this.description = [base, views, ver].filter(Boolean).join(" · ");
    const viewLine = record.hits === undefined
      ? "访问量:点刷新查看"
      : `访问量:${record.hits}${isColl ? "(目录+各篇)" : ""}`;
    const verLine = record.version && record.version > 1
      ? `\n版本:v${record.version}${record.updatedAt ? ` · 更新于 ${new Date(record.updatedAt).toLocaleDateString()}` : ""}`
      : "";
    this.tooltip = `${record.url}\n发布于 ${new Date(record.createdAt).toLocaleString()}\n${viewLine}${verLine}`;
    this.iconPath = new vscode.ThemeIcon(isColl ? "book" : record.passwordProtected ? "lock" : "globe");
    this.contextValue = "hspacePage";
    // 合集节点展开看篇目,不整体跳转;单页点击直接打开
    if (!isColl) this.command = { command: "hspace.openInBrowser", title: "打开", arguments: [this] };
  }
}

/** 合集下的单篇节点:点击在浏览器打开 <url>/<index> */
class DocNode extends vscode.TreeItem {
  constructor(public url: string, doc: { index: number; title: string }) {
    super(`${doc.index}. ${doc.title}`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("file");
    this.command = {
      command: "vscode.open",
      title: "打开",
      arguments: [vscode.Uri.parse(`${url}/${doc.index}`)],
    };
  }
}

type TreeNode = RecentNode | DocNode;

class RecentProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  constructor(private context: vscode.ExtensionContext) {}
  refresh() { this._onDidChange.fire(); }
  getTreeItem(el: TreeNode) { return el; }
  getChildren(el?: TreeNode): TreeNode[] {
    if (!el) return loadRecords(this.context).map((r) => new RecentNode(r));
    if (el instanceof RecentNode && el.record.kind === "collection") {
      return (el.record.docs ?? []).map((d) => new DocNode(el.record.url, d));
    }
    return [];
  }
}
