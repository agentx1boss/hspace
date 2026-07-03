import * as vscode from "vscode";
import { ApiClient, PublishResult, errorMessage } from "./api";

const SECRET_KEY = "hspace.apiKey";
const STATE_KEY = "hspace.recent";

interface Record {
  slug: string;
  url: string;
  filename: string;
  createdAt: string;
  editToken: string | null;
  passwordProtected: boolean;
}

// ─────────────────────────── activate ───────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const provider = new RecentProvider(context);
  vscode.window.registerTreeDataProvider("hspace.recent", provider);

  const reg = (id: string, fn: (...a: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg("hspace.publish", (uri?: vscode.Uri) => publishCommand(context, provider, uri));
  reg("hspace.setApiKey", () => setApiKey(context));
  reg("hspace.signOut", () => signOut(context));
  reg("hspace.setPassword", (node?: RecentNode) => setPassword(context, provider, node));
  reg("hspace.copyLink", (node?: RecentNode) => node && copyLink(node.record.url));
  reg("hspace.openInBrowser", (node?: RecentNode) => node && vscode.env.openExternal(vscode.Uri.parse(node.record.url)));
  reg("hspace.delete", (node?: RecentNode) => node && deletePage(context, provider, node.record));
  reg("hspace.refresh", () => provider.refresh());
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
  const ext = uri.path.toLowerCase();
  if (!ext.endsWith(".html") && !ext.endsWith(".htm")) {
    vscode.window.showWarningMessage("只能发布 .html / .htm 文件。");
    return;
  }

  const cfg = vscode.workspace.getConfiguration("hspace");
  // 所有发布强制带密码：默认随机 4 位数字（alwaysAskPassword 暂时屏蔽）
  const password = randomPin();

  const hasKey = !!(await context.secrets.get(SECRET_KEY));
  const days = cfg.get<number>("defaultExpiryDays", 7);
  const expiresIn = days === 0 && hasKey ? null : Math.max(1, days) * 86400;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "正在发布 HTML…" },
    async () => {
      try {
        const html = await readHtml(uri);
        const client = await getClient(context);
        const filename = uri.path.split("/").pop() || "index.html";
        const result: PublishResult = await client.publish({ html, filename, password, expiresIn });

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
    super(record.filename, vscode.TreeItemCollapsibleState.None);
    this.description = new URL(record.url).hostname;
    this.tooltip = `${record.url}\n发布于 ${new Date(record.createdAt).toLocaleString()}`;
    this.iconPath = new vscode.ThemeIcon(record.passwordProtected ? "lock" : "globe");
    this.contextValue = "hspacePage";
    this.command = { command: "hspace.openInBrowser", title: "打开", arguments: [this] };
  }
}

class RecentProvider implements vscode.TreeDataProvider<RecentNode> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  constructor(private context: vscode.ExtensionContext) {}
  refresh() { this._onDidChange.fire(); }
  getTreeItem(el: RecentNode) { return el; }
  getChildren(): RecentNode[] {
    return loadRecords(this.context).map((r) => new RecentNode(r));
  }
}
