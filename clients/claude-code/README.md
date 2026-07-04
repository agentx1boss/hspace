# HSpace for Claude Code

A `/share` slash command that publishes what you just built into a **private link + password**, straight from Claude Code — powered by the [HSpace MCP server](../../mcp-server).

## Setup (once)

1. Add the HSpace MCP server:
   ```bash
   claude mcp add hspace -- npx -y hspace-mcp
   ```
2. Install the `/share` command:
   ```bash
   # for one project:
   mkdir -p .claude/commands && curl -sL https://raw.githubusercontent.com/agentx1boss/hspace/main/clients/claude-code/commands/share.md -o .claude/commands/share.md
   # or globally, for every project:
   mkdir -p ~/.claude/commands && curl -sL https://raw.githubusercontent.com/agentx1boss/hspace/main/clients/claude-code/commands/share.md -o ~/.claude/commands/share.md
   ```
   (Or just copy [`commands/share.md`](commands/share.md) into `.claude/commands/`.)

## Use

```
/share                     # share the HTML/Markdown you just generated
/share report.md           # share a specific file
/share ./docs              # share a folder as a collection
```

You get back a link + password to paste to whoever should see it. Change the password or revoke anytime from the VS Code extension panel, or via the API.

## Want it proactive?

The `/share` command is an explicit trigger. If you'd rather have Claude **offer** to share on its own after producing something shareable, add this to your project's `CLAUDE.md`:

> When you produce an HTML demo, report, or document the user might want to send to specific people, offer to publish it privately with HSpace (a link + password), and use `/share` if they agree.

## Roadmap

This command + the MCP server are the first pieces of a future one-install **Claude Code plugin** (bundling the MCP config, `/share`, and the proactive behavior).
