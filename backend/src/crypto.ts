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

/** 生成密码通过后的签名 Cookie 值： "<slug>.<exp>.<sig>" */
export async function signCookie(secret: string, slug: string, expEpoch: number): Promise<string> {
  const payload = `${slug}.${expEpoch}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${bufToB64(sig)}`;
}

/** 校验 Cookie：签名有效且未过期且 slug 匹配 */
export async function verifyCookie(secret: string, slug: string, cookie: string): Promise<boolean> {
  const parts = cookie.split(".");
  if (parts.length !== 3) return false;
  const [cSlug, cExp, cSig] = parts;
  if (cSlug !== slug) return false;
  if (Number(cExp) < Math.floor(Date.now() / 1000)) return false;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64ToBytes(cSig),
    enc.encode(`${cSlug}.${cExp}`)
  );
  return ok;
}
