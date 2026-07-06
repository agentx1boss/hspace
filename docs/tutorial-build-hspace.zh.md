# 从零到上线:用 Cloudflare 边缘搭一个「AI 内容定向分享」工具(HSpace 全栈教程)

> 一篇复盘式免费教程。讲清楚 HSpace 这个产品**用到的完整技术栈**,以及**从零搭起来必须人工做的每一步**。
> 在线体验:<https://hspace.zhanjian.space> · 源码开源(MIT)。

## 0. 它是什么,为什么这么做

**HSpace = 给 AI 编程开发者的「定向分享」**:把 AI 写好的 HTML demo / Markdown 文档,一键变成「链接 + 密码」,只发给该看的人;有访问回执、可撤回、可迭代(链接不变)。

一句话定位:**Ship to one, not to all.**(稿出即递,点开即读,心里有数。)

和普通 HTML 托管的关键差异,也是贯穿全篇的设计取舍:

- **强制密码**是产品身份,不是可选项——不做公开画廊。
- **没有永久链接**:所有链接都有有效期(匿名 3 天、登录 30 天/期可续),弃置即自动过期。
- **内容页一律 `noindex` + 密码门**——所以唯一能被搜索引擎索引的其实只有落地页。
- **自包含页面**:阅读页/密码页/落地页全部内联 CSS/JS/SVG,不引任何外部脚本、字体、图片(CSP 安全、加载快、隐私好)。

## 1. 架构:一个 Worker 扛下所有

最反直觉、也最省心的一点:**整个后端就是一个 Cloudflare Worker**。它按「请求打到哪个域名」分流,一套代码同时是:

```
                     ┌─────────────────────────────────────────┐
   *.zhanjian.space  │  一个 Cloudflare Worker (TypeScript)      │
   ─────────────────>│                                          │
                     │  · <slug>.zhanjian.space → 内容页 + 密码门 │
   hspace.…space     │  · hspace.…      → 落地页/法务/埋点/openapi │
   ─────────────────>│  · *.workers.dev → 发布 API               │
                     │                                          │
   html-share.       │   存储:                                   │
   …workers.dev      │   · R2  内容对象(HTML/MD 明文)            │
   ─────────────────>│   · D1  元数据/版本/访问人/回执/举报        │
                     │   · KV  频率限制计数                       │
                     └─────────────────────────────────────────┘
```

同一个 Worker 里靠 `host` 判断走哪条路:内容子域去取页面并过密码门;`hspace.` 子域出落地页、`/privacy`、`/terms`、`/report`、埋点 `/e`、`/openapi.json`、`/robots.txt`、`/sitemap.xml`;其余按 API 处理。

> 通配子域 `*.zhanjian.space` 是关键:每篇分享都是一个独立子域 `<slug>.zhanjian.space`,靠一条通配路由 + 通配 DNS 全部接住,无需为每篇建记录。

## 2. 技术栈全景

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 | **Cloudflare Workers**(TypeScript) | 边缘函数,一个 Worker 承载全部 |
| 对象存储 | **R2** | 存 HTML/Markdown 原文(明文;安全靠 HTTPS 传输 + 密码哈希,不是「加密存储」) |
| 元数据库 | **D1**(SQLite) | `pages` / `versions` / `grants` / `api_keys` / `users` / `metrics` / `reports` |
| 计数/限流 | **KV** | 每 IP 频率计数、暴力破解锁定 |
| Markdown 渲染 | **marked**(GFM) | 在边缘把 MD 渲染成自包含阅读页 |
| 密码/签名 | **Web Crypto**(SubtleCrypto) | PBKDF2 密码哈希 + HMAC 签名 Cookie |
| 登录 | **GitHub OAuth** | 发放 API key,解锁续期/更大额度 |
| CLI/部署 | **Wrangler** | 本地开发 + 部署 |
| 编辑器插件 | **VS Code Extension**(TS) | `@vscode/vsce` 打包 + `ovsx` 发布 |
| AI 调用 | **MCP server** | `@modelcontextprotocol/sdk` + `zod`,stdio 传输 |
| AI 调用 | **OpenAPI 3.0.3** | `/openapi.json`,供 GPT Actions / agent 框架消费 |
| Claude Code | **插件 + marketplace** | `plugin.json` + `.mcp.json` + `/share` 命令 |
| CI/CD | **GitHub Actions** | 部署后端、发插件、发 npm |

