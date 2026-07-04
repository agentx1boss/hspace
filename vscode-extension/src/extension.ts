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
  expiresAt?: string | null; // 过期时间(ISO);所有链接都有有效期(null 仅第一方置顶内容)
}

// ─────────────────────────── activate ───────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const provider = new RecentProvider(context);
  vscode.window.registerTreeDataProvider("hspace.recent", provider);

  const reg = (id: string, fn: (...a: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg("hspace.publish", (uri?: vscode.Uri) => publishCommand(context, provider, uri));
  reg("hspace.publishFolder", (uri?: vscode.Uri, uris?: vscode.Uri[]) => publishFolderCommand(context, provider, uri, uris));
  reg("hspace.signIn", () => signIn(context));
  reg("hspace.setApiKey", () => setApiKey(context));
  reg("hspace.signOut", () => signOut(context));
  reg("hspace.setPassword", (node?: RecentNode) => setPassword(context, provider, node));
  reg("hspace.manageGrants", (node?: RecentNode) => node && manageGrants(context, node.record));
  reg("hspace.updateContent", (node?: RecentNode) => node && updateContent(context, provider, node.record));
  reg("hspace.versions", (node?: RecentNode) => node && showVersions(context, node.record));
  reg("hspace.renew", (node?: RecentNode) => node && renew(context, provider, node.record));
  reg("hspace.copyLink", (node?: RecentNode) => node && copyLink(node.record.url));
  reg("hspace.openInBrowser", (node?: RecentNode) => node && vscode.env.openExternal(vscode.Uri.parse(node.record.url)));
  reg("hspace.delete", (node?: RecentNode) => node && deletePage(context, provider, node.record));
  reg("hspace.refresh", () => refreshStats(context, provider));
}

export function deactivate() {}

// ─────────────────────────── 命令 ───────────────────────────

const DEFAULT_API_BASE = "https://html-share.kzhan.workers.dev";
const CONSOLE_URL = "https://hspace.zhanjian.space/console"; // 托管版 console(自建后端无此页面)

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
    vscode.window.showWarningMessage("Open or select a file first.");
    return;
  }
  const path = uri.path.toLowerCase();
  const isMd = path.endsWith(".md") || path.endsWith(".markdown");
  if (!isMd && !path.endsWith(".html") && !path.endsWith(".htm")) {
    vscode.window.showWarningMessage("Only .html / .htm / .md files can be published.");
    return;
  }

  const cfg = vscode.workspace.getConfiguration("hspace");
  // 所有发布强制带密码：默认随机 4 位数字（alwaysAskPassword 暂时屏蔽）
  const password = randomPin();

  // 没有永久链接:天数钳在 [1, 30];后端再按登录/匿名档二次钳制
  const days = Math.min(Math.max(cfg.get<number>("defaultExpiryDays", 7), 1), 30);
  const expiresIn = days * 86400;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Publishing…" },
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
          expiresAt: result.expiresAt,
        });
        provider.refresh();

        await vscode.env.clipboard.writeText(`${result.url}  password: ${password}`);
        const actions = ["Open in browser", "Change password"];
        const pick = await vscode.window.showInformationMessage(
          `Published: ${result.url} (password ${password}; link & password copied)`,
          ...actions
        );
        if (pick === "Open in browser") vscode.env.openExternal(vscode.Uri.parse(result.url));
        if (pick === "Change password") {
          const rec = (loadRecords(context)).find((r) => r.slug === result.slug);
          if (rec) await setPasswordFor(context, provider, rec);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Publish failed: ${errorMessage(e)}`);
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
  let defaultTitle = "Collection";
  try {
    if (uris && uris.length > 1) {
      candidates = await collectFiles(uris);
      defaultTitle = "Collection";
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
        vscode.window.showWarningMessage("Right-click a folder, or multi-select files, to publish a collection.");
        return;
      }
    } else {
      vscode.window.showWarningMessage("In the Explorer, right-click a folder or multi-select files, then use Publish as collection.");
      return;
    }
  } catch (e) {
    vscode.window.showErrorMessage(`Failed to read files: ${errorMessage(e)}`);
    return;
  }

  if (candidates.length < 2) {
    vscode.window.showWarningMessage("A collection needs at least 2 .md / .html files.");
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
    { canPickMany: true, placeHolder: "Select files for the collection (all selected by default, sorted by name)", ignoreFocusOut: true }
  );
  if (!picks || picks.length === 0) return;
  if (picks.length < 2) {
    vscode.window.showWarningMessage("A collection needs at least 2 files.");
    return;
  }

  // ② 合集标题
  const title = await vscode.window.showInputBox({
    prompt: "Collection title (shown to recipients on the index page)",
    value: defaultTitle,
    ignoreFocusOut: true,
  });
  if (title === undefined) return;

  // ③ 发布
  const password = randomPin();
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Publishing collection…" },
    async () => {
      try {
        const files: CollectionFile[] = picks.map((p) =>
          p.c.isMd ? { name: p.c.name, markdown: p.c.text } : { name: p.c.name, html: p.c.text }
        );
        const client = await getClient(context);
        const days = Math.min(Math.max(vscode.workspace.getConfiguration("hspace").get<number>("defaultExpiryDays", 7), 1), 30);
        const expiresIn = days * 86400;

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
          expiresAt: result.expiresAt,
        });
        provider.refresh();

        await vscode.env.clipboard.writeText(`${result.url}  password: ${password}`);
        const pick = await vscode.window.showInformationMessage(
          `Collection published: ${result.url} (${files.length} docs, password ${password}; link & password copied)`,
          "Open in browser", "Change password"
        );
        if (pick === "Open in browser") vscode.env.openExternal(vscode.Uri.parse(result.url));
        if (pick === "Change password") {
          const rec = loadRecords(context).find((r) => r.slug === result.slug);
          if (rec) await setPasswordFor(context, provider, rec);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Publish failed: ${errorMessage(e)}`);
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
      canSelectFolders: true, canSelectFiles: false, openLabel: "Choose a folder to update this collection",
    });
    if (!folder || folder.length === 0) return;
    let candidates: Candidate[];
    try {
      const entries = await vscode.workspace.fs.readDirectory(folder[0]);
      const files = entries.filter(([n, t]) => t === vscode.FileType.File && isPublishable(n))
        .map(([n]) => vscode.Uri.joinPath(folder[0], n));
      candidates = await collectFiles(files);
    } catch (e) { vscode.window.showErrorMessage(`Read failed: ${errorMessage(e)}`); return; }
    if (candidates.length < 2) { vscode.window.showWarningMessage("A collection needs at least 2 .md / .html files."); return; }
    candidates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const ok = await vscode.window.showWarningMessage(
      `Replace all content of "${rec.filename}" with the ${candidates.length} files in "${folder[0].path.split("/").pop()}"? Link and password stay the same; a new version is created.`,
      { modal: true }, "Update"
    );
    if (ok !== "Update") return;
    const files: CollectionFile[] = candidates.map((c) =>
      c.isMd ? { name: c.name, markdown: c.text } : { name: c.name, html: c.text });
    await runUpdate(client, rec, { files, title: rec.filename }, provider, context);
    return;
  }

  // 单页:用当前编辑器文件更新(类型需一致)
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) { vscode.window.showWarningMessage("Open the file you want to use as the new content first."); return; }
  const p = uri.path.toLowerCase();
  const isMd = p.endsWith(".md") || p.endsWith(".markdown");
  const isHtml = p.endsWith(".html") || p.endsWith(".htm");
  if (!isMd && !isHtml) { vscode.window.showWarningMessage("The current file isn\u2019t .html / .md."); return; }
  const type = isMd ? "md" : "html";
  if (rec.contentType && rec.contentType !== type) {
    vscode.window.showWarningMessage(`Type mismatch: this page is ${rec.contentType} and can\u2019t be updated with a ${type} file.`);
    return;
  }
  const ok = await vscode.window.showWarningMessage(
    `Update "${rec.filename}" with the current file "${uri.path.split("/").pop()}"? Link and password stay the same; a new version is created.`,
    { modal: true }, "Update"
  );
  if (ok !== "Update") return;
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
        vscode.window.showInformationMessage(`Updated "${rec.filename}" to v${v.current} (link & password unchanged).`);
      } catch (e) {
        vscode.window.showErrorMessage(`Update failed: ${errorMessage(e)}`);
      }
    }
  );
}

