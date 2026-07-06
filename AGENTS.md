# AGENTS.md — HSpace

Agent 上手指南。人类读者见 [README](README.md);对外文案的唯一事实来源是 [docs/positioning.md](docs/positioning.md)。

## 是什么

HSpace = **给 AI 编程开发者的定向分享**:把 AI 写的 HTML/Markdown「稿」一键发布成`链接 + 密码`,只给该看的人;有访问回执、可撤回、可迭代(链接不变)。
Slogan:中「稿出即递,点开即读,心里有数。」/ 英「Ship to one, not to all.」

**这不是 greenfield——已上线运行**:
- 落地页 https://hspace.zhanjian.space(英文默认,`?lang=zh` 中文)
- API / OpenAPI https://html-share.kzhan.workers.dev/openapi.json
- 内容页 `<slug>.zhanjian.space`;插件已上架 Marketplace/Open VSX(`agentx1boss.hspace`)

## 仓库结构

```
backend/           Cloudflare Worker(TS):发布 API + 子域服务 + 密码门 + 落地/法务/埋点
vscode-extension/  VS Code / Cursor 插件(TS)
mcp-server/        MCP server(在 AI 对话里发布)
clients/           Claude Code 插件(/share + 自带 MCP 配置;根 .claude-plugin/marketplace.json 使本仓库即 marketplace)
docs/              见 docs/README.md;positioning.md 是文案权威
assets/            品牌资源 + promo/(推广册子源文件:中 q0i7otn / 英 aqm3anv)
.github/workflows/ CI(见下)
```
后端一个 Worker 同时承载 API、内容子域、`hspace.` 落地页、`/privacy|/terms|/report`、`/e` 埋点、`/openapi.json`。存储:内容在 R2、元数据/版本/访问人/举报/埋点在 D1、限流在 KV。

## 常用命令

```bash
# 后端(cd backend)
npx tsc --noEmit          # 类型检查(改完必跑)
npx wrangler deploy       # 部署(或推 backend/** 到 main 自动部署)
# 插件(cd vscode-extension)
npm run compile && npx @vscode/vsce package
# 发版 = 改 package.json version → git tag v<x> → push tag(CI 自动发双市场)
# MCP(cd mcp-server):npm run build
# MCP 发布 = 改 mcp-server/package.json version → git tag mcp-v<x> → push tag(CI 自动发 npm;需 secret NPM_TOKEN)
# Claude Code 插件发版 = 改 clients/claude-code/.claude-plugin/plugin.json version → 推 main(版本 pin,无 tag/registry;改前跑 claude plugin validate)
```

## CI/CD

- `backend/**` 推 main → **Deploy Backend**(tsc + wrangler deploy + /health 冒烟)
- 打 `v*` tag → **Release Extension**(打包 + Marketplace + Open VSX + GitHub Release)
- 打 `mcp-v*` tag → **Release MCP**(校验版本 + build + npm publish;需 secret `NPM_TOKEN`)
- 改完务必确认 CI 绿灯(`gh run watch`)。

## 约定与红线

- **自包含页面**:落地页/密码页/阅读页/注入组件一律内联 CSS/JS/SVG,**不引外部脚本/字体/图片**(CSP 安全、加载快、隐私)。
- **文案**:一律取自 positioning.md——用「定向分享」不用「私域分发」;托管物营销叫「稿/Draft」、技术/API 用 `page`;卖结果不卖手段;英文为主(全球开发者画像)。改定位 = 改 positioning.md。
- **不做**:多文件站点托管、构建、公开画廊、广告/数据变现(边界承诺,见 positioning §8)。
- **Cloudflare 资源名保留 `html-share`**(bucket/D1/worker);品牌名是 HSpace,勿改资源名。
- **内容明文存 R2**——文案禁止暗示"加密存储"(只可说 HTTPS 传输 / 密码哈希)。
- **没有永久链接**(产品级不变量):所有链接都有有效期,匿名 3 天(一次性、不可续)/ 登录 30 天/期,到期前可续、弃置即自动过期。API 与插件都产生不了永久页;`expiresIn:null` 只当"续到档内上限"。唯一例外是**第一方置顶内容**(promo 册子/落地演示),靠直接改库 `expires_at=NULL` 手动置顶,不是产品能力。改动别退回"永久"叙事(见 positioning §8)。
- **别公开展示 HSpace 自己的 Free/Pro/Team 价格**——那是未实施的纸面假设(business-model-hypothesis.md);promo demo 用虚构示例定价。

## 密钥与凭据

- `.env`(gitignored,勿提交):`CLOUDFLARE_API_TOKEN`(CI secret 同名)、`VSCODE_KEY`/`OPENVSX_KEY`(发版)、`HSPACE_API_KEY`(founder 账户,发/维护 promo 册子用;册子是第一方置顶内容,靠直接改库 `expires_at=NULL` 保持常驻,见 operations.md)。
- 举报/联系邮箱:mengmajiang@gmail.com。

## Gotchas

- slug 用小写 base36(子域大小写不敏感);内容对象后缀即类型(`.md`/`.html`/`/index.json`=合集);vN 版本写带版本 key。
- 匿名 vs 登录能力差异、各阈值在 `backend/wrangler.toml`。
- 落地页「Try it yourself」demo 现指向 **`omcenj1`**(全栈教程合集,双语交互 HTML + 中/英深度教程,密码 1024;源在 `docs/tutorial-build-hspace.*`,founder key 发布 + 直接改库置顶)。中英 `trySlug` 都指向它。早期 promo 册子 q0i7otn / aqm3anv(密码 1024)**仍置顶留存但落地页已不再引用**,作营销物料源(改文案走 PATCH,见 assets/promo/README.md 与 docs/operations.md)。
- 「册子」是被允许的叙事比喻(≠ 术语"合集");不要机械替换。
- 运营(举报处理/下架/埋点查询)见 docs/operations.md;下架 = `pages.status='blocked'`。