## 3. 后端拆解

### 3.1 存储三件套的分工

- **R2** 只存内容:对象 key 的后缀即类型——`pages/<slug>.md`、`pages/<slug>.html`、合集是 `pages/<slug>/index.json`;版本化写带版本号的 key(`pages/<slug>.vN.<ext>`)。
- **D1** 存一切结构化数据:页面元信息、版本记录、每人一链的 grants、API key、登录用户、埋点计数、举报。
- **KV** 只做「快而短命」的计数:频率限制、暴力破解锁定窗口。

### 3.2 边缘密码门(核心)

接收方访问 `<slug>.zhanjian.space`:

1. 无有效 Cookie → 返回**密码页**(401)。
2. 提交密码 → 边缘用 **PBKDF2** 校验哈希(库里从不存明文密码)。
3. 通过 → 下发一个 **HMAC 签名 Cookie**(形如 `<slug>.<grantId>.<exp>.<sig>`),24 小时免重输;**303 重定向回原路径**,深链(合集第 N 篇)也能直达。
4. 「每人一链」= 同一链接、每个接收者一个独立密码(grant),按人统计访问、可单独撤销且即时生效。

防滥用是一组叠加的闸门:每 IP 每小时/每天发布次数上限、匿名 TTL 钳制、暴力破解锁定(KV)、钓鱼特征正则、单页访问量封顶、全局匿名日流量熔断。

### 3.3 Markdown 边缘渲染

MD 原文存 R2,访问时用 `marked` 在边缘渲染成自包含阅读页(内联样式、亮暗自适应、代码块/表格/CJK 字体栈)。好处:升级阅读模板对**已发布内容即时生效**。

## 4. 四条分发渠道

内容诞生在编辑器和 AI 对话里,所以分享入口也铺在那里:

1. **VS Code / Cursor 扩展**:一键发布当前文件/文件夹,侧栏管理回执、访问人、版本。
2. **MCP server**(`hspace-mcp`):在 Claude Desktop / Cursor / Codex 的对话里直接「把这个发成带密码的链接」。
3. **Claude Code 插件**:一条命令装好,自带 `/share` 命令 + MCP 配置。
4. **OpenAPI**:`/openapi.json` 供 GPT Actions、agent 框架直接消费。

> Cursor / Claude Desktop 本质是同一套 `mcp.json` 配置;真正独立的安装机制只有 Claude Code 插件(`claude plugin …`)和 Codex(`codex mcp add`)。

## 5. CI/CD:三条流水线

| 触发 | 工作流 | 动作 |
|---|---|---|
| 推 `main`(改动 `backend/**`) | Deploy Backend | `tsc` → `wrangler deploy` → `/health` 冒烟 |
| 打 `v*` tag | Release Extension | 校验版本一致 → 打包 vsix → 发 Marketplace + Open VSX → GitHub Release |
| 打 `mcp-v*` tag | Release MCP | 校验版本一致 → build → `npm publish` |

Claude Code 插件不用 tag:改 `plugin.json` 的 `version` 推 `main`,靠 marketplace 刷新更新(版本 pin)。

---

## 6. ⭐ 需要人工操作的步骤(从零复刻的完整清单)

这是全篇最实用的部分。自动化能做的都自动化了,但下面这些**必须人来做一次**——大多是「开账号 / 授权 / 配密钥 / 建资源」。

### A. 账号与一次性授权

1. **Cloudflare 账号**;`npm i -g wrangler` 后 `wrangler login`(浏览器授权)。
2. 一个托管在 Cloudflare 的**域名**(本例 `zhanjian.space`),用来做通配子域。
3. **GitHub 账号 + 仓库**(放代码、跑 Actions)。
4. **VS Code Marketplace publisher**(在 Azure DevOps 建 publisher、拿 PAT)。
5. **Open VSX 账号**(拿 token)。
6. **npm 账号**(`npm login`;发布时可能要 2FA 验证码)。

### B. 建 Cloudflare 资源(记下返回的 ID,填进 `wrangler.toml`)

