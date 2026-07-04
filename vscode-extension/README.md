# HSpace — Ship to one, not to all.

English | [简体中文](https://github.com/agentx1boss/hspace/blob/main/vscode-extension/README.zh-CN.md)

**For developers who build with AI: ship that fresh demo to exactly the right people.** Turn the HTML demo or Markdown doc Cursor / Claude Code just wrote into a link + password — see who opened it, revoke it anytime, iterate without changing the link.

AI-generated demos, reports, data visualizations — you want to send them to a client, a teammate, a small circle, not to the whole internet. HSpace is not hosting; it's **targeted sharing**: every link is password-gated, never indexed by search engines, safe against accidental forwarding, and revocable at any time.

## Why it's different

- 📝 **Markdown, beautifully published** — `.md` files render into a clean reading page (headings, tables, code blocks, light/dark themes)
- 📚 **Folders become booklets** — right-click a folder or multi-select files → "Publish as collection": a batch of md/html becomes one link + one password + a table of contents with cross-doc navigation
- 🔐 **Private by default** — every publish gets a random 4-digit password; without it, nobody gets in. Viewers enter it once and stay signed in for 24 hours
- 📋 **One paste and it's sent** — link and password land on your clipboard together; paste straight into Slack, email, or WeChat
- 🕒 **Versioned** — the link stays the same while content evolves; view history and roll back
- 👥 **Per-recipient links** — give each person their own password; see who viewed, revoke one without changing everyone else's
- 👁 **View receipts** — refresh the panel to see how many times each link was opened
- 🎯 **Controlled and revocable** — change the password anytime (old one dies instantly), delete the page and the link goes dark; expired pages clean themselves up
- 🗂 **Publish = manage** — the "HSpace · 最近发布" (recent publishes) sidebar panel: open, copy, change password, delete
- 🛡 **Isolated content** — every page lives on its own subdomain; brute-force attempts get locked out

## Quick Start

1. Install the extension
2. Open any `.html` or `.md` file
3. Click the ☁️ icon in the editor title bar
4. The link and its password are on your clipboard — send them to whoever should see it 🎉

No sign-up, no configuration. It just works.

## Changing the password / revoking access

- Click "修改密码" (Change password) on the publish-success notification
- Right-click a page in the recent-publishes sidebar panel → "设置/修改密码" (Set/Change password)
- To revoke access: change the password (the old one stops working immediately), or just delete the page

## Settings

| Setting | Default | Description |
|---|---|---|
| `hspace.apiBaseUrl` | official hosted instance | Backend API base URL; point it at your own deployment if you self-host |
| `hspace.defaultExpiryDays` | `7` | Default validity (in days) for shared links |

## Limits (default hosted instance)

- Single HTML / Markdown file only; ≤ 1 MB anonymous, ≤ 2 MB signed in
- Every link expires — no permanent links: anonymous ≤ 7 days, signed in ≤ 30 days per term, renewable before it lapses
- Max 20 publishes per IP per hour; anonymous publishes also capped at 50 per day
- Anonymous pages always keep a password, and their content cannot be replaced after publishing (sign in to unlock both)
- Wrong password attempts are limited to 10 per 15 minutes
- Anonymous pages go offline after 10,000 views
- Phishing, malicious scripts, and other abusive content are prohibited and will be taken down

## Self-Hosting

The backend is an open-source Cloudflare Worker (R2 + D1 + KV). Deploy your own instance and point `hspace.apiBaseUrl` at it. See the [GitHub repository](https://github.com/agentx1boss/hspace).

## Privacy

Publishing uploads the current HTML file to the backend and creates a password-gated link; nothing else is collected. Deleted pages become inaccessible immediately, and expired pages go dark on their own.

## Roadmap

Publish-from-chat (MCP), view receipts, per-recipient links, content versioning.

## License

MIT
