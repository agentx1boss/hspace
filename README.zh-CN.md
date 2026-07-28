> [English](README.md) | 简体中文

# HSpace — 稿出即递,点开即读,心里有数。

**落地页:https://hspace.zhanjian.space** · **API/OpenAPI:https://html-share.kzhan.workers.dev/openapi.json**

**AI 编程时代的私密 Markdown 分享。** AI 刚写完的 `.md`——方案、报告、深度调研——变成一个**带密码的精排阅读页**:目录、合集、亮暗主题,接收方零安装;HTML 同样原样能跑。你知道它被打开了几次,发错了人可以只把那个人的密码作废,内容随迭代更新而链接不变。所有链接都会过期,这是刻意设计。

## 不是又一个公开分享链接

Notion 分享链接、HackMD、Gist 都在**公开链接**这条路上竞争:粘贴出去,拿到的人就能读。HSpace 反着来:

- **默认私密。** 所有一等公民客户端(VS Code 插件、MCP、CLI、Claude Code 插件)发布时一律自动生成 4 位密码,链接和密码一起进剪贴板,一次粘贴就能发走;页面不被搜索引擎收录。*(裸调 API 可以省略密码——这是刻意留给自建者、agent 集成与公开教程的自由度。)*
- **成品的「稿」,不是站点、不是协作编辑。** 发的是「一份用来读的东西」——方案、报告、教程、demo。没有多文件托管、没有构建、没有配置。
- **在内容诞生的地方发布。** 编辑器里一键、AI 对话里一句话(MCP)、终端里一行命令(CLI)。

一句话:**别人「发布到全世界」,HSpace 只递给该看的人。**

## 你得到什么

| | |
|---|---|
| 🚀 **30 秒发出去** | 零注册零配置,链接 + 密码一次粘贴 |
| 📖 **点开即读** | `.md` 渲染成精排阅读页(左栏目录、篇间导航、亮暗主题、字号/宽度偏好);HTML 原样能跑 |
| 🎯 **发错了?收得回** | 每人一链:踢掉某一个人**即时生效**,不用换其他人的密码。改共享密码可挡住后续访问(已经验证过的浏览器还有 24 小时的门禁 Cookie) |
| 🔁 **链接是活的** | 内容随 AI 迭代,链接不变,历史可回滚。每条链接都有到期日、到期前可续期,弃置即自动清场 |

全栈 MIT——不放心就自己查代码,或者把服务搬到你自己的 Cloudflare 上。

## 现状(已上线)

- ✅ **Markdown 阅读页**:存原文、边缘渲染——标题锚点 + 左栏目录、代码高亮与一键复制、图片灯箱、亮暗主题、字号/宽度偏好
- ✅ **文档合集**:一批 md/html(可混排)打包成一个链接 + 密码 + 目录页,篇间导航
- ✅ **VS Code / Cursor 插件**:一键发布 `.md` / `.html`,自动 4 位密码,链接+密码复制即走,并带发布后的完整管理面板
- ✅ **MCP server**:在 Claude / Cursor 对话里直接发布(单篇 + 合集)
- ✅ **CLI**(`npm i -g hspace-mcp` → `hspace publish report.md`):在任何终端把稿递出去,发完之后也在终端管(`stats`、`grant`、`revoke`、`update`、`renew`、`versions`、`rm`)。零安装形式是 `npx --package=hspace-mcp hspace publish …`——`--package` 不能省,npm 上那个叫 `hspace` 的包是别人的
- ✅ **Claude Code 插件**:`/plugin marketplace add agentx1boss/hspace` → `/plugin install hspace@hspace` → `/share`(自带 MCP 配置,零手工接线)
- ✅ **访问回执**:每个链接的累计打开次数(`GET /pages/:slug/stats`);用了「每人一链」还能看到是谁看的
- ✅ **每人一链**:同一链接给每人独立密码,按人统计,单独撤销不影响他人(`/pages/:slug/grants`)
- ✅ **内容版本化**:链接不变随迭代更新,历史与回滚,含合集整组替换
- ✅ **保存收到的稿**:读者登录后可把稿留在自己的 Console 里(引用型,不是拷副本)
- ✅ **密码网关**:边缘验证 + 签名 Cookie(24h 免重输),防暴力破解(10 次锁 15 分钟)
- ✅ **滥用防线**:频率限制(小时+日)、体积上限、钓鱼特征拦截、全局日配额熔断
- ✅ **OpenAPI + 第一方边缘埋点**;CI/CD(见下)

