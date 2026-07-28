# HSpace — Ship to one, not to all.

> English | [简体中文](README.zh-CN.md)

**Landing:** https://hspace.zhanjian.space · **API / OpenAPI:** https://html-share.kzhan.workers.dev/openapi.json

**Private Markdown sharing for the AI coding era.** The `.md` your AI just wrote — a proposal, a report, a deep-dive — becomes a **clean reading page behind a password**: table of contents, collections, light/dark, nothing for the reader to install. HTML runs as-is too. You see how many times it was opened, you can cut one recipient off without touching the others, and the link stays the same while the content iterates. Every link expires — by design.

## Not another public share link

Notion share links, HackMD, Gist — they compete on the **public** link: paste it and it's readable by whoever has it. HSpace goes the other way:

- **Private by default.** Every first-party client (VS Code extension, MCP, CLI, Claude Code plugin) auto-generates a 4-digit password on publish; link and password land together, ready for a single paste. Pages are never indexed. *(The raw API can omit the password — a deliberate degree of freedom for self-hosters, agents and public tutorials.)*
- **A finished draft, not a site, not collab editing.** You share *one thing to read* — proposal, report, tutorial, demo. No multi-file hosting, no build, no config.
- **Born where your content is.** One click in the editor, one sentence in an AI chat (MCP), or one command in the terminal (CLI).

In one line: **others publish to the world, HSpace ships to one.**

## What you get

| | |
|---|---|
| 🚀 **Out in 30 seconds** | No signup, no config — link + password in one paste |
| 📖 **Readable on open** | `.md` renders to a formatted reading page (TOC rail, cross-doc nav, light/dark, reading prefs); HTML runs as-is |
| 🎯 **Sent it wrong? Take it back** | Per-recipient links: revoking one person takes effect immediately, without changing anyone else's password. Changing the shared password blocks new access (browsers that already passed keep a 24h cookie) |
| 🔁 **The link is alive** | Content iterates, the link doesn't; history and rollback. Every link carries an expiry, renewable before it lapses — abandon it and it cleans itself up |

Full stack is MIT — you can read exactly what it does, or run it on your own Cloudflare.

## What's shipped (live)

- ✅ **Markdown reading page**: edge-rendered from the stored source — heading anchors + TOC rail, code highlighting with copy, image lightbox, light/dark, font-size/width prefs
- ✅ **Collections**: a folder of md/html becomes one link + password + index page, with cross-doc nav (mixed md/HTML is fine)
- ✅ **VS Code / Cursor extension**: one-click publish `.md` / `.html`, auto 4-digit password, link+password copied, plus the full post-publish panel
- ✅ **MCP server**: publish right inside Claude / Cursor conversations (single + collection)
- ✅ **CLI** (`npm i -g hspace-mcp` → `hspace publish report.md`): ship a draft from any terminal — and manage it there too (`stats`, `grant`, `revoke`, `update`, `renew`, `versions`, `rm`). Zero-install form is `npx --package=hspace-mcp hspace publish …` — keep the `--package`, the bare `hspace` package on npm belongs to someone else
- ✅ **Claude Code plugin**: `/plugin marketplace add agentx1boss/hspace` → `/plugin install hspace@hspace` → `/share` (bundles the MCP server)
- ✅ **Read receipts**: open counts per link (`GET /pages/:slug/stats`); per-person counts once you use per-recipient links
- ✅ **Per-recipient links**: one link, a separate password per person, per-person stats, revoke one without affecting others (`/pages/:slug/grants`)
- ✅ **Content versioning**: the link stays, content iterates; history + rollback
- ✅ **Save a draft you received**: a reader can sign in and keep it in their own Console (reference, not a copy)
- ✅ **Password gate**: edge verification + signed cookie (24h), brute-force lockout
- ✅ **OpenAPI + first-party edge analytics**; CI/CD (see below)

```
hspace/
├── backend/            Cloudflare Worker (publish API + subdomain serving + password gate + landing)
├── vscode-extension/   VS Code / Cursor extension
├── mcp-server/         MCP server + `hspace` CLI (one npm package, two bins)
├── clients/            Claude Code plugin (/share command + bundled MCP config)
├── docs/               positioning (the copy authority), business model, design & ops docs
├── assets/             brand assets (appicon / favicon / lockup / OG card)
└── .github/workflows/  CI (deploy backend / release extension / release npm)
```

Architecture: content isolated on wildcard subdomains (`<slug>.zhanjian.space`, separate from the API domain); metadata in D1; Markdown/HTML in R2; rate-limit counters in KV; password via an edge gate + signed cookie — fully serverless.

**CI/CD** — three pipelines: pushing `backend/**` to main deploys the Worker · a `v*` tag releases the extension to VS Code Marketplace + Open VSX · an `mcp-v*` tag publishes `hspace-mcp` to npm (MCP server *and* CLI ship together).

