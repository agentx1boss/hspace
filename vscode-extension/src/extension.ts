import * as vscode from "vscode";
import { ApiClient, PublishResult, CollectionFile, errorMessage } from "./api";

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
  reg("hspace.copyLink", (node?: RecentNode) => node && copyLink(node.record.url));
  reg("hspace.openInBrowser", (node?: RecentNode) => node && vscode.env.openExternal(vscode.Uri.parse(node.record.url)));
  reg("hspace.delete", (node?: RecentNode) => node && deletePage(context, provider, node.record));
  reg("hspace.refresh", () => refreshStats(context, provider));
}

export function deactivate() {}

// ─────────────────────────── 命令 ───────────────────────────

async function getClient(context: vscode.ExtensionContext): Promise<ApiClient> {
  const base = vscode.workspace.getConfiguration("hspace").get<string>("apiBaseUrl", "").replace(/\/$/, "");
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
    const base = isColl ? `合集 · ${record.docs?.length ?? 0} 篇` : new URL(record.url).hostname;
    this.description = views ? `${base} · ${views}` : base;
    const viewLine = record.hits === undefined
      ? "访问量:点刷新查看"
      : `访问量:${record.hits}${isColl ? "(目录+各篇)" : ""}${record.statsAt ? `  ·  更新于 ${new Date(record.statsAt).toLocaleString()}` : ""}`;
    this.tooltip = `${record.url}\n发布于 ${new Date(record.createdAt).toLocaleString()}\n${viewLine}`;
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