```
hspace/
├── backend/            Cloudflare Worker(Publish API + 子域分发 + 密码网关 + 落地页)
│   ├── src/
│   │   ├── index.ts    路由 / API / 页面服务 / 限制策略
│   │   ├── render.ts   Markdown → 阅读页 HTML(标题锚点 + TOC 数据)
│   │   ├── sanitize.ts 用户 md 里原始 HTML 的白名单净化 + URL 协议闸门
│   │   ├── headers.ts  响应头两档:第一方外壳走严格 CSP,HTML 稿保「原样能跑」
│   │   ├── html.ts     密码页 / 阅读页 / 目录页 / 悬浮导航 / 404 模板
│   │   ├── crypto.ts   slug、密码哈希(PBKDF2)、Cookie 与令牌签名(HMAC)
│   │   ├── auth.ts     GitHub OAuth 登录会话
│   │   ├── console.ts  发布者 Console(页面管理 + 收藏)
│   │   ├── landing.ts  落地页(中英双语,自包含内联)
│   │   ├── pages.ts    隐私 / 条款 / 举报页
│   │   └── openapi.ts  OpenAPI 3 规范
│   ├── schema.sql      D1 建表
│   └── wrangler.toml   R2 / D1 / KV 绑定、域名与各项阈值
├── vscode-extension/   VS Code 插件(命令 / 最近发布视图 / 配置)
├── mcp-server/         MCP server + `hspace` CLI(同一个 npm 包,两个 bin)
├── clients/            Claude Code 插件(/share 命令 + 自带 MCP 配置)
├── docs/               定位(对外文案权威)、商业假设、设计与运营文档
├── assets/             品牌资源(appicon / favicon / lockup / OG 卡)
└── .github/workflows/  CI(后端部署 / 插件发布 / npm 发布)
```

架构要点:**内容用通配子域隔离**(`<slug>.zhanjian.space`,与 API 域分离),**元数据存 D1**(列表、访问计数、访问人、版本),**Markdown/HTML 存 R2**,**限流计数存 KV**,密码走**边缘网关 + 签名 Cookie**,全链路无服务器。

**CI/CD** 三条流水线:`backend/**` 推 main 自动部署 Worker · 打 `v*` tag 发 VS Code Marketplace + Open VSX · 打 `mcp-v*` tag 发 npm(MCP server 与 CLI 同包同版本)。

八项路线图(md 分享 / 合集 / MCP / OpenAPI / 密码页 / 回执 / 每人一链 / 版本化)已全部上线,过程留痕见 [decisions-log](docs/decisions-log.md)。

**明确不做**:多文件站点托管、构建流水线、公开画廊、SEO、广告与数据变现。

## 部署自己的实例

前置:Cloudflare 账号 + 一个托管在 Cloudflare 的域名(用于内容通配子域)。

```bash
cd backend
npm install

# 1) 创建资源
npx wrangler r2 bucket create html-share-pages
npx wrangler d1 create html-share            # database_id 填进 wrangler.toml
npx wrangler kv namespace create RATELIMIT   # id 填进 wrangler.toml

# 2) 初始化表
npx wrangler d1 execute html-share --remote --file=./schema.sql

# 3) Cookie 签名密钥(随机长字符串)
npx wrangler secret put COOKIE_SIGNING_SECRET

# 4) 改 wrangler.toml:routes 通配域、USERCONTENT_DOMAIN、各资源 id、各项阈值

# 5) 本地跑 or 部署
npm run dev        # 本地:API=http://localhost:8787,页面=http://localhost:8787/p/<slug>
npm run deploy
```

DNS:给内容域加一条通配记录(`*` → 任意 IP,开启代理橙色云),Worker 路由会接管。API 可直接用 workers.dev 地址。

CI:仓库 secret 配 `CLOUDFLARE_API_TOKEN` 后,`backend/**` 推 main 自动部署。

自建就是完整能力,没有版本分层。插件、MCP 与 CLI 都可以指向你自己的地址(`hspace.apiBaseUrl` / `HSPACE_API_BASE`)。

### 快速自测

```bash
# 发布(带密码——客户端一律自动生成,API 层 password 可选)
curl -X POST http://localhost:8787/publish \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# 标题\n\n正文……","password":"1234","filename":"note.md"}'
# → {"slug":"ab12cd7","url":"https://ab12cd7.<内容域>","editToken":"..."}

# 访问(dev 路由;首次会看到密码页)
curl -i http://localhost:8787/p/ab12cd7

# 也可以直接用 CLI 打本地后端(loopback 允许 http;其他地址一律要求 https)
HSPACE_API_BASE=http://localhost:8787 npx --package=hspace-mcp hspace publish note.md
```