## Self-hosting

Prereq: a Cloudflare account + a domain on Cloudflare (for the content wildcard subdomain).

```bash
cd backend
npm install
npx wrangler r2 bucket create html-share-pages
npx wrangler d1 create html-share            # put database_id into wrangler.toml
npx wrangler kv namespace create RATELIMIT   # put id into wrangler.toml
npx wrangler d1 execute html-share --remote --file=./schema.sql
npx wrangler secret put COOKIE_SIGNING_SECRET
# edit wrangler.toml: wildcard route, USERCONTENT_DOMAIN, resource ids, limits
npm run deploy
```

DNS: add a wildcard record (`*` → any IP, orange-cloud proxied) on the content domain; the Worker route takes over. The API can use the workers.dev address directly. With repo secret `CLOUDFLARE_API_TOKEN` set, pushing `backend/**` to main auto-deploys.

Self-hosting is the full product — no feature tiers. The extension, MCP and CLI all point wherever you tell them (`hspace.apiBaseUrl` / `HSPACE_API_BASE`).

## Dev

```bash
# Worker: types + unit tests (run from the repo root)
(cd backend && npm install && npx tsc --noEmit && npm test)
# extension: compile, then F5 in VS Code for the Extension Development Host
(cd vscode-extension && npm install && npm run compile)
# MCP + CLI
(cd mcp-server && npm install && npm test && npm run build)
node mcp-server/dist/cli.js --help                    # drive the CLI locally
HSPACE_API_BASE=http://localhost:8787 node mcp-server/dist/cli.js publish note.md   # against `npm run dev`
```

Release: extension = bump `package.json` → push a `v<version>` tag. MCP + CLI = bump `mcp-server/package.json` → push an `mcp-v<version>` tag.

## API

Machine-readable **OpenAPI 3 spec** at [`/openapi.json`](https://html-share.kzhan.workers.dev/openapi.json) (`servers.url` auto-filled per request origin, so self-hosted instances work too). Drop it into GPT Actions, agent frameworks, or function calling.

| Method | Path | Notes | Auth |
|---|---|---|---|
| POST | `/publish` | Publish (`html` or `markdown`, or `files` for a collection) | optional Bearer |
| PATCH | `/pages/:slug` | Update content (new version) / password / expiry | Bearer or `X-Edit-Token` |
| DELETE | `/pages/:slug` | Delete (link goes dark) | Bearer or `X-Edit-Token` |
| GET | `/pages/:slug/stats` | Read receipts | Bearer or `X-Edit-Token` |
| GET | `/pages/:slug/versions` · POST `…/versions/:v/restore` | History, rollback | Bearer |
| POST · GET | `/pages/:slug/grants` | Create / list recipients (password returned once) | Bearer |
| DELETE | `/pages/:slug/grants/:id` | Revoke one recipient (takes effect immediately) | Bearer |
| GET | `/pages` | List your pages | Bearer |

Anonymous vs. signed-in (thresholds in `backend/wrangler.toml`). Anonymous is deliberately kept light so heavy/serious use has a reason to sign in (which is free): anonymous ≤ 512 KB, ≤ 7 days (one-shot, no renewal), ≤ 5 docs/collection, 20/hr & 50/day, must keep a password, and **no per-recipient links or version history**. Signed-in ≤ 2 MB (5 MB per collection), up to 30 days per term (renewable), 50-doc collections, per-recipient links, version history/rollback, no daily cap. **Every link expires — there are no permanent links** (renew before it lapses; abandon and it self-cleans). The one thing that stays frictionless anonymously: publishing a single draft in ~30s, no signup.

## Legal & ops

Privacy `/privacy`, Terms `/terms`, Report `/report`. Reports go to D1 `reports`; takedown = set `pages.status` to `blocked` (page 404s immediately). See [docs/operations.md](docs/operations.md).

## Security note

- **User Markdown is sanitized**: raw HTML inside `.md` goes through a whitelist ([`backend/src/sanitize.ts`](backend/src/sanitize.ts)) — `<script>`, `<iframe>`, event handlers and `javascript:` URLs never reach the reader.
- **md reading pages ship a real CSP** ([`backend/src/headers.ts`](backend/src/headers.ts)): `default-src 'none'`, `script-src 'nonce-…'`, `connect-src 'none'`. Two deliberate exceptions, stated plainly: **external images in your md still load** (so that host can see the reader's IP/UA), and **HTML drafts keep a permissive policy** so they run as-is.
- `isSuspicious` / `isPhishy` are rule-based scans (obfuscated exec, password inputs, external forms); connect a professional scanner before scaling.
- Passwords are derived with PBKDF2 (Workers-native) and stored as hashes only. Content is sent over HTTPS and stored on R2 — **not encrypted at rest**.

Report contact: mengmajiang@gmail.com.

## License

MIT