// ---- 内容版本化:版本历史与回滚 ----
async function showVersions(context: vscode.ExtensionContext, rec: Record) {
  if (rec.editToken) {
    const pick = await vscode.window.showInformationMessage(
      "Version history & rollback are a signed-in feature. Anonymous pages can still be updated in place, but there's no history to browse. Sign in (free) and republish to keep versions.",
      "Sign in"
    );
    if (pick === "Sign in") vscode.commands.executeCommand("hspace.signIn");
    return;
  }
  const client = await getClient(context);
  let data: { current: number; versions: { version: number; size_bytes: number; created_at: number }[] };
  try {
    data = await client.listVersions(rec.slug, rec.editToken || undefined);
  } catch (e) { vscode.window.showErrorMessage(`Failed to load versions: ${errorMessage(e)}`); return; }
  if (data.versions.length <= 1) { vscode.window.showInformationMessage("No earlier versions yet (only the first)."); return; }

  const pick = await vscode.window.showQuickPick(
    data.versions.map((v) => ({
      label: `v${v.version}${v.version === data.current ? " (current)" : ""}`,
      description: `${new Date(v.created_at * 1000).toLocaleString()} · ${(v.size_bytes / 1024).toFixed(1)} KB`,
      v,
    })),
    { placeHolder: `Version history of "${rec.filename}" — choose a version to roll back to`, ignoreFocusOut: true }
  );
  if (!pick || pick.v.version === data.current) return;
  const ok = await vscode.window.showWarningMessage(
    `Roll back to v${pick.v.version}? Current content is replaced with that version (recorded as a new version); link & password stay the same.`,
    { modal: true }, "Roll back"
  );
  if (ok !== "Roll back") return;
  try {
    await client.restoreVersion(rec.slug, pick.v.version, rec.editToken || undefined);
    rec.updatedAt = new Date().toISOString();
    await replaceRecord(context, rec);
    vscode.window.showInformationMessage(`Rolled back to the content of v${pick.v.version}.`);
  } catch (e) {
    vscode.window.showErrorMessage(`Roll back failed: ${errorMessage(e)}`);
  }
}

