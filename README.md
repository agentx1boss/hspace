# HSpace

**落地页:https://hspace.zhanjian.space** · **API/OpenAPI:https://html-share.kzhan.workers.dev/openapi.json**

**私密分享 AI 生成的内容。** 一键把 AI 帮你写好的 HTML 或 Markdown 发布成"链接 + 密码",像递名片一样只交给该看的人。

## 这不是又一个 HTML 托管

常规托管(tiiny.host / Netlify Drop / Pages)全部围绕**公开链接**竞争:上传、拿 URL、发到全世界。HSpace 反着来:

- **默认私密,而非默认公开。** 每次发布自动生成随机密码,链接和密码一起进剪贴板;没有密码,谁也看不到。不被搜索引擎索引,不怕被转发扩散——链接是你可控的资产,发错了随时撤回。
- **内容为主,而非站点为主。** 我们分发的是"一份内容"——AI 生成的 demo、报告、方案、可视化——而不是"一个网站"。所以没有多文件、没有构建、没有 CDN 配置,只有"发出去"这一个动作。
- **为 AI 产物而生。** 内容诞生在与 AI 的对话里,分享也应该无缝衔接:编辑器一键发布是现在,对话内直接发布(MCP)是下一步。

一句话:**别人做"发布到公网",HSpace 做"私域分发"。**

## 现状(MVP 已上线)

- ✅ VS Code / Cursor 插件:一键发布 `.html` / `.md`,自动生成 4 位密码,链接+密码复制即走
- ✅ 文档合集:右键文件夹/多选文件 → 一批 md/html 打包成一个链接+密码+目录页,篇间导航
- ✅ MCP server:在 Claude / Cursor 对话里直接发布(单篇 + 合集),内容诞生处即分享处
- ✅ 访问回执:面板刷新即可看到每个链接的累计访问量(`GET /pages/:slug/stats`)
- ✅ 每人一链:同一链接给每人独立密码,按人统计,单独撤销不影响他人(`/pages/:slug/grants`)
- ✅ 密码网关:边缘验证 + 签名 Cookie(24h 免重输),防暴力破解(10 次锁 15 分钟)
- ✅ 页面管理:最近发布面板(打开 / 复制 / 改密码 / 删除),匿名也可管理(editToken)
- ✅ 私密性约束:匿名页面不可移除密码、不可替换内容、最长 7 天过期、访问量封顶
- ✅ 滥用防线:频率限制(小时+日)、体积上限、钓鱼特征拦截、全局日配额熔断
- ✅ CI/CD:后端推 main 自动部署,插件打 tag 自动上架双市场

```
hspace/
├── backend/            Cloudflare Worker(Publish API + 子域分发 + 密码网关)
│   ├── src/
│   │   ├── index.ts    路由 / API / 页面服务 / 限制策略
│   │   ├── crypto.ts   slug、密码哈希(PBKDF2)、Cookie 签名(HMAC)
│   │   └── html.ts     密码页 / 锁定页 / 404 模板
│   ├── schema.sql      D1 建表
│   └── wrangler.toml   R2 / D1 / KV 绑定、域名与限制阈值
├── vscode-extension/   VS Code 插件(命令 / 最近发布视图 / 配置)
├── mcp-server/         MCP server(在 AI 对话里直接发布,单篇 + 合集)
├── docs/               设计文档
├── assets/             品牌资源(appicon / favicon / lockup / OG 卡)
└── .github/workflows/  CI(后端部署 / 插件发布)
```

架构要点:**内容用通配子域隔离**(`<slug>.zhanjian.space`,与 API 域分离),**元数据存 D1**(列表与访问计数),**HTML 存 R2**,**限流计数存 KV**,密码走**边缘网关 + 签名 Cookie**,全链路无服务器。

## 路线图(按"私域分发"定位排序)

