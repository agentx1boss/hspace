# From Zero to Live: Building a "Targeted Sharing" Tool for AI Content on Cloudflare's Edge (The HSpace Full-Stack Tutorial)

> The **detailed, hands-on** build guide. It shows the real code for the tricky parts (edge password gate, cookies, edge Markdown rendering), the data model, a local-dev loop, and every account/DNS/secret step — enough to clone the repo and stand up your own instance.
>
> *(Want the 1-page overview instead? See the interactive "at a glance" HTML in this collection. This doc is the deep version.)*
>
> - **Source (clone this):** <https://github.com/agentx1boss/hspace> (MIT)
> - **Live demo:** <https://hspace.zhanjian.space>
> - **Prerequisites:** Node ≥ 18, a [Cloudflare](https://dash.cloudflare.com) account with **a domain (zone) on it**, a GitHub account. Budget ~an afternoon.

**Mini-glossary:** **slug** = short random page id (`a7k2m9x`); **edge** = Cloudflare's nearest-to-user compute; **TTL** = link expiry; **grant** = one recipient's own password record; **PBKDF2 / HMAC** = the password-hashing / cookie-signing algorithms (Web Crypto).

## 0. What it is, and the invariants

**HSpace = "targeted sharing" for AI-coding developers**: turn the HTML demo or Markdown doc your AI just wrote into a **link + password**, sent only to the people who should see it — with view receipts, instant revocation, and iteration without changing the link. Positioning: **Ship to one, not to all.**

Four invariants shape everything below:

- **Mandatory password** is the product's identity — no public gallery.
- **No permanent links**: every link expires (anon 3 days, signed-in 30 days/term, renewable). Exception: first-party pinned content (`expires_at=NULL` set directly in the DB — an ops action, not a feature).
- **Content pages are `noindex` + gated** — only the landing page is indexable.
- **Self-contained pages**: everything inlines its CSS/JS/SVG; zero external resources.

## 1. Architecture: one Worker, routed by hostname

The entire backend is a single Cloudflare Worker. The whole dispatch is "which host did the request hit" — here's the real shape ([`backend/src/index.ts`](https://github.com/agentx1boss/hspace/blob/main/backend/src/index.ts)):

```ts
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;

    if (url.pathname === "/e") return recordEvent(url, env, ctx);   // first-party beacon

    // Landing host: hspace.<domain> — landing, legal, console, OAuth, openapi…
    if (host === "hspace." + env.USERCONTENT_DOMAIN) {
      const auth = await handleAuth(url, request, env);             // /auth/github*
      if (auth) return auth;
      if (url.pathname === "/console") return serveConsole(url, request, env);
      if (url.pathname === "/robots.txt") return robotsResp(true, env);
      // …brand assets, /privacy, /terms, "/", /openapi.json → else handleApi()
    }

    // Content host: <slug>.<domain> → serve the page (behind the gate)
    if (host.endsWith("." + env.USERCONTENT_DOMAIN)) {
      const slug = host.slice(0, host.length - env.USERCONTENT_DOMAIN.length - 1);
      return servePage(slug, url.pathname, request, env, ctx);
    }

    // Dev convenience: /p/<slug> serves a page without the wildcard host (see §7)
    if (url.pathname.startsWith("/p/")) { /* … */ }

    return handleApi(url, request, env, ctx);                        // API host
  },
};
```

One codebase is the content host, the landing site, and the API — chosen by `host`. The wildcard subdomain `*.<domain>` is what lets every share be its own `<slug>.<domain>` with no per-share record.

## 2. The data model (D1)

Seven tables ([full DDL](https://github.com/agentx1boss/hspace/blob/main/backend/schema.sql)). The two that matter most:

```sql
CREATE TABLE pages (
  slug          TEXT PRIMARY KEY,     -- the subdomain id
  owner_id      TEXT,                 -- 'gh:<id>' when signed-in; NULL when anonymous
  edit_token_hash TEXT,               -- anonymous edit/delete credential (hashed)
  object_key    TEXT NOT NULL,        -- where the content lives in R2
  password_hash TEXT, password_salt TEXT,   -- PBKDF2 (base64); NULL = no password
  created_at INTEGER, expires_at INTEGER,   -- epoch seconds; expires_at NULL = pinned (first-party only)
  size_bytes INTEGER, hits INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',        -- active | deleted | blocked
  version INTEGER DEFAULT 1, updated_at INTEGER
);

CREATE TABLE grants (                  -- "per-recipient links"
  id TEXT PRIMARY KEY, slug TEXT NOT NULL,
  label TEXT,                          -- e.g. "Alice"
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
  created_at INTEGER, revoked INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0, last_seen_at INTEGER   -- per-person receipts
);
```

The rest: `versions` (one row per content update, `object_key` → that version's bytes), `api_keys` (`key_hash` = SHA-256 of the key), `users` (`owner_id='gh:<id>'`), `metrics` (cookieless landing beacon), `reports` (abuse reports). **There is no `receipts` table** — "receipts" are just `pages.hits` and per-grant `grants.hits`/`last_seen_at`.

**R2 key scheme** (the suffix *is* the type): `pages/<slug>.md`, `pages/<slug>.html`, a collection is `pages/<slug>/index.json`, and a version is `pages/<slug>.vN.<ext>`. Content is stored **plaintext** — the security model is HTTPS-in-transit + password hashing, never "encrypted storage."

## 3. The edge password gate (real code)

This is the core. When a recipient hits `<slug>.<domain>`:

**1) Passwords are PBKDF2-hashed, never stored in plaintext** ([`backend/src/crypto.ts`](https://github.com/agentx1boss/hspace/blob/main/backend/src/crypto.ts)):

```ts
// hashPassword: 100k iterations, SHA-256, 256-bit → base64 {hash, salt}
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
  keyMaterial, 256,
);
// verify uses a constant-time compare (timingSafeEqual) to avoid timing leaks
```

**2) On success, set an HMAC-signed cookie and 303 back to the path:**

```ts
// cookie value = "<slug>.<grantId>.<exp>.<sig>"   (grantId="" = shared password)
// sig = HMAC-SHA256( "<slug>.<grantId>.<exp>", COOKIE_SIGNING_SECRET )
export async function signCookie(secret, slug, grantId, expEpoch) {
  const payload = `${slug}.${grantId}.${expEpoch}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${bufToB64(sig)}`;
}
```

`verifyCookie` re-derives the HMAC and checks: signature valid **and** not expired **and** slug matches. The returned `grantId` is how per-recipient receipts are attributed (empty string = the page's shared password). The old 3-part format `<slug>.<exp>.<sig>` is still accepted for backward-compat.

**Why these choices:**
- **base36 lowercase slug** — subdomains are DNS-case-insensitive, so a mixed-case base62 slug would collide; `crypto.getRandomValues` over `0-9a-z`.
- **303 (not 302) back to the original path** — so a deep link (doc N in a collection) lands directly after the gate, and the re-request is a clean GET.
- **grantId baked into the signed payload** — a forwarded cookie can't be re-pointed to a different recipient, and revoking one grant invalidates only that person.

**The lifecycle, in curl:**

```bash
# 1. First visit — no cookie → 401 password page
curl -i https://<slug>.<domain>/            # HTTP/1.1 401

# 2. Submit the password → 303 + Set-Cookie, redirect back
curl -i -X POST -d 'password=1234' https://<slug>.<domain>/
# HTTP/1.1 303 … Set-Cookie: hs_<slug>=<slug>...<sig>; …  Location: /

# 3. With the cookie → the rendered page (200)
curl -i -b 'hs_<slug>=<slug>...<sig>' https://<slug>.<domain>/
```

Anti-abuse layers around the gate: a brute-force lockout (10 fails / 15 min via KV), plus the publish-side gates in §5.

## 4. Markdown rendering at the edge

Markdown is stored raw in R2 and rendered on read with `marked` — no build step, and template changes apply to already-published content instantly:

```ts
import { marked } from "marked";
const article = await marked.parse(md, { gfm: true, async: true });
return htmlResp(readingPage(mdTitle(md, page.filename), article, nav, updatedAt), 200);
```

`mdTitle` uses the first `#` heading as the page title. `readingPage` is a self-contained template (inline CSS, light/dark via `prefers-color-scheme`, CJK font stacks). HTML pages are served as-is; in a collection, an HTML doc gets a small floating "← back to contents" button injected.

## 5. Anti-abuse gates (with real thresholds)

All tunable in `wrangler.toml [vars]`; anonymous is deliberately tighter to nudge sign-in:

| Gate | Var | Default | Where |
|---|---|---|---|
| Per-IP hourly publishes | `RATE_LIMIT_PER_HOUR` | 20 | KV counter |
| Per-IP daily publishes (anon) | `RATE_LIMIT_PER_DAY` | 50 | KV counter |
| Single-file size (anon / signed-in) | `ANON_MAX_SIZE_BYTES` / `MAX_SIZE_BYTES` | 512 KB / 2 MB | publish |
| Docs per collection (anon / signed-in) | `ANON_MAX_DOCS` / `MAX_DOCS` | 3 / 50 | publish |
| Per-page hit cap (anon) | `ANON_MAX_HITS` | 10000 | serve |
| Global daily anon bytes (circuit breaker) | `ANON_DAILY_GLOBAL_BYTES` | 500 MB | publish |
| Anon TTL clamp | `ANON_DEFAULT_TTL` | 3 days | publish |
| Brute-force lockout | — | 10 fails / 15 min | gate (KV) |

Plus content scanning (phishing/malicious regex) at publish time.

## 6. ⭐ Build your own — step by step

### Step 0 — Clone & install

```bash
git clone https://github.com/agentx1boss/hspace
cd hspace/backend && npm install
npm i -g wrangler && wrangler login      # opens the browser
```

### Step 1 — Create resources + tables

```bash
wrangler r2 bucket create <bucket-name>
wrangler d1 create <db-name>
# → prints a [[d1_databases]] block; copy its database_id
wrangler kv namespace create RATELIMIT
# → prints { binding = "RATELIMIT", id = "…" }; copy the id
wrangler d1 execute <db-name> --file=./schema.sql   # creates the 7 tables
```

### Step 2 — Fill `wrangler.toml`

Binding names (`BUCKET` / `DB` / `RATELIMIT`) are fixed — the Worker reads them by name; only resource names/ids and your domain change.

```toml
name = "html-share"
main = "src/index.ts"
compatibility_date = "2024-11-01"
account_id = "<your-account-id>"
workers_dev = true
routes = [{ pattern = "*.<your-domain>/*", zone_name = "<your-domain>" }]

[vars]
USERCONTENT_DOMAIN = "<your-domain>"
ANON_DEFAULT_TTL = "259200"     # 3 days
OWNER_MAX_TTL   = "2592000"     # 30 days
# …size/rate/limit vars from §5 (full file in the repo)

[[r2_buckets]]     { binding = "BUCKET", bucket_name = "<bucket-name>" }
[[d1_databases]]   { binding = "DB", database_name = "<db-name>", database_id = "<database_id>" }
[[kv_namespaces]]  { binding = "RATELIMIT", id = "<kv-id>" }
```

*(The `[[...]]` blocks are shown compact here; in real TOML each is a multi-line table — see the repo's `wrangler.toml`.)*

### Step 3 — DNS + Route (the step people get stuck on — both are required)

1. **A proxied wildcard DNS record** so the hostname resolves to Cloudflare's edge. Dashboard → DNS → add `AAAA`: name `*`, content `100::` (a discard address), **Proxy status = Proxied (orange cloud)**. Add a second proxied record for the `hspace` landing subdomain.
2. **The Workers route** — the `routes` entry from Step 2 binds `*.<domain>/*` to this Worker. (DNS lands the request on Cloudflare; the route binds the Worker. You never point DNS "at a Worker" directly.)

### Step 4 — Secrets & GitHub OAuth (never in the toml)

```bash
wrangler secret put COOKIE_SIGNING_SECRET   # long random string (password-cookie HMAC)
wrangler secret put SESSION_SECRET          # long random string (login-session HMAC)
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

Create the OAuth App at **GitHub → Settings → Developer settings → OAuth Apps → New**:
- **Authorization callback URL** (must match exactly): `https://hspace.<your-domain>/auth/github/callback`
- **Scopes:** none (HSpace only reads your public identity).

Flow: `/auth/github` (start) → GitHub → `/auth/github/callback` → session cookie; users manage login + API keys at **`/console`**.

### Step 5 — Local dev loop (before you deploy)

You don't need the wildcard domain to develop — there's a `/p/<slug>` dev route:

```bash
npm run db:init:local                 # apply schema to the local D1
npm run dev                           # wrangler dev → http://localhost:8787
# publish against localhost, then open the page via the dev route:
curl -X POST http://localhost:8787/publish \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# Hello\nlocal","password":"1234"}'
# open http://localhost:8787/p/<slug>  → the password gate → enter 1234
```

### Step 6 — Deploy & ✅ verify

```bash
npm run deploy                                          # = wrangler deploy
curl https://<worker>.<sub>.workers.dev/health          # → {"ok":true,"service":"hspace"}
open https://hspace.<your-domain>/console               # GitHub login → copy API key
curl -X POST https://<worker>.<sub>.workers.dev/publish \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# Hello\nprivate world","password":"1234"}'
# open the returned url → password gate → enter 1234 → it renders. Done.
```

### Troubleshooting

- **`<slug>.<domain>` won't resolve / 522** → missing the proxied wildcard DNS record *or* the Workers route (Step 3 needs **both**).
- **OAuth `redirect_uri mismatch`** → the callback must byte-for-byte equal `…/auth/github/callback`.
- **`D1_ERROR` / binding undefined** → the binding must be named `DB` (and `BUCKET`, `RATELIMIT`); confirm `schema.sql` ran.
- **`too_large` / `rate_limited`** → expected anti-abuse (§5); raise the `[vars]` or sign in.

## 7. Distribution channels & CI/CD

All four channels live in the repo: the VS Code/Cursor extension (`vscode-extension/`), the MCP server (`mcp-server/`, `hspace-mcp`), the Claude Code plugin (`clients/claude-code/`, `/share`), and OpenAPI (`/openapi.json`). Three GitHub Actions pipelines: push `main`(`backend/**`) → deploy + `/health`; tag `v*` → Marketplace + Open VSX; tag `mcp-v*` → `npm publish`. Repo secrets: `CLOUDFLARE_API_TOKEN`, `VSCODE_KEY`, `OPENVSX_KEY`, `NPM_TOKEN` (bypass-2FA).

## 8. Extending it

The code is organized so features slot onto the data model:
- **A new field on a page** → add a column in `schema.sql` + read/write in `patchPage`/`servePage` (`index.ts`).
- **A new per-recipient behavior** → it hangs off the `grants` table + the `grantId` in the cookie payload.
- **A new content type** → the object-key suffix convention + a branch in the serve path.
- **A new AI client** → most reuse the MCP server; only the install wrapper differs.

## 9. Gotchas & cost

- Lowercase base36 slugs; `.gitignore` your `.env` (don't rely on push protection); CI npm publish needs a bypass-2FA token; `npm version --no-git-tag-version` then tag by hand; OpenAPI for GPT Actions uses `nullable: true`.
- **Cost:** fits Cloudflare Workers Paid ($5/mo) comfortably; the free tier works for light use — watch Workers routes on a custom domain and R2/D1 quotas. No other infra.

Clone the repo, walk §6, and you'll have your own instance in an afternoon.

Repo: <https://github.com/agentx1boss/hspace> · Live demo: <https://hspace.zhanjian.space>
