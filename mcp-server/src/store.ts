// CLI 的本地状态:`~/.config/hspace/state.json`(权限 0600)。
//
// 存在的理由:匿名发布返回的 `editToken` 是后续改内容/查回执/删页的**唯一凭据**。
// MCP 只是把它打印一行就没了,VS Code 插件存在自己的 workspace state 里;
// 终端用户此前没有任何地方存它。记下来,匿名不登录也能 `hspace stats <slug>`。
//
// 不存密码:密码是给读者的,发完就该只存在于你发出去的那条消息里。
//
// 三条硬性质(都有测试守着):
//   1. **按 API 地址分仓**。官方实例、localhost、自建实例各存一份 —— 否则
//      `HSPACE_API_BASE=http://someone-else` 跑一条命令就会把官方 key 递给对方。
//   2. **原子写**:写临时文件 → fsync → rename,外加一把文件锁。多个 hspace
//      并发跑(xargs -P、CI 矩阵)不会互相把刚存的 token 覆盖掉。
//   3. **坏文件不当空文件**:解析失败会备份并报错,绝不静默当空状态然后覆盖 ——
//      那等于把还活着的匿名页的唯一凭据删掉。

import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync, fsyncSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { apiBaseKey } from "./api.js";

export interface PageRecord {
  slug: string;
  url: string;
  editToken?: string;
  filename?: string;
  isCollection?: boolean;
  createdAt: number;
  expiresAt?: string | null;
}

interface OriginState {
  apiKey?: string;
  pages: Record<string, PageRecord>;
}

interface State {
  version: 2;
  /** key = 规范化后的 API 地址(见 api.ts apiBaseKey) */
  origins: Record<string, OriginState>;
}

/** 状态文件损坏(不是「不存在」)—— 调用方必须看见,不能当空状态 */
export class StateCorruptError extends Error {}

export function statePath(): string {
  const base = process.env.HSPACE_CONFIG_DIR
    || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "hspace");
  return join(base, "state.json");
}

function emptyState(): State {
  return { version: 2, origins: {} };
}

/** v1(扁平 apiKey + pages)是在只有官方实例的时代写的 —— 迁到官方地址那一仓 */
function migrate(parsed: Record<string, unknown>): State {
  if (parsed.version === 2 && parsed.origins) return parsed as unknown as State;
  const legacy = parsed as { apiKey?: string; pages?: Record<string, PageRecord> };
  if (legacy.apiKey === undefined && !legacy.pages) return emptyState();
  return {
    version: 2,
    origins: { [apiBaseKey()]: { apiKey: legacy.apiKey, pages: legacy.pages ?? {} } },
  };
}

function readState(): State {
  let raw: string;
  try {
    raw = readFileSync(statePath(), "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyState(); // 还没用过:这才是「空」
    throw new StateCorruptError(`读不到状态文件 ${statePath()}(${code}) —— 先处理它,别让命令继续把它覆盖掉。`);
  }
  try {
    return migrate(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    // 坏了就备份一份再报错:里面可能是还活着的匿名页的唯一凭据
    const backup = `${statePath()}.corrupt-${Date.now()}`;
    try {
      writeFileSync(backup, raw, { mode: 0o600 });
    } catch {
      /* 备份不了也要报错,不能静默 */
    }
    throw new StateCorruptError(
      `状态文件不是合法 JSON:${statePath()}\n` +
        `已把原文备份到 ${backup}(里面可能有还活着的匿名页的 editToken,手工救回后再删)。`,
    );
  }
}

/** 原子写:同目录临时文件 → fsync → rename。中断不会留下半个文件 */
function writeAtomic(state: State): void {
  const p = statePath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.tmp-${process.pid}`;
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, JSON.stringify(state, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(tmp, 0o600); // umask 影响不到 rename 后的权限
  renameSync(tmp, p);
}

const LOCK_TIMEOUT_MS = 2000;
const LOCK_STALE_MS = 30_000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 读-改-写全程持锁 —— 并发的 hspace 进程不会把彼此刚写的 token 覆盖掉。
 * 拿不到锁就等,超时后按「陈旧锁」处理(进程被 kill 会留下锁文件)。
 */
function withLock<T>(fn: (state: State) => { state?: State; result: T }): T {
  const lock = `${statePath()}.lock`;
  mkdirSync(dirname(lock), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let fd: number | undefined;
  for (;;) {
    try {
      fd = openSync(lock, "wx", 0o600); // wx = O_EXCL,已存在就抛
      break;
    } catch {
      const age = (() => {
        try {
          return Date.now() - statSync(lock).mtimeMs;
        } catch {
          return 0; // 刚好被别人释放了,重试
        }
      })();
      if (age > LOCK_STALE_MS) {
        rmSync(lock, { force: true }); // 陈旧锁:持锁进程已经不在了
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`拿不到状态文件锁(${lock})—— 另一个 hspace 还在写。稍后重试,或确认没有卡死的进程。`);
      }
      sleep(25);
    }
  }
  try {
    const state = readState();
    const { state: next, result } = fn(state);
    if (next) writeAtomic(next);
    return result;
  } finally {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(lock);
    } catch {
      /* 已被清掉 */
    }
  }
}

function bucket(state: State): OriginState {
  const key = apiBaseKey();
  state.origins[key] ??= { pages: {} };
  return state.origins[key];
}

export function remember(rec: PageRecord): void {
  withLock((state) => {
    const b = bucket(state);
    b.pages[rec.slug] = { ...b.pages[rec.slug], ...rec };
    return { state, result: undefined };
  });
}

export function forget(slug: string): void {
  withLock((state) => {
    delete bucket(state).pages[slug];
    return { state, result: undefined };
  });
}

export function recall(slug: string): PageRecord | undefined {
  return bucket(readState()).pages[slug];
}

export function listRemembered(): PageRecord[] {
  return Object.values(bucket(readState()).pages).sort((a, b) => b.createdAt - a.createdAt);
}

export function setApiKey(key: string | undefined): void {
  withLock((state) => {
    bucket(state).apiKey = key;
    return { state, result: undefined };
  });
}

/**
 * 环境变量优先于存下来的 key —— CI/自建场景不该被本机状态覆盖。
 * 存下来的 key 只在**同一个 API 地址**下取用(见文件头第 1 条)。
 */
export function apiKey(): string | undefined {
  if (process.env.HSPACE_API_KEY) return process.env.HSPACE_API_KEY;
  try {
    return bucket(readState()).apiKey;
  } catch (e) {
    if (e instanceof StateCorruptError) throw e;
    return undefined;
  }
}

/** 有没有为**别的** API 地址存过 key —— 用于「你是不是设错了 HSPACE_API_BASE」这类提示 */
export function otherOriginsWithKey(): string[] {
  try {
    const state = readState();
    const here = apiBaseKey();
    return Object.entries(state.origins)
      .filter(([k, v]) => k !== here && v.apiKey)
      .map(([k]) => k);
  } catch {
    return [];
  }
}
