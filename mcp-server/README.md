# HSpace MCP Server

在 Claude / Cursor 等支持 MCP 的客户端里,**直接在对话中**把 AI 生成的 HTML / Markdown 私密发布成「链接 + 密码」。内容在哪诞生,分享就在哪发生。

## 提供的工具

| 工具 | 作用 |
|---|---|
| `publish` | 发布单个 HTML / Markdown 文档,返回链接 + 密码 |
| `publish_collection` | 把多篇(≥2)打包成一个合集:一个链接、一个密码、一个目录页 |

两者默认自动生成 4 位数字密码(私密分享是产品默认);Markdown 会被渲染成排版精良的阅读页。

## 安装与配置

无需全局安装,用 `npx` 直接跑。在客户端的 MCP 配置里加:

```jsonc
{
  "mcpServers": {
    "hspace": {
      "command": "npx",
      "args": ["-y", "hspace-mcp"],
      "env": {
        // 可选:自建后端地址(默认官方托管实例)
        // "HSPACE_API_BASE": "https://your-worker.workers.dev",
        // 可选:登录后可发更长有效期(30 天/期,可续)、更大体积、无日配额
        // "HSPACE_API_KEY": "your-api-key"
      }
    }
  }
}
```

- **Claude Desktop**:编辑 `claude_desktop_config.json`(设置 → Developer → Edit Config)。
- **Cursor**:设置 → MCP → Add,填入上面的 command/args。
- **Claude Code**:`claude mcp add hspace -- npx -y hspace-mcp`。

配置后重启客户端,即可对 AI 说「把这份内容发布成带密码的链接」。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `HSPACE_API_BASE` | 官方托管实例 | 后端 API 地址 |
| `HSPACE_API_KEY` | 无 | 可选;登录凭据,解锁更长有效期(30 天/期,可续)与更高配额 |

## 本地开发

```bash
npm install
npm run build
node dist/index.js   # 通过 stdio 提供 MCP 服务
```

## License

MIT
