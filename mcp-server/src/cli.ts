#!/usr/bin/env node
// HSpace CLI —— 从终端把一份稿递出去,并在终端里管它。
//
// 为什么有这个:MCP 要配置、编辑器插件只有编辑器里有,但任何 agent 与任何脚本都会跑
// shell。一行 `hspace publish report.md`(零安装:npx --package=hspace-mcp hspace …
// —— npm 上的 `hspace` 是别人的包,别写成 `npx hspace`),Aider / Codex CLI / Makefile /
// 自研 agent 即时可用。另外「发完之后」的动作(回执、每人一链、撤回、续期、版本)在终端此前没有
// 出口,只能开 web console。
//
// 三条硬约束(见 docs/decisions-log.md 2026-07-28):
//   1. 密码永不进 argv —— shell history 与 CI log 都留痕。发布一律自动生成 4 位密码,
//      改密码只从 stdin 读。也**没有** --public:裸 API 的自由度留给 API,不留给客户端。
//   2. 不给 CI 自动发布留示范 —— 链接 7/30 天就过期,「每次 push 发一版」既撞
//      「不做站点托管」红线又制造垃圾页。迭代用 `hspace update <slug>`,链接不变。
//   3. 匿名的 editToken 记在本机(store.ts),否则终端用户发完就再也管不了那一页。

import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  ApiError,
  ConfigError,
  type Auth,
  type PublishResult,
  apiBase,
  createGrant,
  deletePage,
  expiryFromDays,
  listGrants,
  listPages,
  listVersions,
  pageStats,
  patchPage,
  publish,
  randomPin,
  restoreVersion,
  revokeGrant,
} from "./api.js";
import * as store from "./store.js";

// 版本从 package.json 读,避免和发版号漂移(dist/cli.js → ../package.json)
const VERSION: string = (createRequire(import.meta.url)("../package.json") as { version: string }).version;

// ============================ 参数解析 ============================

export interface ParsedArgs {
  cmd: string;
  positional: string[];
  flags: Record<string, string | true>;
}

const VALUE_FLAGS = new Set(["expires", "title", "label", "as"]);

/** 极简解析:`--flag`(布尔)/ `--flag value`(在 VALUE_FLAGS 里)/ `--flag=value` */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const name = a.slice(2);
        if (VALUE_FLAGS.has(name) && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
          flags[name] = argv[++i];
        } else {
          flags[name] = true;
        }
      }
    } else if (a.startsWith("-") && a !== "-") {
      flags[a.slice(1)] = true;
    } else {
      positional.push(a);
    }
  }
  return { cmd: positional.shift() ?? "", positional, flags };
}

// ============================ 内容装配 ============================

export type DocFormat = "markdown" | "html";

export interface Doc {
  name: string;
  content: string;
  format: DocFormat;
}

const MD_EXT = new Set([".md", ".markdown"]);
const HTML_EXT = new Set([".html", ".htm"]);

/** --as 的取值:md / markdown / html;其他一律报错(别让 typo 静默变成 markdown) */
function parseOverride(override?: string): DocFormat | undefined {
  if (override === undefined) return undefined;
  if (override === "md" || override === "markdown") return "markdown";
  if (override === "html") return "html";
  throw new UserError(`--as 只认 md 或 html,不认识:${override}`);
}

export function formatFromName(name: string, override?: string): DocFormat {
  const forced = parseOverride(override);
  if (forced) return forced;
  const ext = extname(name).toLowerCase();
  if (MD_EXT.has(ext)) return "markdown";
  if (HTML_EXT.has(ext)) return "html";
  throw new UserError(`只支持 .md / .markdown / .html / .htm,不认识:${name}`);
}

/** 猜 stdin 的格式:看起来像整页 HTML 就当 html,否则当 markdown(可用 --as 覆盖) */
export function formatFromContent(content: string, override?: string): DocFormat {
  return parseOverride(override) ?? (/^\s*(<!doctype html|<html[\s>])/i.test(content) ? "html" : "markdown");
}

