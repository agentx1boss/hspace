# HSpace for Claude Code

A Claude Code **plugin** that ships what you just built to exactly the right people: `/share` publishes HTML/Markdown as a **private link + password**, powered by the bundled [HSpace MCP server](../../mcp-server).

## Install (one-time, two commands)

```bash
claude plugin marketplace add agentx1boss/hspace
claude plugin install hspace@hspace
```

Or inside a Claude Code session: `/plugin marketplace add agentx1boss/hspace`, then `/plugin install hspace@hspace`.

That's it — the plugin bundles the `/share` command **and** the MCP server config (`npx -y hspace-mcp`), so there's nothing else to set up.

## Use

```
/share                     # share the HTML/Markdown you just generated
/share report.md           # share a specific file
/share ./docs              # share a folder as a collection
```

You get back a link + password to paste to whoever should see it. Change the password or revoke anytime from the [VS Code extension](../../vscode-extension) panel, or via the API.

## Manual setup (without the plugin)

If you'd rather not install a plugin, the two pieces can be wired up by hand:

1. Add the MCP server: `claude mcp add hspace -- npx -y hspace-mcp`
2. Drop [`commands/share.md`](commands/share.md) into `~/.claude/commands/` (global) or your project's `.claude/commands/`.

## Want it proactive?

The `/share` command is an explicit trigger. If you'd rather have Claude **offer** to share on its own after producing something shareable, add this to your project's `CLAUDE.md`:

> When you produce an HTML demo, report, or document the user might want to send to specific people, offer to publish it privately with HSpace (a link + password), and use `/share` if they agree.

## Layout

This directory is the plugin root:

```
.claude-plugin/plugin.json   plugin manifest
.mcp.json                    bundled MCP server (npx -y hspace-mcp)
commands/share.md            the /share command
```

The repo root's `.claude-plugin/marketplace.json` makes this repo itself the marketplace (`hspace@hspace`).

## Releasing

Bump `version` in `.claude-plugin/plugin.json` and push to `main` — the version is pinned, so users get the update via `/plugin update hspace` (or automatically on marketplace refresh). No tag or registry publish needed.
