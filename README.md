# HSpace — Ship to one, not to all.

> English | [简体中文](README.zh-CN.md)

**Landing:** https://hspace.zhanjian.space · **API / OpenAPI:** https://html-share.kzhan.workers.dev/openapi.json

**For developers who build with AI: ship that fresh demo to exactly the right people.** The HTML demo or Markdown doc Cursor / Claude Code just wrote — turn it into a **link + password** for teammates and clients: see who opened it, revoke it anytime, iterate without changing the link. Publish anonymously, share accountably.

## Not another HTML host

Regular hosts (tiiny.host / Netlify Drop / Pages) all compete on the **public link** — upload, get a URL, ship it to the world. HSpace goes the other way:

- **Private by default, not public.** Every publish gets a random password; link and password land on your clipboard together. No password, no access. Never indexed, safe against forwarding — the link is an asset you control, revocable if you sent it wrong.
- **Finished content, not a site, not collab editing.** You share *one thing to look at* — a demo, report, proposal, visualization. No multi-file, no build, no config — just "send it."
- **Built for the AI coding workflow.** Content is born in your editor and AI chats; sharing should happen there too — one-click from the editor today, publish-from-chat (MCP) too.

In one line: **others "publish to the world," HSpace does targeted sharing.**

## What's shipped (MVP live)

- ✅ VS Code / Cursor extension: one-click publish `.html` / `.md`, auto 4-digit password, link+password copied
- ✅ Document collections: right-click a folder / multi-select → a batch of md/html becomes one link + password + index page, with cross-doc nav
- ✅ MCP server: publish right inside Claude / Cursor conversations (single + collection)
- ✅ View receipts: see each link's view count in the panel (`GET /pages/:slug/stats`)
- ✅ Per-recipient links: one link, a separate password per person, per-person stats, revoke one without affecting others (`/pages/:slug/grants`)
- ✅ Content versioning: the link stays, content iterates; history + roll back
- ✅ Password gate: edge verification + signed cookie (24h), brute-force lockout
- ✅ OpenAPI + first-party edge analytics; CI/CD (push → deploy, tag → dual-market release)

```
hspace/
├── backend/            Cloudflare Worker (publish API + subdomain serving + password gate)
├── vscode-extension/   VS Code / Cursor extension
├── mcp-server/         MCP server (publish from an AI chat)
├── docs/               positioning, business model, design & ops docs
├── assets/             brand assets (appicon / favicon / lockup / OG card)
└── .github/workflows/  CI (deploy backend / release extension)
```

Architecture: content isolated on wildcard subdomains (`<slug>.zhanjian.space`, separate from the API domain); metadata in D1; HTML/MD in R2; rate-limit counters in KV; password via an edge gate + signed cookie — fully serverless.

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

## Extension (dev)

```bash
cd vscode-extension
npm install && npm run compile   # then F5 in VS Code to launch the Extension Development Host
```

When self-hosting, point the `hspace.apiBaseUrl` setting at your API. Release: bump `package.json` version → push a `v<version>` tag → CI publishes to VS Code Marketplace + Open VSX.

## API

Machine-readable **OpenAPI 3 spec** at [`/openapi.json`](https://html-share.kzhan.workers.dev/openapi.json) (`servers.url` auto-filled per request origin, so self-hosted instances work too). Drop it into GPT Actions, agent frameworks, or function calling.

| Method | Path | Notes | Auth |
|---|---|---|---|
| POST | `/publish` | Publish (`html` or `markdown`, or `files` for a collection) | optional Bearer |
| PATCH | `/pages/:slug` | Update content (versions) / password / expiry | Bearer or `X-Edit-Token` |
| DELETE | `/pages/:slug` | Delete (link goes dark) | Bearer or `X-Edit-Token` |
| GET | `/pages/:slug/stats` · `/versions` · `/grants` | Receipts, versions, per-recipient links | Bearer or `X-Edit-Token` |

Anonymous vs. signed-in (thresholds in `wrangler.toml`). Anonymous is deliberately kept light so heavy/serious use has a reason to sign in (which is free): anonymous ≤ 512 KB, ≤ 3 days (one-shot, no renewal), ≤ 3 docs/collection, 20/hr & 50/day, must keep a password, and **no per-recipient links or version history**. Signed-in ≤ 2 MB, up to 30 days per term (renewable), 50-doc collections, per-recipient links, version history/rollback, no daily cap. **Every link expires — there are no permanent links** (renew before it lapses; abandon and it self-cleans). The one thing that stays frictionless anonymously: publishing a single draft in ~30s, no signup.

## Legal & ops

Privacy `/privacy`, Terms `/terms`, Report `/report`. Reports go to D1 `reports`; takedown = set `pages.status` to `blocked` (page 404s immediately). See [docs/operations.md](docs/operations.md).

## Security note

`isSuspicious` / `isPhishy` are rule-based scans (obfuscated exec, password inputs, external forms); connect a professional scanner before scaling. Passwords derived with PBKDF2 (Workers-native); content is sent over HTTPS and stored on R2 (not encrypted at rest). Report contact: mengmajiang@gmail.com.

## License

MIT