/** 若干文档 → 完整请求体(1 篇=单页,≥2 篇=合集) */
export function contentBody(docs: Doc[], title?: string): Record<string, unknown> {
  if (docs.length === 0) throw new UserError("没有可发布的内容");
  if (docs.length === 1) {
    const d = docs[0];
    return { [d.format]: d.content, filename: d.name };
  }
  return {
    title: title || "合集",
    files: docs.map((d) => ({ name: d.name, [d.format]: d.content })),
  };
}

/** 目标(文件 / 目录 / `-`)→ 文档列表。目录不递归:一份稿就是一层里的那几篇 */
export function collectDocs(target: string, as?: string, readStdin: () => string = readAllStdin): Doc[] {
  if (target === "-") {
    const content = readStdin();
    if (!content.trim()) throw new UserError("stdin 是空的");
    return [{ name: "stdin.md", content, format: formatFromContent(content, as) }];
  }
  const st = statSync(target, { throwIfNoEntry: false });
  if (!st) throw new UserError(`找不到:${target}`);
  if (st.isDirectory()) {
    const names = readdirSync(target)
      .filter((n) => MD_EXT.has(extname(n).toLowerCase()) || HTML_EXT.has(extname(n).toLowerCase()))
      .sort();
    if (names.length === 0) throw new UserError(`${target} 里没有 .md / .html`);
    return names.map((n) => ({
      name: n,
      content: readFileSync(join(target, n), "utf8"),
      format: formatFromName(n, as),
    }));
  }
  return [{ name: basename(target), content: readFileSync(target, "utf8"), format: formatFromName(target, as) }];
}

function readAllStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// ============================ 输出 ============================

class UserError extends Error {}

function out(s = ""): void {
  process.stdout.write(s + "\n");
}

function date(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function isoDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "—";
}

/** 「链接 + 密码」一行,方便一次粘贴发走 */
function reportPublish(r: PublishResult, password: string, json: boolean): void {
  if (json) {
    out(JSON.stringify({ ...r, password }, null, 2));
    return;
  }
  out(`${r.url}  密码: ${password}`);
  const bits: string[] = [];
  if (r.docs) bits.push(`合集 ${r.docs.length} 篇`);
  if (r.expiresAt) bits.push(`有效期至 ${isoDate(r.expiresAt)}`);
  if (bits.length) out(bits.join(" · "));
  out();
  out("把链接和密码一起发给该看的人;没有密码打不开。");
  out(`改了内容不用换链接:hspace update ${r.slug} <文件>`);
}

// ============================ 鉴权 ============================

/** 管理动作的凭据:登录 key 优先,其次本机记下的 editToken(匿名页) */
function authFor(slug: string): Auth {
  const auth: Auth = { apiKey: store.apiKey() };
  const rec = store.recall(slug);
  if (rec?.editToken) auth.editToken = rec.editToken;
  if (!auth.apiKey && !auth.editToken) {
    throw new UserError(
      `没有 ${slug} 的凭据。它是登录后发的?先 hspace login。\n` +
        `是匿名发的、但不是在这台机器上发的?editToken 只在发布时返回一次,没存下就只能重新发布。`,
    );
  }
  return auth;
}

function requireLogin(): Auth {
  const key = store.apiKey();
  if (!key) throw new UserError("这个动作需要登录:hspace login(在 hspace.zhanjian.space/console 拿 API key)");
  return { apiKey: key };
}

// ============================ 命令 ============================

/**
 * 组发布请求体。**密码在这里生成,且只在这里** —— 调用方给不了密码,
 * 所以「密码不进 argv」不是靠自觉,是结构上做不到(有测试守着)。
 */
export function publishBody(docs: Doc[], opts: { title?: string; expiresDays?: number } = {}): {
  body: Record<string, unknown>;
  password: string;
} {
  const body = contentBody(docs, opts.title);
  const password = randomPin();
  body.password = password;
  const exp = expiryFromDays(opts.expiresDays);
  if (exp !== undefined) body.expiresIn = exp;
  return { body, password };
}