```bash
wrangler r2 bucket create <bucket-name>          # 例:html-share-pages
wrangler d1 create <db-name>                      # 返回 database_id
wrangler kv namespace create RATELIMIT            # 返回 id
wrangler d1 execute <db-name> --file=./schema.sql # 建表
```

`wrangler.toml` 里手动填:`account_id`、路由 `pattern = "*.<你的域>/*"` + `zone_name`、以及上面三个资源的 `bucket_name` / `database_id` / KV `id`。

### C. DNS(在 Cloudflare 面板手动加)

- 通配记录 `*.<你的域>` 指向 Worker(让每篇 `<slug>.<域>` 都被接住)。
- 一个落地页子域(本例 `hspace.<域>`),因为 `www`/根域常被其他服务占用。

### D. Worker 密钥(`wrangler secret put`,**绝不写进 toml**)

```bash
wrangler secret put COOKIE_SIGNING_SECRET   # 密码 Cookie 签名(随机长串)
wrangler secret put SESSION_SECRET          # 登录会话签名(随机长串)
wrangler secret put GITHUB_CLIENT_ID        # GitHub OAuth App
wrangler secret put GITHUB_CLIENT_SECRET
```

> GitHub OAuth App 要去 GitHub 开发者设置里**手动建**,回调地址填你的登录接口。

### E. GitHub Actions 仓库 Secrets(在仓库 Settings → Secrets 手动加)

| Secret 名 | 用途 | 从哪拿 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CI 部署 Worker | Cloudflare「Edit Cloudflare Workers」模板 |
| `VSCODE_KEY` | 发 VS Code Marketplace | Azure DevOps PAT |
| `OPENVSX_KEY` | 发 Open VSX | Open VSX token |
| `NPM_TOKEN` | 发 npm(MCP) | npmjs Automation/Granular token(勾 bypass 2FA) |

### F. 日常发布(人工触发,CI 接手)

- **后端**:改完 `backend/**` 推 `main` → 自动部署。
- **插件**:改 `vscode-extension/package.json` 的 `version` → 打 `v<x.y.z>` tag → 推 tag。
- **MCP**:改 `mcp-server/package.json` 的 `version` → 打 `mcp-v<x.y.z>` tag → 推 tag。
- **Claude Code 插件**:改 `plugin.json` 的 `version` → 推 `main`。

> 安全习惯:密钥只进 `wrangler secret` 或 GitHub Secrets,**永远不进 git**。把 `.env` 加进 `.gitignore`;GitHub 的推送保护会拦截误提交的 token,但别依赖它兜底。

## 7. 踩过的坑(帮你省时间)

- **slug 大小写**:子域名 DNS 大小写不敏感,用 base62 会撞车 → 改成**小写 base36**。
- **`.env` 差点进仓库**:`git add -A` 会把它扫进去 → 先 `.gitignore`,已入库的用 `git rm --cached`。
- **npm 2FA**:CI 发布要用勾了 bypass-2FA 的 automation token;本地手动发才用 OTP。
- **`npm version` 会自动打 tag**:会误触发别的流水线 → 用 `npm version <x> --no-git-tag-version` 再手动打对前缀的 tag。
- **OpenAPI 兼容 GPT Actions**:可空字段要用 `nullable: true`,别用 `type: [..., "null"]`。
- **落地页别把 `/favicon.ico` 当页面**:返回真图,并给所有模板内联 data-URI 图标。

## 8. 几条「产品级不变量」(做同类产品建议照抄)

- **没有永久链接**:所有链接都有有效期,是产品承诺而非限制;别退回「永久」叙事。
- **内容明文存 R2**:文案只说「HTTPS 传输 / 密码哈希」,**不暗示「加密存储」**。
- **内容页 `noindex` + 密码门**:配合内容子域返回 `X-Robots-Tag: noindex` 与 `robots.txt` 全禁。
- **自包含页面**:任何注入到分享页里的东西都内联,不引外部资源。

## 9. 结语

一个边缘 Worker + R2/D1/KV,就能把「私密分享 AI 内容」这件事做成产品级:密码门在边缘、内容在对象存储、元数据在 SQLite、限流在 KV,再用 CI 把三个渠道的发布自动化。最花时间的从来不是写代码,而是第 6 节那些**只能人工做一次**的账号与授权——按清单走一遍,你也能在一个下午复刻出来。

在线体验 / 源码:<https://hspace.zhanjian.space>