## 开发

```bash
# 后端:类型检查 + 单元测试(在仓库根目录执行)
(cd backend && npm install && npx tsc --noEmit && npm test)
# VS Code 插件:编译后在 VS Code 里按 F5 启动「扩展开发宿主」
(cd vscode-extension && npm install && npm run compile)
# MCP + CLI
(cd mcp-server && npm install && npm test && npm run build)
node mcp-server/dist/cli.js --help
```

发版:插件 = 改 `vscode-extension/package.json` 版本 → 打 `v<版本>` tag;MCP + CLI = 改 `mcp-server/package.json` 版本 → 打 `mcp-v<版本>` tag。自建后端时把插件设置 `hspace.apiBaseUrl` 指向你的 API。

## API 契约

机器可读的 **OpenAPI 3 规范**在 [`/openapi.json`](https://html-share.kzhan.workers.dev/openapi.json)(`servers.url` 按访问 origin 自动填充,自建实例同样适用)。可直接喂给 GPT Actions、agent 框架或函数调用。

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/publish` | 发布(`html` / `markdown` / `files` 三选一),返回 `url`/`slug`/`editToken` | 可选 Bearer |
| PATCH | `/pages/:slug` | 更新内容(升一版)/ 改密码 / 续期 | Bearer 或 `X-Edit-Token` |
| DELETE | `/pages/:slug` | 删除(链接立即失效) | Bearer 或 `X-Edit-Token` |
| GET | `/pages/:slug/stats` | 访问回执 | Bearer 或 `X-Edit-Token` |
| GET · POST | `/pages/:slug/versions` · `…/versions/:v/restore` | 版本历史 / 回滚 | Bearer |
| POST · GET | `/pages/:slug/grants` | 新增 / 列出访问人(密码只在创建时返回一次) | Bearer |
| DELETE | `/pages/:slug/grants/:id` | 撤销某个访问人(即时生效) | Bearer |
| GET | `/pages` | 列出本账户页面 | Bearer |

匿名与登录的差异(私密性与滥用防线,阈值见 `backend/wrangler.toml`)。匿名刻意收得很轻,让重度/认真使用有理由登录(登录免费);唯一始终顺滑的是「零注册 ~30 秒发一稿」。

| 能力 | 匿名 | 登录(API Key) |
|---|---|---|
| 体积上限 | 512 KB | 2 MB(合集总体积 5 MB) |
| 有效期 | 最长 7 天(一次性、不可续) | 最长 30 天/期(可续期) |
| 续期 | ❌ | ✅ |
| 每人一链 | ❌ | ✅ |
| 版本历史 / 回滚 | ❌ | ✅ |
| 更新内容(覆盖) | ✅ | ✅ |
| 移除密码 | ❌ | ✅ |
| 合集篇数 | 5 篇 | 50 篇 |
| 频率 | 20/时 且 50/天 | 20/时 |
| 单页访问量 | 1 万次封顶 | 不限 |

**所有链接都会过期,没有永久链接**——到期前可续期,弃置即自动清场。「稿」是给人读的,不是要长期挂着的站点。

## 法务与运营

- 隐私政策 `/privacy`、服务条款 `/terms`、举报入口 `/report`(落地页/API 域均可访问)。
- 举报写入 D1 `reports` 表;处理与下架命令见 [运营手册](docs/operations.md)。下架 = 把 `pages.status` 置为 `blocked`,页面立即 404。

## 安全注意

- **用户 md 里的原始 HTML 一律净化**:白名单过滤([`backend/src/sanitize.ts`](backend/src/sanitize.ts))——`<script>`、`<iframe>`、事件处理属性、`javascript:` 链接都到不了读者眼前。
- **md 阅读页上的是真 CSP**([`backend/src/headers.ts`](backend/src/headers.ts)):`default-src 'none'`、`script-src 'nonce-…'`、`connect-src 'none'`。两处刻意的例外,如实说明:**你 md 里写的外链图片仍会照常加载**(那台图片主机因此能看到读者的 IP/UA);**HTML 稿另走一档**,保「原样能跑」。
- `isSuspicious` / `isPhishy` 为规则式扫描(混淆执行、密码输入框、外部表单),上量前应接入专业扫描。
- 密码用 PBKDF2 派生(Workers 原生)、只存哈希;内容经 HTTPS 传输、**明文存在 R2**(不做静态加密)。

举报邮箱 `mengmajiang@gmail.com`;举报入库后需人工到 `reports` 表处理(见运营手册)。

## License

MIT
