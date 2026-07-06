# From Zero to Live: Building a "Targeted Sharing" Tool for AI Content on Cloudflare's Edge (The HSpace Full-Stack Tutorial)

> A retrospective, free tutorial. It lays out the **complete tech stack** behind HSpace, and **every manual step** you must do by hand to build it from scratch.
> Live demo: <https://hspace.zhanjian.space> · Open source (MIT).

## 0. What it is, and why it's built this way

**HSpace = "targeted sharing" for AI-coding developers**: turn the HTML demo or Markdown doc your AI just wrote into a **link + password**, sent only to the people who should see it — with view receipts, instant revocation, and iteration without changing the link.

One-line positioning: **Ship to one, not to all.**

The key differences from an ordinary HTML host — also the design trade-offs that run through this whole piece:

- **Mandatory password** is the product's identity, not an option — no public gallery.
- **No permanent links**: every link expires (anonymous 3 days, signed-in 30 days/term, renewable); abandon it and it lapses on its own.
- **Content pages are always `noindex` + password-gated** — so the only thing actually indexable by search engines is the landing page.
- **Self-contained pages**: reading page / password page / landing page all inline their CSS/JS/SVG, pulling in zero external scripts, fonts, or images (safer CSP, faster loads, better privacy).

## 1. Architecture: one Worker carries everything

The most counter-intuitive — and most low-maintenance — decision: **the entire backend is a single Cloudflare Worker.** It routes by "which hostname did the request hit," and one codebase is simultaneously:

```
                     ┌─────────────────────────────────────────────┐
   *.zhanjian.space  │  One Cloudflare Worker (TypeScript)          │
   ─────────────────>│                                              │
                     │  · <slug>.zhanjian.space → content + gate    │
   hspace.…space     │  · hspace.…   → landing / legal / beacon /   │
   ─────────────────>│                 openapi                      │
                     │  · *.workers.dev → publish API               │
   html-share.       │                                              │
   …workers.dev      │   Storage:                                   │
   ─────────────────>│   · R2  content objects (HTML/MD, plaintext) │
                     │   · D1  metadata / versions / grants /       │
                     │         receipts / reports                   │
                     │   · KV  rate-limit counters                  │
                     └─────────────────────────────────────────────┘
```

Inside the one Worker, `host` decides the path: content subdomains fetch the page and pass the password gate; the `hspace.` subdomain serves the landing page, `/privacy`, `/terms`, `/report`, the `/e` beacon, `/openapi.json`, `/robots.txt`, `/sitemap.xml`; everything else is treated as API.

> The wildcard subdomain `*.zhanjian.space` is the key: every share is its own subdomain `<slug>.zhanjian.space`, all caught by a single wildcard route + wildcard DNS — no per-share record needed.

## 2. The full stack at a glance

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Cloudflare Workers** (TypeScript) | Edge function; one Worker hosts it all |
| Object storage | **R2** | Stores raw HTML/Markdown (plaintext; security is HTTPS-in-transit + password hashing, *not* "encrypted storage") |
| Metadata DB | **D1** (SQLite) | `pages` / `versions` / `grants` / `api_keys` / `users` / `metrics` / `reports` |
| Counters / limits | **KV** | Per-IP rate counting, brute-force lockout |
| Markdown rendering | **marked** (GFM) | Renders MD into a self-contained reading page at the edge |
| Password / signing | **Web Crypto** (SubtleCrypto) | PBKDF2 password hashing + HMAC-signed cookies |
| Sign-in | **GitHub OAuth** | Issues API keys, unlocks renewal / larger quotas |
| CLI / deploy | **Wrangler** | Local dev + deploy |
| Editor plugin | **VS Code Extension** (TS) | Packaged with `@vscode/vsce`, published via `ovsx` |
| AI callable | **MCP server** | `@modelcontextprotocol/sdk` + `zod`, stdio transport |
| AI callable | **OpenAPI 3.0.3** | `/openapi.json`, consumable by GPT Actions / agent frameworks |
| Claude Code | **plugin + marketplace** | `plugin.json` + `.mcp.json` + a `/share` command |
| CI/CD | **GitHub Actions** | Deploy backend, publish plugin, publish npm |

