# 从零到上线:用 Cloudflare 边缘搭一个「AI 内容定向分享」工具(HSpace 全栈教程)

> 一篇**可跟做**的教程。既讲清 HSpace 用到的**完整技术栈**,也带你**克隆仓库、搭起自己的实例**——代码开源,这篇就是拿来复刻的,不只是读的。
>
> - **源码(克隆它):** <https://github.com/agentx1boss/hspace>(MIT)
> - **在线体验:** <https://hspace.zhanjian.space>
> - **前置条件:** Node ≥ 18、一个 [Cloudflare](https://dash.cloudflare.com) 账号且**名下有一个域名(zone)**、一个 GitHub 账号。预算约一个下午。

**范围说明:** 深层实现(完整 Worker 源码)在仓库里——这篇是「地图 + 代码替你做不了的人工步骤」(开账号、DNS、密钥)。边读边把仓库克隆下来对照。

**术语速查**(全文通用):**slug** = 页面的短随机 id(如 `a7k2m9x`);**边缘/edge** = Cloudflare 离用户最近的计算节点;**TTL** = 有效期;**grant** = 每个接收者各自的一条密码记录;**PBKDF2 / HMAC** = 密码哈希 / Cookie 签名算法(都在 Web Crypto API 里)。

## 0. 它是什么,为什么这么做

**HSpace = 给 AI 编程开发者的「定向分享」**:把 AI 写好的 HTML demo / Markdown 文档,一键变成「链接 + 密码」,只发给该看的人;有访问回执、可撤回、可迭代(链接不变)。

一句话定位:**Ship to one, not to all.**(稿出即递,点开即读,心里有数。)

贯穿全篇的设计取舍:

- **强制密码**是产品身份——不做公开画廊。
- **没有永久链接**:所有链接都会过期(匿名 3 天、登录 30 天/期可续)。*(唯一例外:第一方置顶内容——如落地演示——靠直接改库 `expires_at=NULL`,是运营动作,不是产品能力。)*
- **内容页一律 `noindex` + 密码门**——唯一能被搜索引擎索引的只有落地页。
- **自包含页面**:阅读页/密码页/落地页全部内联 CSS/JS/SVG,不引任何外部脚本、字体、图片(CSP 安全、加载快、隐私好)。

## 1. 架构:一个 Worker 扛下所有

最反直觉、也最省心的一点:**整个后端就是一个 Cloudflare Worker**。它按「请求打到哪个域名」分流,一套代码同时是内容站、落地页、API。

同一个 Worker 里靠 `host` 判断:内容子域取页面并过密码门;`hspace.` 子域出落地页、`/privacy`、`/terms`、`/report`、埋点 `/e`、`/openapi.json`、`/robots.txt`、`/sitemap.xml`、`/console` 登录页、`/auth/github*` OAuth 路由;其余按 API 处理。

> 通配子域 `*.zhanjian.space` 是关键:每篇分享都是一个独立子域 `<slug>.zhanjian.space`,靠一条通配路由 + 通配 DNS 全部接住,无需逐篇建记录。(见 §4 步骤 3——这是最容易卡住的一步。)

## 2. 技术栈全景

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 | **Cloudflare Workers**(TypeScript) | 边缘函数,一个 Worker 承载全部 |
| 对象存储 | **R2** | HTML/Markdown 原文(明文;安全靠 HTTPS 传输 + 密码哈希,不是「加密存储」) |
| 元数据库 | **D1**(SQLite) | `pages` / `versions` / `grants` / `api_keys` / `users` / `metrics` / `reports` |
| 计数/限流 | **KV** | 每 IP 频率计数、暴力破解锁定 |
| Markdown | **marked**(GFM) | 在边缘把 MD 渲染成自包含阅读页 |
| 密码/签名 | **Web Crypto** | PBKDF2 密码哈希 + HMAC 签名 Cookie |
| 登录 | **GitHub OAuth** | 发放 API key,解锁续期/更大额度 |
| CLI/部署 | **Wrangler** | 本地开发 + 部署 |
| 编辑器插件 | **VS Code Extension**(`vscode-extension/`) | `@vscode/vsce` 打包 + `ovsx` 发布 |
| AI 调用 | **MCP server**(`mcp-server/`)+ **OpenAPI 3.0.3** | `@modelcontextprotocol/sdk` + `zod`;`/openapi.json` 供 GPT Actions |
| Claude Code | **插件 + marketplace**(`clients/claude-code/`) | `plugin.json` + `.mcp.json` + `/share` 命令 |
| CI/CD | **GitHub Actions** | 部署后端、发插件、发 npm |

## 3. 后端拆解

### 3.1 存储三件套的分工

- **R2** 只存内容:对象 key 的后缀即类型——`pages/<slug>.md`、`pages/<slug>.html`,合集是 `pages/<slug>/index.json`;版本化写带版本号的 key(`pages/<slug>.vN.<ext>`)。
- **D1** 存一切结构化数据(上表 7 张表,完整建表语句见 [`backend/schema.sql`](https://github.com/agentx1boss/hspace/blob/main/backend/schema.sql))。注意:**没有 `receipts` 表**——「回执」是从 `pages.hits` 和每人 `grants.hits` / `last_seen_at` **派生**出来的。
- **KV** 只做「快而短命」的计数:频率限制、暴力破解锁定窗口。

### 3.2 边缘密码门(核心)

核心逻辑在 [`backend/src/index.ts`](https://github.com/agentx1boss/hspace/blob/main/backend/src/index.ts)(路由/服务)与 [`backend/src/crypto.ts`](https://github.com/agentx1boss/hspace/blob/main/backend/src/crypto.ts)(哈希/签名)。接收方访问 `<slug>.zhanjian.space`:

1. 无有效 Cookie → 返回**密码页**(401)。
2. 提交密码 → 边缘用 **PBKDF2** 校验哈希(库里从不存明文密码)。
3. 通过 → 下发 **HMAC 签名 Cookie**(`<slug>.<grantId>.<exp>.<sig>`),24 小时免重输;**303 重定向回原路径**,深链(合集第 N 篇)直达。
4. 「每人一链」= 同一链接、每个接收者一个独立密码(grant),按人统计、可单独即时撤销。

防滥用是一组叠加的闸门(都在 `wrangler.toml` 的 vars 里调):每 IP 每小时/每天发布上限、匿名 TTL 钳制、暴力破解锁定(KV)、钓鱼特征正则、单页访问量封顶、全局匿名日流量熔断。

### 3.3 Markdown 边缘渲染

MD 原文存 R2,访问时用 `marked` 在边缘渲染成自包含阅读页(内联样式、亮暗自适应)。好处:升级阅读模板对**已发布内容即时生效**。

## 4. ⭐ 从零搭起你自己的实例

能脚本化的都在仓库里;下面是**只能人工做一次**的账号/DNS/密钥。命令假设你已克隆仓库。

### 步骤 0 —— 克隆 & 安装

```bash
git clone https://github.com/agentx1boss/hspace
cd hspace/backend
npm install
npm i -g wrangler && wrangler login   # 打开浏览器授权
```

### 步骤 1 —— 建 Cloudflare 资源

```bash
wrangler r2 bucket create <bucket-name>          # 例:my-pages
wrangler d1 create <db-name>                      # 记下返回的 database_id
wrangler kv namespace create RATELIMIT            # 记下返回的 id
```

再建表(建表语句 `backend/schema.sql` 已在仓库里):

```bash
wrangler d1 execute <db-name> --file=./schema.sql
```

### 步骤 2 —— 填 `wrangler.toml`

**绑定名**(`BUCKET` / `DB` / `RATELIMIT`)是固定的——Worker 代码按名字读它们;只有资源名/id 和你的域名要改。最小骨架:

```toml
name = "html-share"
main = "src/index.ts"
compatibility_date = "2024-11-01"
account_id = "<你的-account-id>"
workers_dev = true

routes = [
  { pattern = "*.<你的域名>/*", zone_name = "<你的域名>" },
]

[vars]
API_DOMAIN = "<你的-worker>.<sub>.workers.dev"
USERCONTENT_DOMAIN = "<你的域名>"
MAX_SIZE_BYTES = "2097152"          # 2 MB(登录)
ANON_MAX_SIZE_BYTES = "524288"      # 512 KB(匿名)
ANON_DEFAULT_TTL = "259200"         # 3 天(匿名,一次性)
OWNER_MAX_TTL = "2592000"           # 30 天(登录,可续)
RATE_LIMIT_PER_HOUR = "20"
RATE_LIMIT_PER_DAY = "50"
ANON_MAX_HITS = "10000"
ANON_DAILY_GLOBAL_BYTES = "524288000"
COLLECTION_MAX_SIZE_BYTES = "5242880"
ANON_MAX_DOCS = "3"
MAX_DOCS = "50"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "<bucket-name>"

[[d1_databases]]
binding = "DB"
database_name = "<db-name>"
database_id = "<database_id>"

[[kv_namespaces]]
binding = "RATELIMIT"
id = "<kv-id>"
```

### 步骤 3 —— DNS + 路由(最容易卡住的一步)

要让 `<slug>.<域>` 打到你的 Worker,需要**两样东西,不是一样**:

1. **一条被代理的通配 DNS 记录**,让主机名解析到 Cloudflare 边缘。面板 → DNS,加一条 `AAAA` 记录:名称 `*`、内容 `100::`(丢弃地址)、**代理状态 = 已代理(橙云)**。再给落地页子域 `hspace` 同样加一条被代理的记录。(你不是把 DNS 直接「指向 Worker」——被代理的记录把请求带到 Cloudflare,再由**路由**绑定 Worker。)
2. **Workers 路由** —— 即步骤 2 里 `wrangler.toml` 的 `routes`,把 `*.<域>/*` 绑到这个 Worker。

> 通配路由要求 zone 已在 Cloudflare 生效。`www`/根域常被别的服务占用——这也是落地页放在 `hspace.` 子域的原因。

### 步骤 4 —— 密钥 & GitHub OAuth(绝不写进 toml)

```bash
wrangler secret put COOKIE_SIGNING_SECRET   # 随机长串(密码 Cookie 签名)
wrangler secret put SESSION_SECRET          # 随机长串(登录会话签名)
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

在 **github.com → Settings → Developer settings → OAuth Apps → New** 建一个 OAuth App:

- **Authorization callback URL**(必须完全一致):`https://hspace.<你的域名>/auth/github/callback`
- **Scopes:** 不需要任何权限(HSpace 只读你的公开身份)。
- 把 Client ID / 生成的 Client Secret 填进上面两个 secret。

OAuth 流程:`/auth/github`(起点)→ GitHub → `/auth/github/callback` → 会话 Cookie;用户在 **`/console`** 登录并生成 API key。

### 步骤 5 —— 部署

```bash
npm run deploy          # = wrangler deploy
```

### 步骤 6 —— ✅ 验证跑通了

```bash
# 1. 健康检查(API 在 workers.dev)
curl https://<你的-worker>.<sub>.workers.dev/health
# → {"ok":true,"service":"hspace"}

# 2. 登录 + 拿 API key
open https://hspace.<你的域名>/console       # GitHub 登录 → 复制 API key

# 3. 发第一个页面
curl -X POST https://<你的-worker>.<sub>.workers.dev/publish \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# 你好\n私密世界","password":"1234"}'
# → 返回 { url, passwordProtected: true, ... }

# 4. 打开返回的 URL → 应看到密码门。输 1234 → 页面渲染出来。
```

四步都过,你的实例就上线了。

### 故障排查

- **`<slug>.<域>` 解析不了 / 522** → 少了被代理的通配 DNS 记录,或少了 Workers 路由(步骤 3 **两者都要**)。
- **OAuth 报 `redirect_uri mismatch`** → GitHub App 里的回调 URL 必须逐字节等于 `https://hspace.<域>/auth/github/callback`。
- **`D1_ERROR` / 绑定未定义** → 绑定名必须正好是 `DB`(以及 `BUCKET`、`RATELIMIT`);重查 `wrangler.toml`、确认 `schema.sql` 跑过。
- **发布返回 `too_large` / `rate_limited`** → 是防滥用在起作用;调大 `[vars]` 阈值或登录。

## 5. 四条分发渠道

四条都在同一个仓库:

1. **VS Code / Cursor 扩展**(`vscode-extension/`):一键发布,侧栏管回执/访问人/版本。
2. **MCP server**(`mcp-server/`,发布为 `hspace-mcp`):在 Claude Desktop / Cursor / Codex 对话里直接「把这个发成带密码的链接」。
3. **Claude Code 插件**(`clients/claude-code/`):一条命令装好 `/share` + MCP 配置。
4. **OpenAPI**:`/openapi.json` 供 GPT Actions、agent 框架直接消费。

> Cursor / Claude Desktop 本质同一套 `mcp.json`;真正独立的安装机制只有 Claude Code 插件(`claude plugin …`)和 Codex(`codex mcp add`)。

## 6. CI/CD:三条流水线(开始迭代后)

| 触发 | 工作流 | 动作 |
|---|---|---|
| 推 `main`(改动 `backend/**`) | Deploy Backend | `tsc` → `wrangler deploy` → `/health` 冒烟 |
| 打 `v*` tag | Release Extension | 校验版本一致 → 打包 vsix → 发 Marketplace + Open VSX → GitHub Release |
| 打 `mcp-v*` tag | Release MCP | 校验版本一致 → build → `npm publish` |

Claude Code 插件不用 tag:改 `plugin.json` 的 `version` 推 `main`(版本 pin)。需要的仓库 secret:`CLOUDFLARE_API_TOKEN`、`VSCODE_KEY`、`OPENVSX_KEY`、`NPM_TOKEN`(用勾了 bypass-2FA 的 automation token)。

## 7. 踩过的坑(真实经历)

- **slug 大小写**:子域名 DNS 大小写不敏感,用 base62 会撞车 → 改成**小写 base36**(0-9 + a-z)。
- **`.env` 差点进仓库**:`git add -A` 会把它扫进去 → 先 `.gitignore`,已入库的用 `git rm --cached`。
- **npm 2FA**:CI 发布要用勾了 bypass-2FA 的 automation token;本地手动发才用 OTP。
- **`npm version` 会自动打 tag**:会误触发别的流水线 → 用 `npm version <x> --no-git-tag-version` 再手动打对前缀的 tag。
- **OpenAPI 兼容 GPT Actions**:可空字段要用 `nullable: true`,别用 `type: [..., "null"]`。

## 8. 成本与产品级不变量

- **成本**:Cloudflare Workers Paid($5/月)绰绰有余;轻量用免费档也行,但自定义域上的 Workers 路由、R2/D1 配额是要留意的点。无其他基础设施。
- **没有永久链接** —— 产品承诺而非限制(第一方置顶内容例外,靠直接改库)。
- **内容明文存 R2** —— 只说「HTTPS 传输 / 密码哈希」,不说「加密存储」。
- **内容页 `noindex` + 密码门** —— 配合 `X-Robots-Tag: noindex` 与全禁的 `robots.txt`。
- **自包含页面** —— 全内联,不引外部资源。

## 9. 结语

一个边缘 Worker + R2/D1/KV,就能把「私密分享 AI 内容」做成产品级。最花时间的从来不是代码,而是 §4 那些**只能人工做一次**的账号与授权——克隆仓库、走一遍 §4,一个下午就能拥有自己的实例。

源码:<https://github.com/agentx1boss/hspace> · 在线体验:<https://hspace.zhanjian.space>
