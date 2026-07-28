# HSpace CLI + MCP Server

把 AI 生成的 HTML / Markdown 私密发布成「链接 + 密码」——**在 AI 对话里**(MCP),或**在终端里**(CLI)。内容在哪诞生,分享就在哪发生。

一个包,两个入口:

| 入口 | 命令 | 用在哪 |
|---|---|---|
| CLI | `hspace publish report.md`(装法见下) | 终端、脚本、Makefile,以及任何会跑 shell 的 agent(Aider / Codex CLI / 自研) |
| MCP server | `npx -y hspace-mcp`(写进客户端配置) | Claude Code / Cursor / Codex / Claude Desktop 的对话里 |

## CLI

装一下(发布无需注册):

```bash
npm i -g hspace-mcp          # 然后直接 hspace <命令>
hspace publish report.md     # → 链接 + 4 位密码,一行,一次粘贴发走
hspace publish ./方案/        # 目录里的多篇 md/html 自动成合集
cat report.md | hspace publish -   # 管道
```

不想装,用 npx 也行,但**必须带 `--package`**:

```bash
npx --package=hspace-mcp hspace publish report.md
```

> ⚠️ 别写成 `npx hspace …`。npx 把第一个参数当**包名**,而 npm 上的 `hspace`
> 是另一个人的包(一个交易 agent CLI),那条命令会去下载并运行它,不是本工具。
> 本包名是 `hspace-mcp`,`hspace` 只是它的 bin 名。

| 命令 | 作用 |
|---|---|
| `hspace publish <文件\|目录\|->` | 发布;一律自动生成 4 位密码 |
| `hspace update <slug> <文件\|目录>` | 换内容,**链接不变**(别重新发布) |
| `hspace passwd <slug>` | 改密码(新密码从 stdin 读,留空自动生成) |
| `hspace ls` | 列出稿(登录=账户全部;未登录=本机记下的) |
| `hspace stats <slug>` | 访问回执:被打开几次 |
| `hspace grant <slug> --label 张三` | 每人一链:给一个人单独一把密码(需登录) |
| `hspace grants <slug>` / `revoke <slug> <id>` | 看访问人 / 踢掉某个人(即时生效,不动其他人) |
| `hspace renew <slug>` | 续期(需登录;每期最长 30 天) |
| `hspace versions\|restore <slug>` | 版本历史 / 回滚(需登录) |
| `hspace rm <slug>` | 删除,链接立即失效 |
| `hspace login` / `logout` / `whoami` | 账户(API key 从 **stdin** 读,不写进命令行) |

`--json` 给脚本用,`--expires <天>` 定有效期(1–30),`hspace help` 看全部。

几个刻意的设计:

- **密码永不通过命令行参数传**。shell history 与 CI 日志都会留痕,所以发布一律自动生成、改密码只从 stdin 读。也没有 `--public`:私密是默认。
- **没有永久链接**。稿改了就 `hspace update`,**别重新发布**——链接不变,读者不用换书签,你也不会攒下一堆过期页。
- **匿名发布的 `editToken` 记在 `~/.config/hspace/state.json`(0600)**,它是后续改/删/查回执的唯一凭据。换机器就管不了那一页了(想跨机器管理就登录)。写入是原子的(临时文件 + rename)并加文件锁,并发跑不会丢 token;文件若损坏会报错并备份,**不会**当成空状态覆盖掉。
- **凭据按 API 地址分仓**。`HSPACE_API_BASE` 指到别处时,官方那把 key 不会被带过去。
- **发布成功但本机没记下**(目录不可写、磁盘满……)时,链接、密码与 `editToken` 会照样打印出来并以非零码退出 —— 页面已经在线上,凭据不能烂在进程里。

## MCP:提供的工具

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
| `HSPACE_API_BASE` | 官方托管实例 | 后端 API 地址(自建用)。**必须是 https**,只有 localhost/127.0.0.1 允许 http;本机保存的凭据**按这个地址分仓**,换地址不会把 key 递给新地址 |
| `HSPACE_API_KEY` | 无 | 可选;登录凭据,解锁更长有效期(30 天/期,可续)与更高配额。CLI 里也可以 `hspace login` 存到本机 |
| `HSPACE_CONFIG_DIR` | `~/.config/hspace` | 仅 CLI:本机状态目录(认 `XDG_CONFIG_HOME`) |

## 本地开发

```bash
npm install
npm run build
npm test             # CLI 参数/装配/本机状态的单元测试
node dist/index.js   # 通过 stdio 提供 MCP 服务
node dist/cli.js --help
HSPACE_API_BASE=http://localhost:8787 node dist/cli.js publish x.md   # 打自建/本地后端
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