## 3. Backend breakdown

### 3.1 How the three storage layers divide the work

- **R2** stores only content: the object-key suffix *is* the type — `pages/<slug>.md`, `pages/<slug>.html`, and a collection is `pages/<slug>/index.json`; versioning writes a numbered key (`pages/<slug>.vN.<ext>`).
- **D1** stores everything structured: page metadata, version records, per-recipient grants, API keys, signed-in users, analytics counts, reports.
- **KV** does only the "fast and short-lived" counting: rate limits, brute-force lockout windows.

### 3.2 The edge password gate (the core)

When a recipient visits `<slug>.zhanjian.space`:

1. No valid cookie → return the **password page** (401).
2. Submit the password → the edge verifies the hash with **PBKDF2** (plaintext passwords are never stored).
3. Pass → set an **HMAC-signed cookie** (shaped like `<slug>.<grantId>.<exp>.<sig>`), good for 24h without re-entry; then **303 redirect back to the original path**, so deep links (doc N in a collection) land directly.
4. "Per-recipient links" = the same link, a separate password (grant) per recipient, with per-person view stats and instant, isolated revocation.

Anti-abuse is a stack of gates: per-IP hourly/daily publish caps, anonymous TTL clamping, brute-force lockout (KV), phishing-pattern regex, a per-page hit cap, and a global daily anonymous-bytes circuit breaker.

### 3.3 Markdown rendering at the edge

MD is stored raw in R2 and rendered by `marked` at the edge into a self-contained reading page (inline styles, light/dark auto, code blocks/tables/CJK font stacks). Bonus: upgrading the reading template takes effect on **already-published content instantly**.

## 4. Four distribution channels

Content is born in editors and AI chats, so the sharing entry points live there too:

1. **VS Code / Cursor extension**: one-click publish of the current file/folder; a sidebar manages receipts, recipients, and versions.
2. **MCP server** (`hspace-mcp`): inside Claude Desktop / Cursor / Codex, just say "publish this as a password link."
3. **Claude Code plugin**: one command installs it, bundling the `/share` command + the MCP config.
4. **OpenAPI**: `/openapi.json` for GPT Actions and agent frameworks to consume directly.

> Cursor and Claude Desktop are fundamentally the same `mcp.json` config; the only truly distinct install mechanisms are the Claude Code plugin (`claude plugin …`) and Codex (`codex mcp add`).

## 5. CI/CD: three pipelines

| Trigger | Workflow | Actions |
|---|---|---|
| Push `main` (touching `backend/**`) | Deploy Backend | `tsc` → `wrangler deploy` → `/health` smoke test |
| Push a `v*` tag | Release Extension | verify version match → package vsix → publish to Marketplace + Open VSX → GitHub Release |
| Push an `mcp-v*` tag | Release MCP | verify version match → build → `npm publish` |

The Claude Code plugin uses no tag: bump `version` in `plugin.json` and push `main`; users update via marketplace refresh (version-pinned).

---

## 6. ⭐ The manual steps (the complete from-scratch checklist)

This is the most practical section. Everything that could be automated was; the following **must be done by a human once** — mostly "open an account / authorize / configure a secret / create a resource."

### A. Accounts and one-time authorization

1. A **Cloudflare account**; `npm i -g wrangler` then `wrangler login` (browser auth).
2. A **domain** hosted on Cloudflare (here `zhanjian.space`), for the wildcard subdomains.
3. A **GitHub account + repo** (code + Actions).
4. A **VS Code Marketplace publisher** (create a publisher in Azure DevOps, get a PAT).
5. An **Open VSX account** (get a token).
6. An **npm account** (`npm login`; publishing may require a 2FA code).

### B. Create the Cloudflare resources (note the returned IDs, put them in `wrangler.toml`)

```bash
wrangler r2 bucket create <bucket-name>          # e.g. html-share-pages
wrangler d1 create <db-name>                      # returns database_id
wrangler kv namespace create RATELIMIT            # returns id
wrangler d1 execute <db-name> --file=./schema.sql # create tables
```

