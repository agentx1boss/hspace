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

## 发布到 npm(维护者)

发布者当前为 `wjllance`;包名 `hspace-mcp`,公开包。`prepublishOnly` 会自动 `npm run build`。

```bash
cd mcp-server
# 1) 首次:登录(账号 wjllance)
npm login && npm whoami

# 2) 升版本(补丁/次版本/主版本),会改 package.json 并本地打 tag
npm version patch

# 3) 发布 —— npm 账号开了 2FA,必须带一次性验证码
npm publish --access public --otp=<身份验证器 6 位码>

# 4) 验证
npm view hspace-mcp version
```

- **2FA 说明**:发布时必须 `--otp=<code>`(30 秒刷新,复制后尽快回车)。若想免手输(或将来做 CI 自动发布),在 npmjs.com → Access Tokens 建一个 **Granular/Automation token 并勾选 bypass 2FA**,写入 `~/.npmrc`(`//registry.npmjs.org/:_authToken=...`)或设为 CI secret `NPM_TOKEN`。
- 发布后 MCP 配置里的 `npx -y hspace-mcp` 才可用;发新版无需改客户端配置,`npx` 会拉最新。
- 提交 `package.json` 的版本变更并 push(`git push --tags` 若用了 `npm version`)。

> 与插件不同:插件是打 `v*` tag 由 CI 自动发双市场;MCP 目前是**手动 `npm publish`**(尚无 CI 自动发布)。

## License

MIT
