# HSpace —— MVP 实现

一键把 HTML 文件发布成可分享的公网链接，支持共享密码。面向"分享 AI 生成的单页 HTML"场景。

```
html-share/
├── backend/            Cloudflare Worker（Publish API + 子域托管 + 密码网关）
│   ├── src/
│   │   ├── index.ts    路由 / API / 页面服务
│   │   ├── crypto.ts   slug、密码哈希(PBKDF2)、Cookie 签名(HMAC)
│   │   └── html.ts     密码页 / 404 模板
│   ├── schema.sql      D1 建表
│   └── wrangler.toml   R2 / D1 / KV 绑定与域名
└── vscode-extension/   VS Code 插件
    ├── src/
    │   ├── extension.ts 命令 / 最近发布 TreeView
    │   └── api.ts       后端客户端
    └── package.json     贡献点（命令 / 菜单 / 配置 / 视图）
```

设计要点（已按讨论定稿）：**用户内容用子域隔离**（`<slug>.usercontent-host.com`），**元数据存 D1**（便于列表与访问计数），密码走**边缘网关 + 签名 Cookie**。

---

## 一、部署后端

前置：Cloudflare 账号 + 一个域名（示例用 `myhost.com` / `usercontent-host.com`，可用同一主域的两个子域）。

```bash
cd backend
npm install

# 1) 创建资源
npx wrangler r2 bucket create html-share-pages
npx wrangler d1 create html-share            # 把输出的 database_id 填进 wrangler.toml
npx wrangler kv namespace create RATELIMIT   # 把输出的 id 填进 wrangler.toml

# 2) 初始化表
npm run db:init

# 3) 设置 Cookie 签名密钥（随机长字符串）
npx wrangler secret put COOKIE_SIGNING_SECRET

# 4) 改 wrangler.toml：API_DOMAIN / USERCONTENT_DOMAIN / routes / database_id / kv id

# 5) 本地跑 or 部署
npm run dev        # 本地：API=http://localhost:8787，页面=http://localhost:8787/p/<slug>
npm run deploy
```

DNS：把 `api.myhost.com` 和通配 `*.usercontent-host.com` 都解析到 Worker（用自定义域/路由）。通配子域需要该 zone 在 Cloudflare 上。

### 快速自测

```bash
# 匿名发布
curl -X POST http://localhost:8787/publish \
  -H 'Content-Type: application/json' \
  -d '{"html":"<h1>hello</h1>","filename":"demo.html"}'
# → {"slug":"ab12cd7","url":"https://ab12cd7.usercontent-host.com","editToken":"..."}

# 访问（dev 路由）
curl http://localhost:8787/p/ab12cd7

# 带密码发布
curl -X POST http://localhost:8787/publish \
  -H 'Content-Type: application/json' \
  -d '{"html":"<h1>secret</h1>","password":"1234"}'
```

---

## 二、运行 VS Code 插件

```bash
cd vscode-extension
npm install
npm run compile
# 在 VS Code 打开该文件夹，按 F5 启动“扩展开发宿主”
```

在宿主窗口里：

1. 设置后端地址：命令面板 →「Preferences: Open Settings」搜 `hspace.apiBaseUrl`，填你的 API 地址（本地填 `http://localhost:8787`）
2. 打开任意 `.html` 文件 → 右上角 ☁ 按钮 / 右键「发布当前 HTML」
3. 链接自动复制，可在「资源管理器 → HSpace · 最近发布」里管理（打开 / 复制 / 设密码 / 删除）
4. （可选）命令「设置 API Key」登录以获得永久链接

打包：`npx @vscode/vsce package` 生成 `.vsix`；上架 VS Code Marketplace，并用 `ovsx publish` 上架 Open VSX（供 Cursor / VSCodium）。

---

## 三、API 契约

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/publish` | 发布，返回 `url`/`slug`/`editToken` | 可选 Bearer |
| PATCH | `/pages/:slug` | 改密码 / 覆盖内容 / 改过期 | Bearer 或 `X-Edit-Token` |
| DELETE | `/pages/:slug` | 删除 | Bearer 或 `X-Edit-Token` |
| GET | `/pages` | 列出本账户页面 | Bearer |

匿名发布返回的 `editToken` 是后续改/删的凭据，插件已存在本地。

---

## 四、MVP 边界与后续

已实现：匿名发布、共享密码（边缘网关）、过期、访问计数、大小/频率限制、基础内容扫描、内容隔离域名 + 安全响应头、编辑器发布与管理。

尚未做（留待后续里程碑）：多文件/zip、名单/邮箱授权、访问分析看板、自定义域名、注册与 Stripe、专业内容审核、MCP/ChatGPT 入口。

安全注意：`isSuspicious` 仅为占位规则；上线前应接入正式的钓鱼/恶意扫描，并完善举报下架流程。密码派生用 PBKDF2（Workers 原生），如需更强可后续换 argon2（需 WASM）。
