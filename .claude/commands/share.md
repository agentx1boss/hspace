---
description: Publish HTML/Markdown privately via HSpace — a link + password, only for the people you choose
argument-hint: "[file path, folder, or blank for what you just made]"
---

Publish content as a **private HSpace link** (a password-gated URL) using the HSpace MCP tools (`publish` / `publish_collection`).

Target: $ARGUMENTS

Do this:

1. **Decide what to share.**
   - If the argument is a file path → read that file and share it.
   - If it's a folder, or several files → share them together as a **collection** (`publish_collection`).
   - If the argument is blank or "this" → share the most relevant HTML/Markdown you just produced or edited in this conversation. If it's genuinely ambiguous which file, ask the user once, briefly.
   - Only `.html` / `.htm` / `.md` / `.markdown` content is supported. Each file must be self-contained (no external/relative asset references).

2. **Pick the tool.**
   - One document → `publish` (set `format` to `html` or `markdown` by file type).
   - Two or more related documents → `publish_collection`.

3. **Passwords & expiry: use defaults.** Do NOT pass a custom `password` unless the user explicitly gave one — let it auto-generate. Don't set `expiresInDays` unless the user asked.

4. **Report back for paste-and-send.** Give the user the **link and password together on one line** (e.g. `https://xxxx.zhanjian.space  password: 4831`) so they can paste it straight into chat/email, and remind them the recipient needs the password to open it.

If the HSpace MCP tools are not available, tell the user to add the server first:
`claude mcp add hspace -- npx -y hspace-mcp`
then run `/share` again.