async function cmdPublish(a: ParsedArgs): Promise<void> {
  const target = a.positional[0];
  if (!target) throw new UserError("用法:hspace publish <文件|目录|->");
  const docs = collectDocs(target, typeof a.flags.as === "string" ? a.flags.as : undefined);
  const { body, password } = publishBody(docs, {
    title: typeof a.flags.title === "string" ? a.flags.title : undefined,
    expiresDays: a.flags.expires ? Number(a.flags.expires) : undefined,
  });

  const r = await publish(body, { apiKey: store.apiKey() });
  // 先报结果再落盘:页面已经在线上了,存本机失败绝不能把「链接 + 密码」吞掉。
  reportPublish(r, password, !!a.flags.json);
  try {
    store.remember({
      slug: r.slug,
      url: r.url,
      editToken: r.editToken ?? undefined,
      filename: docs.length === 1 ? docs[0].name : (typeof a.flags.title === "string" ? a.flags.title : "合集"),
      isCollection: !!r.docs,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt: r.expiresAt,
    });
  } catch (e) {
    // 存不下来就把凭据显式交回用户手上 —— 否则这一页在线上活着,却没人管得了它
    process.stderr.write(
      `\n⚠️ 稿已经发出去了,但没能记到本机(${store.statePath()}):${(e as Error).message}\n`,
    );
    if (r.editToken) {
      process.stderr.write(
        `请**手工存好**这一页的编辑凭据,它只返回这一次,是后续改/删/查回执的唯一钥匙:\n` +
          `  slug: ${r.slug}\n  editToken: ${r.editToken}\n` +
          `救回方式:修好上面的问题后,把它写进 ${store.statePath()} 的 pages 里;` +
          `或者干脆 hspace rm(需要这把 token)重发一次。\n`,
      );
    }
    process.exitCode = 1;
  }
}

async function cmdUpdate(a: ParsedArgs): Promise<void> {
  const [slug, target] = a.positional;
  if (!slug || !target) throw new UserError("用法:hspace update <slug> <文件|目录|->");
  const docs = collectDocs(target, typeof a.flags.as === "string" ? a.flags.as : undefined);
  // update 只换内容,不碰密码与有效期(改密码走 hspace passwd、续期走 hspace renew)
  const body = contentBody(docs, typeof a.flags.title === "string" ? a.flags.title : undefined);
  const r = await patchPage(slug, body, authFor(slug));
  if (a.flags.json) return out(JSON.stringify(r, null, 2));
  const rec = store.recall(slug);
  out(`已更新 ${rec?.url ?? slug}${r.version ? `(第 ${r.version} 版)` : ""} —— 链接不变,读者刷新即见新内容。`);
}

async function cmdPasswd(a: ParsedArgs): Promise<void> {
  const slug = a.positional[0];
  if (!slug) throw new UserError("用法:hspace passwd <slug>  # 新密码从 stdin 读,或留空自动生成");
  const piped = process.stdin.isTTY ? "" : readAllStdin().trim();
  const password = piped || randomPin();
  await patchPage(slug, { password }, authFor(slug));
  const rec = store.recall(slug);
  if (a.flags.json) return out(JSON.stringify({ ok: true, slug, password }, null, 2));
  out(`${rec?.url ?? slug}  新密码: ${password}`);
  out("旧共享密码不再能通过密码页;但已验证过的浏览器最长 24 小时内仍可读(要立刻踢人用 hspace revoke)。");
}

async function cmdStats(a: ParsedArgs): Promise<void> {
  const slug = a.positional[0];
  if (!slug) throw new UserError("用法:hspace stats <slug>");
  const s = await pageStats(slug, authFor(slug));
  if (a.flags.json) return out(JSON.stringify(s, null, 2));
  out(`${store.recall(slug)?.url ?? slug}`);
  out(`打开 ${s.hits} 次 · ${s.isCollection ? "合集" : "单篇"} · 发布于 ${date(s.createdAt)} · 有效期至 ${isoDate(s.expiresAt)}`);
  if (!s.passwordProtected) out("⚠️ 这一页没有密码,任何拿到链接的人都能看。");
  out("想知道「谁」看的:hspace grant <slug> --label 张三(每人一链,需登录)");
}

