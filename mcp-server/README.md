# HSpace MCP Server

在 Claude / Cursor 等支持 MCP 的客户端里,**直接在对话中**把 AI 生成的 HTML / Markdown 私密发布成「链接 + 密码」。内容在哪诞生,分享就在哪发生。

## 提供的工具

| 工具 | 作用 |
|---|---|
| `publish` | 发布单个 HTML / Markdown 文档,返回链接 + 密码 |
| `publish_collection` | 把多篇(≥2)打包成一个合集:一个链接、一个密码、一个目录页 |

两者默认自动生成 4 位数字密码(私密分享是产品默认);Markdown 会被渲染成排版精良的阅读页。

## 安装与配置

无需全局安装,`npx` 直接拉取运行。按你的客户端选装法(顺序同[落地页](https://hspace.zhanjian.space)):

### Claude Code(推荐,一键装)

直接装[插件](../clients/claude-code),自带本 MCP + `/share` 命令:

```bash
claude plugin marketplace add agentx1boss/hspace
claude plugin install hspace@hspace
```

然后运行 `/share`,或直接对 Claude 说「把这个发成带密码的链接」。只想要 MCP 也行:`claude mcp add hspace -- npx -y hspace-mcp`。

### Cursor

设置 → MCP → Add 会打开 `~/.cursor/mcp.json`(或项目级 `.cursor/mcp.json`),用与下方「Claude Desktop」相同的 JSON,把 `hspace` 加进 `mcpServers` 即可。更爱编辑器?从 [Open VSX](https://open-vsx.org/extension/agentx1boss/hspace) 装 VS Code 插件——同样的一键面板。

### Codex CLI

一条命令:

```bash
codex mcp add hspace -- npx -y hspace-mcp
```

或写进 `~/.codex/config.toml`(用 **TOML**,不是 JSON):

```toml
[mcp_servers.hspace]
command = "npx"
args = ["-y", "hspace-mcp"]

# 可选
# [mcp_servers.hspace.env]
# HSPACE_API_KEY = "your-api-key"
```

### Claude Desktop / 其他 MCP 客户端

编辑 `claude_desktop_config.json`(设置 → Developer → Edit Config),用标准 JSON:

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

包名 `hspace-mcp`,公开包。`prepublishOnly` 会自动 `npm run build`。

### 推荐:打 tag 由 CI 自动发布

```bash
cd mcp-server
npm version patch          # 改 package.json version(不自动 push)
cd .. && git add -A && git commit -m "mcp: v<x.y.z>"
git tag mcp-v<x.y.z>       # 版本号须与 package.json 一致
git push && git push --tags
```

推送 `mcp-v*` tag 触发 **Release MCP** 工作流:校验版本一致 → `npm ci` → 构建 → `npm publish`。与插件的 `v*` tag 互不干扰(`v*` 发双市场,`mcp-v*` 发 npm)。

**一次性前置**:npmjs.com → Access Tokens 建一个 **Automation / Granular token(勾选 bypass 2FA)**,加为仓库 secret `NPM_TOKEN`。

### 备用:本地手动发布(带 2FA 验证码)

```bash
cd mcp-server
npm login && npm whoami
npm version patch
npm publish --access public --otp=<身份验证器 6 位码>   # 30 秒刷新,尽快回车
npm view hspace-mcp version
```

- 发布后 MCP 配置里的 `npx -y hspace-mcp` 才可用;发新版无需改客户端配置,`npx` 会拉最新。

## License

MIT
