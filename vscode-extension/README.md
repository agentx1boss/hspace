# HSpace

English | [简体中文](https://github.com/agentx1boss/hspace/blob/main/vscode-extension/README.zh-CN.md)

Publish any HTML file as a shareable public link in one click, with optional password protection. Built for sharing AI-generated single-page HTML.

## Features

- ☁️ **One-click publish** — open an `.html` file, click the cloud icon in the editor title bar (or use the context menu); the link and password are copied to your clipboard automatically
- 🔒 **Password protected by default** — every publish gets a random 4-digit password automatically; visitors must enter it before viewing (remembered for 24 hours). You can change the password anytime
- 🗂 **Manage published pages** — the "HTML Share · 最近发布" (recent publishes) panel in the Explorer sidebar lets you open, copy link, set password, or delete
- ⏳ **Auto expiry** — anonymous pages expire after 7 days by default, so nothing piles up
- 🛡 **Content isolation** — every page gets its own subdomain (`<slug>.zhanjian.space`), isolated from each other and from the API domain

## Quick Start

1. Install the extension
2. Open any `.html` file
3. Click the ☁️ icon in the editor title bar
4. The link and its password are on your clipboard — paste them anywhere 🎉

No sign-up, no configuration. It just works.

## Changing the Password

Every page is published with a random 4-digit password. To change it:

- Click "修改密码" (Change password) on the publish-success notification
- Right-click a page in the recent-publishes sidebar panel → "设置/修改密码" (Set/Change password)
- Command Palette → `HTML Share: 设置/修改密码` (Set/Change password)

Submitting an empty input removes the password.

## Settings

| Setting | Default | Description |
|---|---|---|
| `htmlshare.apiBaseUrl` | official hosted instance | Backend API base URL; point it at your own deployment if you self-host |
| `htmlshare.defaultExpiryDays` | `7` | Default expiry (in days) for published links |

## Limits (default hosted instance)

- Single HTML file only, ≤ 2 MB
- Anonymous pages expire after 7 days by default
- Max 20 publishes per IP per hour
- Phishing, malicious scripts, and other abusive content are prohibited and will be taken down

## Self-Hosting

The backend is an open-source Cloudflare Worker (R2 + D1 + KV). Deploy your own instance and point `htmlshare.apiBaseUrl` at it. See the [GitHub repository](https://github.com/agentx1boss/hspace).

## Privacy

Publishing uploads the current HTML file to the backend and creates a public link; nothing else is collected. Deleted pages become inaccessible immediately.

## License

MIT