In `wrangler.toml`, fill in by hand: `account_id`, the route `pattern = "*.<your-domain>/*"` + `zone_name`, and the three resources' `bucket_name` / `database_id` / KV `id`.

### C. DNS (add by hand in the Cloudflare dashboard)

- A wildcard record `*.<your-domain>` pointing at the Worker (so every `<slug>.<domain>` is caught).
- A landing subdomain (here `hspace.<domain>`), because `www` / the apex are often taken by other services.

### D. Worker secrets (`wrangler secret put`, **never in the toml**)

```bash
wrangler secret put COOKIE_SIGNING_SECRET   # signs the password cookie (long random string)
wrangler secret put SESSION_SECRET          # signs the login session (long random string)
wrangler secret put GITHUB_CLIENT_ID        # GitHub OAuth App
wrangler secret put GITHUB_CLIENT_SECRET
```

> The GitHub OAuth App must be **created by hand** in GitHub developer settings, with the callback set to your login endpoint.

### E. GitHub Actions repo secrets (add by hand in repo Settings → Secrets)

| Secret name | Purpose | Where to get it |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CI deploys the Worker | Cloudflare "Edit Cloudflare Workers" template |
| `VSCODE_KEY` | Publish to VS Code Marketplace | Azure DevOps PAT |
| `OPENVSX_KEY` | Publish to Open VSX | Open VSX token |
| `NPM_TOKEN` | Publish to npm (MCP) | npmjs Automation/Granular token (tick bypass-2FA) |

### F. Day-to-day releases (human-triggered, CI takes over)

- **Backend**: push `backend/**` changes to `main` → auto-deploy.
- **Extension**: bump `version` in `vscode-extension/package.json` → tag `v<x.y.z>` → push the tag.
- **MCP**: bump `version` in `mcp-server/package.json` → tag `mcp-v<x.y.z>` → push the tag.
- **Claude Code plugin**: bump `version` in `plugin.json` → push `main`.

> Security habit: secrets go only into `wrangler secret` or GitHub Secrets, **never into git**. Add `.env` to `.gitignore`; GitHub push protection will catch an accidentally committed token, but don't rely on it as a safety net.

## 7. Gotchas (to save you time)

- **Slug case**: subdomain DNS is case-insensitive, so base62 slugs collide → switch to **lowercase base36**.
- **`.env` nearly got committed**: `git add -A` sweeps it in → `.gitignore` first; for already-tracked files use `git rm --cached`.
- **npm 2FA**: CI publishing needs an automation token with bypass-2FA ticked; only manual local publishing uses the OTP.
- **`npm version` auto-creates a tag**: it can mis-trigger another pipeline → use `npm version <x> --no-git-tag-version`, then tag with the right prefix by hand.
- **OpenAPI compatibility with GPT Actions**: nullable fields must use `nullable: true`, not `type: [..., "null"]`.
- **Don't let the landing page treat `/favicon.ico` as a page**: return a real image, and inline data-URI icons in every template.

## 8. A few "product-level invariants" (worth copying for similar products)

- **No permanent links**: every link expires — a product promise, not a limitation; don't slide back into a "permanent" narrative.
- **Content is stored plaintext in R2**: copy only says "HTTPS in transit / password hashing," and **never implies "encrypted storage."**
- **Content pages are `noindex` + gated**: paired with `X-Robots-Tag: noindex` on content subdomains and a fully-disallowing `robots.txt`.
- **Self-contained pages**: anything injected into a shared page is inlined; no external resources.

## 9. Closing

One edge Worker plus R2/D1/KV is enough to make "privately sharing AI content" a real product: the password gate at the edge, content in object storage, metadata in SQLite, rate limits in KV — then CI automates publishing across three channels. The time sink is never the code; it's the account-and-authorization steps in Section 6 that **can only be done by hand once.** Walk the checklist and you can reproduce this in an afternoon.

Live demo / source: <https://hspace.zhanjian.space>
