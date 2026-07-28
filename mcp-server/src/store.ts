// CLI 的本地状态:`~/.config/hspace/state.json`(权限 0600)。
//
// 存在的理由:匿名发布返回的 `editToken` 是后续改内容/查回执/删页的**唯一凭据**。
// MCP 只是把它打印一行就没了,VS Code 插件存在自己的 workspace state 里;
// 终端用户此前没有任何地方存它。记下来,匿名不登录也能 `hspace stats <slug>`。
//
// 不存密码:密码是给读者的,发完就该只存在于你发出去的那条消息里。

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface PageRecord {
  slug: string;
  url: string;
  editToken?: string;
  filename?: string;
  isCollection?: boolean;
  createdAt: number;
  expiresAt?: string | null;
}

interface State {
  apiKey?: string;
  pages: Record<string, PageRecord>;
}

const EMPTY: State = { pages: {} };

export function statePath(): string {
  const base = process.env.HSPACE_CONFIG_DIR
    || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "hspace");
  return join(base, "state.json");
}

export function load(): State {
  try {
    const raw = readFileSync(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<State>;
    return { apiKey: parsed.apiKey, pages: parsed.pages ?? {} };
  } catch {
    return { ...EMPTY, pages: {} };
  }
}

export function save(state: State): void {
  const p = statePath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  // 先写后 chmod 会有一瞬间的 0644 窗口;mode 传给 writeFileSync 只在新建时生效,
  // 所以两个都做:新建即 0600,已存在的也强制收回。
  writeFileSync(p, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  chmodSync(p, 0o600);
}

export function remember(rec: PageRecord): void {
  const state = load();
  state.pages[rec.slug] = { ...state.pages[rec.slug], ...rec };
  save(state);
}

export function forget(slug: string): void {
  const state = load();
  delete state.pages[slug];
  save(state);
}

export function recall(slug: string): PageRecord | undefined {
  return load().pages[slug];
}

export function listRemembered(): PageRecord[] {
  return Object.values(load().pages).sort((a, b) => b.createdAt - a.createdAt);
}

export function setApiKey(key: string | undefined): void {
  const state = load();
  state.apiKey = key;
  save(state);
}

/** 环境变量优先于存下来的 key —— CI/自建场景不该被本机状态覆盖 */
export function apiKey(): string | undefined {
  return process.env.HSPACE_API_KEY || load().apiKey;
}