// ---- 续期:把有效期从现在往后推(登录专属;匿名链接一次性、到期即消失)----
async function renew(context: vscode.ExtensionContext, provider: RecentProvider, rec: Record) {
  // 匿名页面(有 editToken)不可续:后端会拒,这里提前给出引导
  if (rec.editToken) {
    const pick = await vscode.window.showInformationMessage(
      "Anonymous links are one-shot (up to 3 days) and can't be renewed. Sign in (free) and republish to get renewable 30-day links.",
      "Sign in"
    );
    if (pick === "Sign in") vscode.commands.executeCommand("hspace.signIn");
    return;
  }
  const opts = [7, 14, 30].map((d) => ({ label: `${d} days`, days: d }));
  const pick = await vscode.window.showQuickPick(opts, {
    placeHolder: `Renew "${rec.filename}" — new term from now (max 30 days)`,
    ignoreFocusOut: true,
  });
  if (!pick) return;
  try {
    const client = await getClient(context);
    await client.patch(rec.slug, { expiresIn: pick.days * 86400 }, rec.editToken || undefined);
    rec.expiresAt = new Date(Date.now() + pick.days * 86400 * 1000).toISOString();
    await replaceRecord(context, rec);
    provider.refresh();
    vscode.window.showInformationMessage(`Renewed — expires ${new Date(rec.expiresAt).toLocaleDateString()}.`);
  } catch (e) {
    vscode.window.showErrorMessage(`Renew failed: ${errorMessage(e)}`);
  }
}

async function signIn(context: vscode.ExtensionContext) {
  // 浏览器登录 GitHub → console 一键复制 API key → 回编辑器粘贴(粘贴框已提前打开)
  await vscode.env.openExternal(vscode.Uri.parse(CONSOLE_URL + "?from=vscode"));
  await setApiKey(context);
}