async function cmdLs(a: ParsedArgs): Promise<void> {
  const key = store.apiKey();
  const remembered = store.listRemembered();
  if (!key) {
    if (a.flags.json) return out(JSON.stringify({ pages: remembered }, null, 2));
    if (remembered.length === 0) return out("本机还没发过稿(登录后可以列出账户下的全部:hspace login)。");
    out("本机记下的稿(匿名页只在这台机器上有凭据):");
    for (const r of remembered) out(`  ${r.slug}  ${r.filename ?? ""}  发布于 ${date(r.createdAt)}  到期 ${isoDate(r.expiresAt)}`);
    return;
  }
  const { pages } = await listPages({ apiKey: key });
  if (a.flags.json) return out(JSON.stringify({ pages }, null, 2));
  if (pages.length === 0) return out("账户下还没有稿。");
  for (const p of pages) {
    out(`  ${p.slug}  ${p.filename ?? ""}  打开 ${p.hits} 次  到期 ${date(p.expires_at)}${p.protected ? "" : "  ⚠️ 无密码"}`);
  }
}

async function cmdGrant(a: ParsedArgs): Promise<void> {
  const slug = a.positional[0];
  if (!slug) throw new UserError("用法:hspace grant <slug> [--label 张三]");
  const g = await createGrant(slug, typeof a.flags.label === "string" ? a.flags.label : undefined, requireLogin());
  if (a.flags.json) return out(JSON.stringify(g, null, 2));
  out(`${g.url}  密码: ${g.password}${g.label ? `  (${g.label})` : ""}`);
  out("这把密码只给这一个人;要踢掉 TA:hspace revoke " + slug + " " + g.id + "(即时生效,不影响其他人)");
}

async function cmdGrants(a: ParsedArgs): Promise<void> {
  const slug = a.positional[0];
  if (!slug) throw new UserError("用法:hspace grants <slug>");
  const { grants } = await listGrants(slug, authFor(slug));
  if (a.flags.json) return out(JSON.stringify({ grants }, null, 2));
  if (grants.length === 0) return out("还没有访问人(每人一链:hspace grant " + slug + " --label 张三)。");
  for (const g of grants) {
    out(`  ${g.id}  ${g.label ?? "(无标签)"}  打开 ${g.hits} 次  最后 ${date(g.last_seen_at)}${g.revoked ? "  已撤销" : ""}`);
  }
}

async function cmdRevoke(a: ParsedArgs): Promise<void> {
  const [slug, id] = a.positional;
  if (!slug || !id) throw new UserError("用法:hspace revoke <slug> <访问人 id>(id 见 hspace grants <slug>)");
  await revokeGrant(slug, id, authFor(slug));
  out(`已踢掉 ${id} —— 即时生效,其他访问人不受影响。`);
}

async function cmdRenew(a: ParsedArgs): Promise<void> {
  const slug = a.positional[0];
  if (!slug) throw new UserError("用法:hspace renew <slug> [--expires 天数]");
  const exp = expiryFromDays(a.flags.expires ? Number(a.flags.expires) : undefined);
  await patchPage(slug, { expiresIn: exp ?? null }, requireLogin());
  const s = await pageStats(slug, requireLogin());
  out(`已续期到 ${isoDate(s.expiresAt)}(没有永久链接:每期最长 30 天,到期前可再续)。`);
}

async function cmdRm(a: ParsedArgs): Promise<void> {
  const slug = a.positional[0];
  if (!slug) throw new UserError("用法:hspace rm <slug>");
  await deletePage(slug, authFor(slug));
  store.forget(slug);
  out(`已删除 ${slug} —— 链接立即失效。`);
}

