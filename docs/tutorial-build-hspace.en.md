# From Zero to Live: Building a "Targeted Sharing" Tool for AI Content on Cloudflare's Edge (The HSpace Full-Stack Tutorial)

> A build-along tutorial. It lays out the **complete tech stack** behind HSpace and walks you through **cloning the repo and standing up your own instance** — the code is open source, so this is meant to be reproduced, not just read.
>
> - **Source (clone this):** <https://github.com/agentx1boss/hspace> (MIT)
> - **Live demo:** <https://hspace.zhanjian.space>
> - **Prerequisites:** Node ≥ 18, a [Cloudflare](https://dash.cloudflare.com) account with **a domain (zone) on it**, a GitHub account. Budget ~an afternoon.

**A note on scope:** the deep internals (the full Worker source) live in the repo — this guide is the map + the exact manual steps that the code can't do for you (accounts, DNS, secrets). Clone the repo alongside reading.

**Mini-glossary** (used throughout): **slug** = the short random page id (`a7k2m9x`); **edge** = Cloudflare's nearest-to-user compute; **TTL** = time-to-live / link expiry; **grant** = one recipient's own password record; **PBKDF2 / HMAC** = the password-hashing / cookie-signing algorithms (both in the Web Crypto API).

## 0. What it is, and why it's built this way

**HSpace = "targeted sharing" for AI-coding developers**: turn the HTML demo or Markdown doc your AI just wrote into a **link + password**, sent only to the people who should see it — with view receipts, instant revocation, and iteration without changing the link.

One-line positioning: **Ship to one, not to all.**

Design trade-offs that run through this whole piece:

- **Mandatory password** is the product's identity, not an option — no public gallery.
- **No permanent links**: every link expires (anonymous 3 days, signed-in 30 days/term, renewable). *(The one exception: first-party pinned content — e.g. the demo — set to `expires_at=NULL` directly in the DB. That's an ops action, not a product feature.)*
- **Content pages are always `noindex` + password-gated** — so the only thing actually indexable by search engines is the landing page.
- **Self-contained pages**: reading page / password page / landing page all inline their CSS/JS/SVG, pulling in zero external scripts, fonts, or images (safer CSP, faster loads, better privacy).

## 1. Architecture: one Worker carries everything

The most counter-intuitive — and most low-maintenance — decision: **the entire backend is a single Cloudflare Worker.** It routes by "which hostname did the request hit," and one codebase is simultaneously the content host, the landing site, and the API.

Inside the one Worker, `host` decides the path: content subdomains fetch the page and pass the password gate; the `hspace.` subdomain serves the landing page, `/privacy`, `/terms`, `/report`, the `/e` beacon, `/openapi.json`, `/robots.txt`, `/sitemap.xml`, the `/console` login UI and `/auth/github*` OAuth routes; everything else is treated as API.

> The wildcard subdomain `*.zhanjian.space` is the key: every share is its own subdomain `<slug>.zhanjian.space`, all caught by a single wildcard route + wildcard DNS — no per-share record needed. (See §4, step 4 — this is the step people get stuck on.)

## 2. The full stack at a glance

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Cloudflare Workers** (TypeScript) | Edge function; one Worker hosts it all |
| Object storage | **R2** | Raw HTML/Markdown (plaintext; security is HTTPS-in-transit + password hashing, *not* "encrypted storage") |
| Metadata DB | **D1** (SQLite) | `pages` / `versions` / `grants` / `api_keys` / `users` / `metrics` / `reports` |
| Counters / limits | **KV** | Per-IP rate counting, brute-force lockout |
| Markdown | **marked** (GFM) | Rendered into a self-contained reading page at the edge |
| Password / signing | **Web Crypto** | PBKDF2 password hashing + HMAC-signed cookies |
| Sign-in | **GitHub OAuth** | Issues API keys, unlocks renewal / larger quotas |
| CLI / deploy | **Wrangler** | Local dev + deploy |
| Editor plugin | **VS Code Extension** (`vscode-extension/`) | Packaged with `@vscode/vsce`, published via `ovsx` |
| AI callable | **MCP server** (`mcp-server/`) + **OpenAPI 3.0.3** | `@modelcontextprotocol/sdk` + `zod`; `/openapi.json` for GPT Actions |
| Claude Code | **plugin + marketplace** (`clients/claude-code/`) | `plugin.json` + `.mcp.json` + a `/share` command |
| CI/CD | **GitHub Actions** | Deploy backend, publish plugin, publish npm |

## 3. Backend breakdown

### 3.1 How the three storage layers divide the work

- **R2** stores only content: the object-key suffix *is* the type — `pages/<slug>.md`, `pages/<slug>.html`, and a collection is `pages/<slug>/index.json`; versioning writes a numbered key (`pages/<slug>.vN.<ext>`).
- **D1** stores everything structured (the 7 tables above — full DDL is [`backend/schema.sql`](https://github.com/agentx1boss/hspace/blob/main/backend/schema.sql)). Note: **there is no `receipts` table** — "receipts" are *derived* from `pages.hits` and per-recipient `grants.hits` / `last_seen_at`.
- **KV** does only the "fast and short-lived" counting: rate limits, brute-force lockout windows.

### 3.2 The edge password gate (the core)

Core logic lives in [`backend/src/index.ts`](https://github.com/agentx1boss/hspace/blob/main/backend/src/index.ts) (routing/serving) and [`backend/src/crypto.ts`](https://github.com/agentx1boss/hspace/blob/main/backend/src/crypto.ts) (hashing/signing). When a recipient visits `<slug>.zhanjian.space`:

1. No valid cookie → return the **password page** (401).
2. Submit the password → the edge verifies the hash with **PBKDF2** (plaintext passwords are never stored).
3. Pass → set an **HMAC-signed cookie** (`<slug>.<grantId>.<exp>.<sig>`), good for 24h; then **303 redirect back to the original path**, so deep links (doc N in a collection) land directly.
4. "Per-recipient links" = the same link, a separate password (grant) per recipient, with per-person view stats and instant, isolated revocation.

Anti-abuse is a stack of gates (all tuned via `wrangler.toml` vars): per-IP hourly/daily publish caps, anonymous TTL clamping, brute-force lockout (KV), phishing-pattern regex, a per-page hit cap, and a global daily anonymous-bytes circuit breaker.

### 3.3 Markdown rendering at the edge

MD is stored raw in R2 and rendered by `marked` at the edge into a self-contained reading page (inline styles, light/dark auto). Bonus: upgrading the reading template takes effect on **already-published content instantly**.

## 4. ⭐ Build your own from scratch

Everything scriptable is in the repo; the steps below are the account/DNS/secret work **only a human can do once**. Commands assume you cloned the repo.

### Step 0 — Clone & install

```bash
git clone https://github.com/agentx1boss/hspace
cd hspace/backend
npm install
npm i -g wrangler && wrangler login   # opens the browser
```

### Step 1 — Create the Cloudflare resources

```bash
wrangler r2 bucket create <bucket-name>          # e.g. my-pages
wrangler d1 create <db-name>                      # copy the returned database_id
wrangler kv namespace create RATELIMIT            # copy the returned id
```

Then create the tables (the DDL ships in the repo as `backend/schema.sql`):

```bash
wrangler d1 execute <db-name> --file=./schema.sql
```

### Step 2 — Fill in `wrangler.toml`

The **binding names** (`BUCKET` / `DB` / `RATELIMIT`) are fixed — the Worker code reads them by name. Only the resource names/ids and your domain change. Minimal skeleton:

```toml
name = "html-share"
main = "src/index.ts"
compatibility_date = "2024-11-01"
account_id = "<your-account-id>"
workers_dev = true

routes = [
  { pattern = "*.<your-domain>/*", zone_name = "<your-domain>" },
]

[vars]
API_DOMAIN = "<your-worker>.<sub>.workers.dev"
USERCONTENT_DOMAIN = "<your-domain>"
MAX_SIZE_BYTES = "2097152"          # 2 MB (signed-in)
ANON_MAX_SIZE_BYTES = "524288"      # 512 KB (anonymous)
ANON_DEFAULT_TTL = "259200"         # 3 days (anonymous, one-shot)
OWNER_MAX_TTL = "2592000"           # 30 days (signed-in, renewable)
RATE_LIMIT_PER_HOUR = "20"
RATE_LIMIT_PER_DAY = "50"
ANON_MAX_HITS = "10000"
ANON_DAILY_GLOBAL_BYTES = "524288000"
COLLECTION_MAX_SIZE_BYTES = "5242880"
ANON_MAX_DOCS = "3"
MAX_DOCS = "50"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "<bucket-name>"

[[d1_databases]]
binding = "DB"
database_name = "<db-name>"
database_id = "<database_id>"

[[kv_namespaces]]
binding = "RATELIMIT"
id = "<kv-id>"
```

### Step 3 — DNS + Route (the step people get stuck on)

`<slug>.<domain>` reaching your Worker needs **two things**, not one:

1. **A proxied wildcard DNS record** so the hostname resolves to Cloudflare's edge. In the dashboard → DNS, add an `AAAA` record: name `*`, content `100::` (a discard address), **Proxy status = Proxied (orange cloud)**. Add a second proxied record for the landing subdomain `hspace` the same way. (You don't point DNS "at a Worker" directly — the proxied record lands the request on Cloudflare, and the *route* binds the Worker.)
2. **The Workers route** — the `routes` entry in `wrangler.toml` (Step 2) binds `*.<domain>/*` to this Worker.

> Wildcard routes need the zone to be active on Cloudflare. `www`/apex are often taken by other services — that's why the landing page lives on the `hspace.` subdomain.

### Step 4 — Secrets & GitHub OAuth (never in the toml)

```bash
wrangler secret put COOKIE_SIGNING_SECRET   # long random string (password-cookie signing)
wrangler secret put SESSION_SECRET          # long random string (login session signing)
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

Create the GitHub OAuth App at **github.com → Settings → Developer settings → OAuth Apps → New**:

- **Authorization callback URL** (must match exactly): `https://hspace.<your-domain>/auth/github/callback`
- **Scopes:** none needed (HSpace only reads your public identity).
- Copy the Client ID / generate a Client Secret into the two secrets above.

The OAuth flow is: `/auth/github` (start) → GitHub → `/auth/github/callback` → session cookie; users manage login and API keys at **`/console`**.

### Step 5 — Deploy

```bash
npm run deploy          # = wrangler deploy
```

### Step 6 — ✅ Verify it works

```bash
# 1. Health check (API on workers.dev)
curl https://<your-worker>.<sub>.workers.dev/health
# → {"ok":true,"service":"hspace"}

# 2. Sign in + get an API key
open https://hspace.<your-domain>/console       # GitHub login → copy API key

# 3. Publish your first page
curl -X POST https://<your-worker>.<sub>.workers.dev/publish \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Hello\nprivate world","password":"1234"}'
# → returns { url, passwordProtected: true, ... }

# 4. Open the returned URL → you should hit the password gate. Enter 1234 → the page renders.
```

If all four pass, your instance is live.

### Troubleshooting

- **`<slug>.<domain>` doesn't resolve / 522** → you're missing the proxied wildcard DNS record *or* the Workers route (Step 3 needs **both**).
- **OAuth "redirect_uri mismatch"** → the callback URL in the GitHub App must byte-for-byte equal `https://hspace.<domain>/auth/github/callback`.
- **`D1_ERROR` / binding undefined** → the binding must be named `DB` (and `BUCKET`, `RATELIMIT`) exactly; re-check `wrangler.toml` and that `schema.sql` ran.
- **Publish returns `too_large` / `rate_limited`** → expected anti-abuse; raise the `[vars]` limits or sign in.

## 5. Four distribution channels

All four live in the same repo:

1. **VS Code / Cursor extension** (`vscode-extension/`): one-click publish; a sidebar manages receipts, recipients, versions.
2. **MCP server** (`mcp-server/`, published as `hspace-mcp`): inside Claude Desktop / Cursor / Codex, just say "publish this as a password link."
3. **Claude Code plugin** (`clients/claude-code/`): one command installs the `/share` command + the MCP config.
4. **OpenAPI**: `/openapi.json` for GPT Actions and agent frameworks.

> Cursor and Claude Desktop are the same `mcp.json`; the only truly distinct install mechanisms are the Claude Code plugin (`claude plugin …`) and Codex (`codex mcp add`).

## 6. CI/CD: three pipelines (once you're shipping)

| Trigger | Workflow | Actions |
|---|---|---|
| Push `main` (touching `backend/**`) | Deploy Backend | `tsc` → `wrangler deploy` → `/health` smoke test |
| Push a `v*` tag | Release Extension | verify version → package vsix → publish to Marketplace + Open VSX → GitHub Release |
| Push an `mcp-v*` tag | Release MCP | verify version → build → `npm publish` |

The Claude Code plugin uses no tag: bump `version` in `plugin.json` and push `main` (version-pinned). Required repo secrets: `CLOUDFLARE_API_TOKEN`, `VSCODE_KEY`, `OPENVSX_KEY`, `NPM_TOKEN` (use a bypass-2FA automation token).

## 7. Gotchas (real ones we hit)

- **Slug case**: subdomain DNS is case-insensitive, so base62 slugs collide → switch to **lowercase base36** (0-9 + a-z).
- **`.env` nearly got committed**: `git add -A` sweeps it in → `.gitignore` first; for already-tracked files use `git rm --cached`.
- **npm 2FA**: CI publishing needs an automation token with bypass-2FA ticked; only manual local publishing uses the OTP.
- **`npm version` auto-creates a tag**: it can mis-trigger another pipeline → use `npm version <x> --no-git-tag-version`, then tag with the right prefix by hand.
- **OpenAPI compatibility with GPT Actions**: nullable fields must use `nullable: true`, not `type: [..., "null"]`.

## 8. Cost & product invariants

- **Cost**: fits Cloudflare's Workers Paid ($5/mo) comfortably; the free tier can work for light use, but Workers routes on a custom domain and R2/D1 quotas are the things to watch. No other infra.
- **No permanent links** — a product promise, not a limitation (except first-party pinned content, set in the DB).
- **Content is plaintext in R2** — say "HTTPS in transit / password hashing," never "encrypted storage."
- **Content pages are `noindex` + gated** — paired with `X-Robots-Tag: noindex` and a disallowing `robots.txt`.
- **Self-contained pages** — everything inlined; no external resources.

## 9. Closing

One edge Worker plus R2/D1/KV is enough to make "privately sharing AI content" a real product. The time sink is never the code; it's the account-and-authorization steps in §4 that **can only be done by hand once.** Clone the repo, walk §4, and you'll have your own instance in an afternoon.

Repo: <https://github.com/agentx1boss/hspace> · Live demo: <https://hspace.zhanjian.space>