async function setApiKey(context: vscode.ExtensionContext) {
  const key = await vscode.window.showInputBox({
    prompt: "Paste your API key (copy it from hspace.zhanjian.space/console)",
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) return;
  if (key === "") {
    await context.secrets.delete(SECRET_KEY);
    vscode.window.showInformationMessage("API key cleared (anonymous mode).");
  } else {
    await context.secrets.store(SECRET_KEY, key.trim());
    vscode.window.showInformationMessage("API key saved.");
  }
}

async function signOut(context: vscode.ExtensionContext) {
  await context.secrets.delete(SECRET_KEY);
  vscode.window.showInformationMessage("Signed out.");
}

async function setPassword(context: vscode.ExtensionContext, provider: RecentProvider, node?: RecentNode) {
  let rec = node?.record;
  if (!rec) {
    const records = loadRecords(context);
    if (records.length === 0) {
      vscode.window.showInformationMessage("No published pages yet.");
      return;
    }
    const pick = await vscode.window.showQuickPick(
      records.map((r) => ({ label: r.filename, description: r.url, rec: r })),
      { placeHolder: "Select a page to set a password" }
    );
    rec = pick?.rec;
  }
  if (rec) await setPasswordFor(context, provider, rec);
}

async function setPasswordFor(context: vscode.ExtensionContext, provider: RecentProvider, rec: Record) {
  const input = await vscode.window.showInputBox({
    prompt: `Set a password for "${rec.filename}" (leave empty to remove)`,
    password: true,
  });
  if (input === undefined) return;
  try {
    const client = await getClient(context);
    await client.setPassword(rec.slug, input === "" ? null : input, rec.editToken || undefined);
    rec.passwordProtected = input !== "";
    await replaceRecord(context, rec);
    provider.refresh();
    vscode.window.showInformationMessage(input === "" ? "Password removed." : "Password updated.");
  } catch (e) {
    vscode.window.showErrorMessage(`Failed to set password: ${errorMessage(e)}`);
  }
}

async function deletePage(context: vscode.ExtensionContext, provider: RecentProvider, rec: Record) {
  const ok = await vscode.window.showWarningMessage(
    `Delete "${rec.filename}"? The link stops working immediately.`,
    { modal: true },
    "Delete"
  );
  if (ok !== "Delete") return;
  try {
    const client = await getClient(context);
    await client.remove(rec.slug, rec.editToken || undefined);
  } catch (e) {
    // 即使后端报错(如已过期)，也从本地列表移除
    vscode.window.showWarningMessage(`Backend delete returned: ${errorMessage(e)} (removed from local list)`);
  }
  await removeRecord(context, rec.slug);
  provider.refresh();
}

async function copyLink(url: string) {
  await vscode.env.clipboard.writeText(url);
  vscode.window.showInformationMessage("Link copied.");
}

// ---- 每人一链:管理访问人 ----
async function manageGrants(context: vscode.ExtensionContext, rec: Record) {
  if (rec.editToken) {
    const pick = await vscode.window.showInformationMessage(
      "Per-recipient links are a signed-in feature. Sign in (free) and republish to give each recipient their own password and receipt.",
      "Sign in"
    );
    if (pick === "Sign in") vscode.commands.executeCommand("hspace.signIn");
    return;
  }
  const client = await getClient(context);
  let grants: Grant[];
  try {
    grants = await client.listGrants(rec.slug, rec.editToken || undefined);
  } catch (e) {
    vscode.window.showErrorMessage(`Failed to load recipients: ${errorMessage(e)}`);
    return;
  }

  const fmtSeen = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString() : "never");
  const active = grants.filter((g) => !g.revoked);
  const items: (vscode.QuickPickItem & { grant?: Grant; add?: boolean })[] = [
    { label: "$(add) Add recipient", detail: "A separate password — tracked individually, revocable anytime", add: true },
    ...active.map((g) => ({
      label: `$(person) ${g.label || "(unnamed)"}`,
      description: `👁 ${g.hits} · last ${fmtSeen(g.last_seen_at)}`,
      detail: "Select to revoke this person\u2019s access",
      grant: g,
    })),
  ];

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Recipients of "${rec.filename}" (${active.length} total)`,
    ignoreFocusOut: true,
  });
  if (!pick) return;

  if (pick.add) {
    const label = await vscode.window.showInputBox({
      prompt: "Recipient label (e.g. Alex, Client A — only you see it)",
      ignoreFocusOut: true,
    });
    if (label === undefined) return;
    try {
      const g = await client.createGrant(rec.slug, label.trim(), rec.editToken || undefined);
      await vscode.env.clipboard.writeText(`${g.url}  password: ${g.password}`);
      vscode.window.showInformationMessage(
        `Created password ${g.password} for "${label || "recipient"}" (link & password copied — send it to them)`
      );
    } catch (e) {
      vscode.window.showErrorMessage(`Create failed: ${errorMessage(e)}`);
    }
    return;
  }

  if (pick.grant) {
    const g = pick.grant;
    const ok = await vscode.window.showWarningMessage(
      `Revoke access for "${g.label || "this recipient"}"? Their password stops working immediately; others are unaffected.`,
      { modal: true },
      "Revoke"
    );
    if (ok !== "Revoke") return;
    try {
      await client.revokeGrant(rec.slug, g.id, rec.editToken || undefined);
      vscode.window.showInformationMessage(`Revoked access for "${g.label || "this recipient"}".`);
    } catch (e) {
      vscode.window.showErrorMessage(`Revoke failed: ${errorMessage(e)}`);
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
            rec.expiresAt = s.expiresAt;
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

/** 过期时间的展示:description 里的紧凑徽标 + tooltip 整行 */
function expiryHint(expiresAt: string | null | undefined): { badge: string; line: string } {
  if (expiresAt === undefined) return { badge: "", line: "Expires: refresh to load" };
  if (expiresAt === null) return { badge: "", line: "Expires: never (permanent)" };
  const ms = new Date(expiresAt).getTime() - Date.now();
  const when = new Date(expiresAt).toLocaleString();
  if (ms <= 0) return { badge: "⚠ expired", line: `Expired ${when}` };
  const left = ms < 86400000 ? `${Math.ceil(ms / 3600000)}h` : `${Math.round(ms / 86400000)}d`;
  return { badge: `⏳ ${left}`, line: `Expires ${when}` };
}

class RecentNode extends vscode.TreeItem {
  constructor(public record: Record) {
    const isColl = record.kind === "collection";
    super(
      record.filename,
      isColl ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    const views = record.hits === undefined ? "" : `👁 ${record.hits}`;
    const ver = record.version && record.version > 1 ? `v${record.version}` : "";
    const exp = expiryHint(record.expiresAt);
    const base = isColl ? `Collection · ${record.docs?.length ?? 0} docs` : new URL(record.url).hostname;
    this.description = [base, views, ver, exp.badge].filter(Boolean).join(" · ");
    const viewLine = record.hits === undefined
      ? "Views: click refresh"
      : `Views: ${record.hits}${isColl ? " (index + docs)" : ""}`;
    const verLine = record.version && record.version > 1
      ? `\nVersion: v${record.version}${record.updatedAt ? ` · updated ${new Date(record.updatedAt).toLocaleDateString()}` : ""}`
      : "";
    this.tooltip = `${record.url}\nPublished ${new Date(record.createdAt).toLocaleString()}\n${viewLine}${verLine}\n${exp.line}`;
    this.iconPath = new vscode.ThemeIcon(isColl ? "book" : record.passwordProtected ? "lock" : "globe");
    this.contextValue = "hspacePage";
    // 合集节点展开看篇目,不整体跳转;单页点击直接打开
    if (!isColl) this.command = { command: "hspace.openInBrowser", title: "Open", arguments: [this] };
  }
}

/** 合集下的单篇节点:点击在浏览器打开 <url>/<index> */
class DocNode extends vscode.TreeItem {
  constructor(public url: string, doc: { index: number; title: string }) {
    super(`${doc.index}. ${doc.title}`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("file");
    this.command = {
      command: "vscode.open",
      title: "Open",
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