async function cmdVersions(a: ParsedArgs): Promise<void> {
  const slug = a.positional[0];
  if (!slug) throw new UserError("用法:hspace versions <slug>");
  const v = await listVersions(slug, requireLogin());
  if (a.flags.json) return out(JSON.stringify(v, null, 2));
  for (const row of v.versions) {
    out(`  v${row.version}${row.version === v.current ? " ←当前" : ""}  ${(row.size_bytes / 1024).toFixed(1)} KB  ${date(row.created_at)}`);
  }
  out(`回滚:hspace restore ${slug} <版本号>`);
}

async function cmdRestore(a: ParsedArgs): Promise<void> {
  const [slug, v] = a.positional;
  if (!slug || !v) throw new UserError("用法:hspace restore <slug> <版本号>");
  const r = await restoreVersion(slug, Number(v), requireLogin());
  out(`已回滚到 v${r.restoredFrom}(记为第 ${r.version} 版)—— 链接不变。`);
}

function cmdLogin(): void {
  const key = process.stdin.isTTY ? "" : readAllStdin().trim();
  if (!key) {
    out("把 API key 从 stdin 传进来(别写在命令行里,shell history 会留痕):");
    out("  pbpaste | hspace login        # 或");
    out("  hspace login < key.txt");
    out("key 在 https://hspace.zhanjian.space/console 生成。");
    process.exitCode = 1;
    return;
  }
  store.setApiKey(key);
  out(`已保存到 ${store.statePath()}(权限 0600)。也可以改用环境变量 HSPACE_API_KEY。`);
}

function cmdLogout(): void {
  store.setApiKey(undefined);
  out("已清除本机保存的 API key(记下的 editToken 保留,匿名页还管得了)。");
}

async function cmdWhoami(): Promise<void> {
  out(`API: ${apiBase()}`);
  out(`状态文件: ${store.statePath()}(按 API 地址分仓)`);
  if (process.env.HSPACE_API_KEY) {
    out("凭据: 环境变量 HSPACE_API_KEY(优先于本机保存的)");
  } else if (store.apiKey()) {
    out("凭据: 本机保存的 API key(这个 API 地址下的)");
  } else {
    out("凭据: 未登录(匿名可发,7 天一次性、不可续)");
    // 常见误用:设了 HSPACE_API_BASE 指向别处,却以为还在用官方那把 key。
    // 凭据不跨地址取用,所以这里只提示,不会把 key 递给当前地址。
    const others = store.otherOriginsWithKey();
    if (others.length) out(`  (为其他 API 地址存过 key:${others.join("、")} —— 凭据不跨地址取用)`);
  }
}

const HELP = `hspace —— 从终端把一份稿递出去(链接 + 密码,只给该看的人)

发布与迭代
  hspace publish <文件|目录|->     发布;目录里的多篇自动成合集,- 从 stdin 读
  hspace update <slug> <文件|目录> 换内容,**链接不变**,旧版可回滚
  hspace passwd <slug>             改密码(新密码从 stdin 读,留空则自动生成)

发完之后
  hspace ls                        列出稿(登录=账户全部;未登录=本机记下的)
  hspace stats <slug>              访问回执:被打开几次
  hspace grant <slug> --label 张三 每人一链:给一个人单独一把密码(需登录)
  hspace grants <slug>             看访问人与各自的打开次数
  hspace revoke <slug> <id>        踢掉某个访问人(即时生效,不动其他人)
  hspace renew <slug>              续期(需登录;每期最长 30 天)
  hspace versions|restore <slug>   版本历史 / 回滚(需登录)
  hspace rm <slug>                 删除,链接立即失效

账户
  hspace login                     从 stdin 读 API key(不要写进命令行)
  hspace logout / whoami

选项
  --json           机器可读输出
  --expires <天>   有效期(1–30;省略用默认:匿名 7 天、登录 30 天)
  --title <标题>   合集标题
  --as md|html     覆盖格式判断(stdin 或后缀不常规时用)

环境变量
  HSPACE_API_KEY   登录凭据(优先于 hspace login 保存的)
  HSPACE_API_BASE  自建后端地址

说明
  · 发布一律自动生成 4 位密码(私密是默认);密码永不通过命令行参数传,避免进
    shell history 与 CI 日志。
  · 没有永久链接:所有链接都会过期。稿改了就 hspace update,**别重新发布**——
    链接不变,读者不用换书签,你也不会攒下一堆过期页。
  · 匿名发布的 editToken 记在 ~/.config/hspace/state.json(0600,认 XDG_CONFIG_HOME),
    它是后续改/删/查回执的唯一凭据。换机器就管不了那一页了。`;