1. ~~**Markdown 分享 + 阅读模板**~~ ✅ 已上线:md 原文存储、边缘渲染、亮暗双主题阅读页
2. ~~**文档合集**~~ ✅ v0.2.0 上线:一批 md/html 打包成一个链接+密码+目录页,深链保留、篇间导航([设计文档](docs/design-collections.md))
3. ~~**MCP server**~~ ✅ 已上线:`publish` / `publish_collection` 两个工具,单篇与合集通用([mcp-server/](mcp-server/))
4. **密码页精装修** —— 接收方唯一看到的品牌触点,值得体面
5. ~~**访问回执**~~ ✅ 已上线:面板显示累计访问量;后续可按人归因(依赖每人一链)
6. ~~**每人一链 / 多口令 + 撤回**~~ ✅ v0.3.0:每人独立密码、按人统计、单独撤销([设计文档](docs/design-per-recipient.md))
7. **内容版本化** —— 链接不变,内容随迭代更新(含合集篇目增删改)

明确不做:多文件站点托管、构建流水线、公开画廊、SEO。

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

# 4) 改 wrangler.toml:routes 通配域、USERCONTENT_DOMAIN、各资源 id、限制阈值

# 5) 本地跑 or 部署
npm run dev        # 本地:API=http://localhost:8787,页面=http://localhost:8787/p/<slug>
npm run deploy
```

DNS:给内容域加一条通配记录(`*` → 任意 IP,开启代理橙色云),Worker 路由会接管。API 可直接用 workers.dev 地址。

CI:仓库 secret 配 `CLOUDFLARE_API_TOKEN` 后,`backend/**` 推 main 自动部署。

### 快速自测

```bash
# 发布(带密码——产品语义上密码由客户端生成,API 层 password 可选)
curl -X POST http://localhost:8787/publish \
  -H 'Content-Type: application/json' \
  -d '{"html":"<h1>hello</h1>","password":"1234","filename":"demo.html"}'
# → {"slug":"ab12cd7","url":"https://ab12cd7.<内容域>","editToken":"..."}

# 访问(dev 路由)
curl http://localhost:8787/p/ab12cd7

# Markdown:发布后访问即渲染成阅读页
curl -X POST http://localhost:8787/publish \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# 标题\n\n正文……","password":"1234","filename":"note.md"}'
```

## 运行 / 开发 VS Code 插件

```bash
cd vscode-extension
npm install && npm run compile
# VS Code 打开该文件夹,F5 启动"扩展开发宿主"
```

自建后端时把设置 `hspace.apiBaseUrl` 指向你的 API 地址。发版:改 `package.json` 版本 → 打 `v<版本>` tag 推送,CI 自动发布 VS Code Marketplace + Open VSX。

## API 契约

机器可读的 **OpenAPI 3 规范**在 [`/openapi.json`](https://html-share.kzhan.workers.dev/openapi.json)(`servers.url` 按访问 origin 自动填充,自建实例同样适用)。可直接喂给 GPT Actions、agent 框架或函数调用。


| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/publish` | 发布(`html` 或 `markdown` 二选一),返回 `url`/`slug`/`editToken` | 可选 Bearer |
| PATCH | `/pages/:slug` | 改密码 / 改过期;覆盖内容仅限登录 | Bearer 或 `X-Edit-Token` |
| DELETE | `/pages/:slug` | 删除(立即失效) | Bearer 或 `X-Edit-Token` |
| GET | `/pages` | 列出本账户页面 | Bearer |

匿名与登录的差异(私密性与滥用防线,阈值见 `wrangler.toml`):

| 能力 | 匿名 | 登录(API Key) |
|---|---|---|
| 体积上限 | 1 MB | 2 MB |
| 有效期 | 最长 7 天 | 可永久 |
| 移除密码 | ❌ | ✅ |
| 覆盖内容 | ❌ | ✅ |
| 频率 | 20/时 且 50/天 | 20/时 |
| 单页访问量 | 1 万次封顶 | 不限 |

## 安全注意

`isSuspicious` / `isPhishy` 为规则式扫描(混淆执行、密码输入框、外部表单),上量前应接入专业扫描并建立举报下架流程。密码派生用 PBKDF2(Workers 原生),如需更强可换 argon2(WASM)。

## License

MIT
