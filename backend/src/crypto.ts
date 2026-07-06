// 加密/编码工具 —— 全部基于 Workers 内置 Web Crypto

// slug 会作为子域名出现，而域名不区分大小写，因此只用小写+数字
const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 生成 base36 随机短码，默认 7 位 */
export function randomSlug(len = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += B36[b % 36];
  return out;
}

/** 生成随机不透明 token（用于匿名 editToken / api key），hex */
export function randomToken(bytes = 24): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = new TextEncoder();

/** SHA-256 → base64（用于对 token / api key 做单向存储比对） */
export async function sha256b64(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return bufToB64(digest);
}

/** PBKDF2 派生密码哈希，返回 { hash, salt }（均 base64） */
export async function hashPassword(
  password: string,
  saltB64?: string
): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { hash: bufToB64(bits), salt: bufToB64(salt) };
}

/** 校验密码是否匹配存储的 hash+salt（常量时间比较） */
export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  const { hash } = await hashPassword(password, storedSalt);
  return timingSafeEqual(hash, storedHash);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** 生成密码通过后的签名 Cookie 值： "<slug>.<grantId>.<exp>.<sig>"（grantId="" 表示共享密码） */
export async function signCookie(secret: string, slug: string, grantId: string, expEpoch: number): Promise<string> {
  const payload = `${slug}.${grantId}.${expEpoch}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${bufToB64(sig)}`;
}

/**
 * 校验 Cookie：签名有效且未过期且 slug 匹配。
 * 返回归因的 grantId（共享密码为 ""），无效返回 null。
 * 兼容旧的三段格式 "<slug>.<exp>.<sig>"（视为 grantId=""）。
 */
export async function verifyCookie(secret: string, slug: string, cookie: string): Promise<string | null> {
  const parts = cookie.split(".");
  let cSlug: string, grantId: string, cExp: string, cSig: string;
  if (parts.length === 4) {
    [cSlug, grantId, cExp, cSig] = parts;
  } else if (parts.length === 3) {
    [cSlug, cExp, cSig] = parts;
    grantId = "";
  } else {
    return null;
  }
  if (cSlug !== slug) return null;
  if (Number(cExp) < Math.floor(Date.now() / 1000)) return null;
  const key = await hmacKey(secret);
  const payload = parts.length === 4 ? `${cSlug}.${grantId}.${cExp}` : `${cSlug}.${cExp}`;
  const ok = await crypto.subtle.verify("HMAC", key, b64ToBytes(cSig), enc.encode(payload));
  return ok ? grantId : null;
}

/** 签发登录会话 Cookie 值:"<ownerId>.<exp>.<sig>"(ownerId 形如 gh:123,不含 ".") */
export async function signSession(secret: string, ownerId: string, expEpoch: number): Promise<string> {
  const payload = `${ownerId}.${expEpoch}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${bufToB64(sig)}`;
}

/** 校验会话 Cookie:签名有效且未过期返回 ownerId,否则 null */
export async function verifySession(secret: string, cookie: string): Promise<string | null> {
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [ownerId, exp, sig] = parts;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  const key = await hmacKey(secret);
  try {
    const ok = await crypto.subtle.verify("HMAC", key, b64ToBytes(sig), enc.encode(`${ownerId}.${exp}`));
    return ok ? ownerId : null;
  } catch {
    return null; // 畸形 base64(atob 抛错)一律视为无效
  }
}

/**
 * 作用域短令牌(收藏流用):"<scope>.<slug>.<grantId>.<exp>.<sig>"(grantId="" 表示共享密码/无口令)。
 * scope 前缀隔离用途(save=阅读页→console 的收藏凭证;open=console→内容页的免密开门凭证),
 * 防止两种令牌被交叉使用。slug/grantId/exp 均不含 ".",base64 签名亦无 ".",故恒为 5 段。
 */
export async function signScopedToken(
  secret: string, scope: string, slug: string, grantId: string, expEpoch: number
): Promise<string> {
  const payload = `${scope}.${slug}.${grantId}.${expEpoch}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${bufToB64(sig)}`;
}

/** 校验作用域令牌:scope 匹配、未过期、签名有效则返回 {slug, grantId},否则 null */
export async function verifyScopedToken(
  secret: string, scope: string, token: string
): Promise<{ slug: string; grantId: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [sc, slug, grantId, exp, sig] = parts;
  if (sc !== scope) return null;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  const key = await hmacKey(secret);
  try {
    const ok = await crypto.subtle.verify("HMAC", key, b64ToBytes(sig), enc.encode(`${sc}.${slug}.${grantId}.${exp}`));
    return ok ? { slug, grantId } : null;
  } catch {
    return null;
  }
}