const COMMANDS: Record<string, (a: ParsedArgs) => void | Promise<void>> = {
  publish: cmdPublish,
  update: cmdUpdate,
  passwd: cmdPasswd,
  stats: cmdStats,
  ls: cmdLs,
  list: cmdLs,
  grant: cmdGrant,
  grants: cmdGrants,
  revoke: cmdRevoke,
  renew: cmdRenew,
  rm: cmdRm,
  delete: cmdRm,
  versions: cmdVersions,
  restore: cmdRestore,
  login: cmdLogin,
  logout: cmdLogout,
  whoami: cmdWhoami,
};

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  if (a.flags.version || a.flags.v || a.cmd === "version") return out(VERSION);
  if (!a.cmd || a.cmd === "help" || a.flags.help || a.flags.h) return out(HELP);
  const fn = COMMANDS[a.cmd];
  if (!fn) {
    process.stderr.write(`不认识的命令:${a.cmd}\n\n${HELP}\n`);
    process.exitCode = 1;
    return;
  }
  await fn(a);
}

/**
 * 只有被当成入口跑时才执行 —— 被 import(测试、复用它的脚本)时不能有副作用。
 * 用 realpath 比较:npm 的 bin 是软链,argv[1] 指向 .bin/hspace,直接比字符串会漏。
 */
function isEntrypoint(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return pathToFileURL(realpathSync(arg)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main().catch(reportFailure);
}

function reportFailure(e: unknown): void {
  if (e instanceof UserError || e instanceof ConfigError || e instanceof store.StateCorruptError) {
    process.stderr.write(`${e.message}\n`);
  } else if (e instanceof ApiError) {
    process.stderr.write(`${explain(e)}\n`);
  } else {
    process.stderr.write(`失败:${(e as Error).message}\n`);
  }
  process.exitCode = 1;
}

/** 把后端错误码翻成人话(顺带把「该怎么办」说清楚) */
function explain(e: ApiError): string {
  const map: Record<string, string> = {
    not_found: "这一页不存在、已删除或已过期。",
    expired: "链接已过期,过期后不能再更新或续期——重新发布会拿到新链接。",
    forbidden: "本机的凭据管不了这一页(不是这台机器发的?或该用登录账户?)。",
    login_required: "这个能力是登录专属:hspace login。",
    renew_requires_login: "匿名链接是一次性的、不可续期(7 天)。登录后可续:hspace login。",
    password_removal_requires_login: "匿名页面必须保持密码保护。",
    content_type_mismatch: "内容类型和原页面不一致:md 只能换 md、html 换 html、合集换合集。",
    collection_too_few: "合集至少要 2 篇。",
    too_many_docs: "篇数超过上限(匿名 5 篇;登录更多)。",
    too_large: "内容超过体积上限(匿名 512KB;登录更大)。",
    content_blocked: "内容被安全扫描拦下了。",
    rate_limited: "发布太频繁,过一会儿再来。",
    service_busy: "服务繁忙(全局日配额熔断),稍后再试。",
    invalid_api_key: "API key 无效:重新 hspace login。",
    unauthorized: "需要登录:hspace login。",
  };
  return map[e.code] ?? `请求失败:${e.message}`;
}
