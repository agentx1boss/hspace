# 从零到上线:用 Cloudflare 边缘搭一个「AI 内容定向分享」工具(HSpace 全栈教程)

> **详细手把手**构建版。给出关键处的真实代码(边缘密码门、Cookie、边缘 Markdown 渲染)、数据模型、本地开发闭环,以及每一步账号/DNS/密钥——足以克隆仓库、搭起自己的实例。
>
> *(只想要一页速览?看本合集里的交互式「构建速览」HTML。这一篇是深度版。)*
>
> - **源码(克隆它):** <https://github.com/agentx1boss/hspace>(MIT)
> - **在线体验:** <https://hspace.zhanjian.space>
> - **前置:** Node ≥ 18、一个 Cloudflare 账号且名下有域名、一个 GitHub 账号。约一个下午。

**术语速查:** slug = 页面短随机 id;边缘 = 离用户最近的计算节点;TTL = 有效期;grant = 每个接收者各自的密码记录;PBKDF2/HMAC = 密码哈希/Cookie 签名(Web Crypto)。

## 0. 它是什么,以及几条不变量

**HSpace = 给 AI 编程开发者的「定向分享」**:把 AI 写好的 HTML/Markdown 一键变成「链接 + 密码」,只发给该看的人;有回执、可撤回、可迭代。定位:**Ship to one, not to all.**

四条不变量贯穿全文:

- **强制密码**是产品身份——不做公开画廊。
- **没有永久链接**:所有链接都会过期(匿名 3 天、登录 30 天/期可续)。例外:第一方置顶内容(直接改库 `expires_at=NULL`,运营动作,非产品能力)。
- **内容页 `noindex` + 密码门**——唯一可被索引的只有落地页。
- **自包含页面**:全内联 CSS/JS/SVG,零外部资源。

## 1. 架构:一个 Worker,按域名分流

整个后端就是一个 Cloudflare Worker,全部分发就是「请求打到哪个 host」——真实骨架([`backend/src/index.ts`](https://github.com/agentx1boss/hspace/blob/main/backend/src/index.ts)):

```ts
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;

    if (url.pathname === "/e") return recordEvent(url, env, ctx);   // 第一方埋点

    // 落地 host:hspace.<域> —— 落地页/法务/console/OAuth/openapi…
    if (host === "hspace." + env.USERCONTENT_DOMAIN) {
      const auth = await handleAuth(url, request, env);             // /auth/github*
      if (auth) return auth;
      if (url.pathname === "/console") return serveConsole(url, request, env);
      if (url.pathname === "/robots.txt") return robotsResp(true, env);
      // …品牌资源、/privacy、/terms、"/"、/openapi.json → 否则 handleApi()
    }

    // 内容 host:<slug>.<域> → 提供页面(过密码门)
    if (host.endsWith("." + env.USERCONTENT_DOMAIN)) {
      const slug = host.slice(0, host.length - env.USERCONTENT_DOMAIN.length - 1);
      return servePage(slug, url.pathname, request, env, ctx);
    }

    // 本地开发便利:/p/<slug> 无需通配 host 也能看页面(见 §6)
    if (url.pathname.startsWith("/p/")) { /* … */ }

    return handleApi(url, request, env, ctx);                        // API host
  },
};
```

一套代码同时是内容站、落地页、API,靠 `host` 选择。通配子域 `*.<域>` 让每篇分享都是独立的 `<slug>.<域>`,无需逐篇建记录。

## 2. 数据模型(D1)

七张表([完整建表](https://github.com/agentx1boss/hspace/blob/main/backend/schema.sql))。最关键的两张:

```sql
CREATE TABLE pages (
  slug          TEXT PRIMARY KEY,     -- 子域 id
  owner_id      TEXT,                 -- 登录为 'gh:<id>';匿名为 NULL
  edit_token_hash TEXT,               -- 匿名编辑/删除凭据(哈希)
  object_key    TEXT NOT NULL,        -- 内容在 R2 的位置
  password_hash TEXT, password_salt TEXT,   -- PBKDF2(base64);NULL=无密码
  created_at INTEGER, expires_at INTEGER,   -- epoch 秒;expires_at NULL=置顶(仅第一方)
  size_bytes INTEGER, hits INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',        -- active | deleted | blocked
  version INTEGER DEFAULT 1, updated_at INTEGER
);

CREATE TABLE grants (                  -- 「每人一链」
  id TEXT PRIMARY KEY, slug TEXT NOT NULL,
  label TEXT,                          -- 如「张三」
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
  created_at INTEGER, revoked INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0, last_seen_at INTEGER   -- 按人计的回执
);
```

其余:`versions`(每次更新一行,`object_key` → 该版内容)、`api_keys`(`key_hash` = key 的 SHA-256)、`users`(`owner_id='gh:<id>'`)、`metrics`(无 Cookie 落地埋点)、`reports`(举报)。**没有 `receipts` 表**——「回执」就是 `pages.hits` 与每人 `grants.hits`/`last_seen_at`。

**R2 key 规则**(后缀即类型):`pages/<slug>.md`、`pages/<slug>.html`,合集是 `pages/<slug>/index.json`,版本是 `pages/<slug>.vN.<ext>`。内容**明文存**——安全模型是 HTTPS 传输 + 密码哈希,绝不叫「加密存储」。

## 3. 边缘密码门(真实代码)

核心。接收方访问 `<slug>.<域>`:

**1)密码用 PBKDF2 派生,从不存明文**([`backend/src/crypto.ts`](https://github.com/agentx1boss/hspace/blob/main/backend/src/crypto.ts)):

```ts
// hashPassword:10 万次迭代,SHA-256,256 位 → base64 {hash, salt}
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
  keyMaterial, 256,
);
// 校验用常量时间比较(timingSafeEqual),避免时序泄漏
```

**2)通过后下发 HMAC 签名 Cookie,并 303 回到原路径:**

```ts
// Cookie 值 = "<slug>.<grantId>.<exp>.<sig>"   (grantId="" 表示共享密码)
// sig = HMAC-SHA256( "<slug>.<grantId>.<exp>", COOKIE_SIGNING_SECRET )
export async function signCookie(secret, slug, grantId, expEpoch) {
  const payload = `${slug}.${grantId}.${expEpoch}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${bufToB64(sig)}`;
}
```

`verifyCookie` 重新推导 HMAC 并校验:签名有效 **且** 未过期 **且** slug 匹配。返回的 `grantId` 就是「每人一链」回执的归因依据(空串=页面共享密码)。旧的三段格式 `<slug>.<exp>.<sig>` 仍兼容。

**为什么这么选:**
- **小写 base36 slug** —— 子域名 DNS 不区分大小写,混合大小写的 base62 会撞车;用 `crypto.getRandomValues` 在 `0-9a-z` 上取。
- **303(而非 302)回原路径** —— 深链(合集第 N 篇)过门后直达,且重发是干净的 GET。
- **grantId 进签名负载** —— 转发的 Cookie 无法改指到别的接收者;撤销某个 grant 只让那一个人失效。

**生命周期,用 curl 看:**

```bash
# 1. 首访无 Cookie → 401 密码页
curl -i https://<slug>.<域>/                 # HTTP/1.1 401

# 2. 提交密码 → 303 + Set-Cookie,重定向回原路径
curl -i -X POST -d 'password=1234' https://<slug>.<域>/
# HTTP/1.1 303 … Set-Cookie: hs_<slug>=<slug>...<sig>; …  Location: /

# 3. 带 Cookie → 渲染好的页面(200)
curl -i -b 'hs_<slug>=<slug>...<sig>' https://<slug>.<域>/
```

门周围的防滥用:暴力破解锁定(KV,15 分钟内错 10 次锁),外加 §5 的发布侧闸门。

## 4. Markdown 边缘渲染

MD 原文存 R2,读取时用 `marked` 渲染——无构建步骤,改模板对已发布内容即时生效:

```ts
import { marked } from "marked";
const article = await marked.parse(md, { gfm: true, async: true });
return htmlResp(readingPage(mdTitle(md, page.filename), article, nav, updatedAt), 200);
```

`mdTitle` 取首个 `#` 标题作页面标题。`readingPage` 是自包含模板(内联 CSS、`prefers-color-scheme` 亮暗、CJK 字体栈)。HTML 页面原样服务;合集里的 HTML 篇会被注入一个悬浮「← 目录」按钮。

## 5. 防滥用闸门(附真实阈值)

都在 `wrangler.toml [vars]` 里调;匿名刻意收紧以鼓励登录:

| 闸门 | 变量 | 默认 | 位置 |
|---|---|---|---|
| 每 IP 每小时发布 | `RATE_LIMIT_PER_HOUR` | 20 | KV 计数 |
| 每 IP 每天发布(匿名) | `RATE_LIMIT_PER_DAY` | 50 | KV 计数 |
| 单文件体积(匿名/登录) | `ANON_MAX_SIZE_BYTES`/`MAX_SIZE_BYTES` | 512 KB / 2 MB | 发布 |
| 合集篇数(匿名/登录) | `ANON_MAX_DOCS`/`MAX_DOCS` | 3 / 50 | 发布 |
| 单页访问量上限(匿名) | `ANON_MAX_HITS` | 10000 | 服务 |
| 全局匿名日流量熔断 | `ANON_DAILY_GLOBAL_BYTES` | 500 MB | 发布 |
| 匿名 TTL 钳制 | `ANON_DEFAULT_TTL` | 3 天 | 发布 |
| 暴力破解锁定 | — | 15 分钟错 10 次 | 门(KV) |

外加发布时的内容扫描(钓鱼/恶意特征正则)。

## 6. ⭐ 从零搭起——逐步

### 步骤 0 — 克隆 & 安装

```bash
git clone https://github.com/agentx1boss/hspace
cd hspace/backend && npm install
npm i -g wrangler && wrangler login      # 打开浏览器授权
```

### 步骤 1 — 建资源 + 建表

```bash
wrangler r2 bucket create <bucket-name>
wrangler d1 create <db-name>
# → 打印一段 [[d1_databases]];复制其中的 database_id
wrangler kv namespace create RATELIMIT
# → 打印 { binding = "RATELIMIT", id = "…" };复制 id
wrangler d1 execute <db-name> --file=./schema.sql   # 建好 7 张表
```

### 步骤 2 — 填 `wrangler.toml`

绑定名(`BUCKET`/`DB`/`RATELIMIT`)固定——Worker 按名读;只改资源名/id 和域名。

```toml
name = "html-share"
main = "src/index.ts"
compatibility_date = "2024-11-01"
account_id = "<你的-account-id>"
workers_dev = true
routes = [{ pattern = "*.<你的域名>/*", zone_name = "<你的域名>" }]

[vars]
USERCONTENT_DOMAIN = "<你的域名>"
ANON_DEFAULT_TTL = "259200"     # 3 天
OWNER_MAX_TTL   = "2592000"     # 30 天
# …§5 的体积/频率/限额变量(完整文件见仓库)

[[r2_buckets]]     { binding = "BUCKET", bucket_name = "<bucket-name>" }
[[d1_databases]]   { binding = "DB", database_name = "<db-name>", database_id = "<database_id>" }
[[kv_namespaces]]  { binding = "RATELIMIT", id = "<kv-id>" }
```

*(这里 `[[...]]` 写成了紧凑一行;真实 TOML 里每个是多行表——见仓库 `wrangler.toml`。)*

### 步骤 3 — DNS + 路由(最易卡步骤——两者都要)

1. **被代理的通配 DNS 记录**,让主机名解析到 Cloudflare 边缘。面板 → DNS → 加 `AAAA`:名称 `*`、内容 `100::`(丢弃地址)、**代理状态 = 已代理(橙云)**。给 `hspace` 落地子域再加一条被代理记录。
2. **Workers 路由** —— 步骤 2 的 `routes` 把 `*.<域>/*` 绑到本 Worker。(DNS 让请求落到 Cloudflare,路由才绑定 Worker;你不会把 DNS 直接「指向 Worker」。)

### 步骤 4 — 密钥 & GitHub OAuth(绝不写进 toml)

```bash
wrangler secret put COOKIE_SIGNING_SECRET   # 随机长串(密码 Cookie 的 HMAC)
wrangler secret put SESSION_SECRET          # 随机长串(登录会话 HMAC)
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

在 **GitHub → Settings → Developer settings → OAuth Apps → New** 建:
- **Authorization callback URL**(必须完全一致):`https://hspace.<你的域名>/auth/github/callback`
- **Scopes:** 无需任何权限(只读公开身份)。

流程:`/auth/github`(起点)→ GitHub → `/auth/github/callback` → 会话 Cookie;用户在 **`/console`** 登录并生成 API key。

### 步骤 5 — 本地开发闭环(部署前先跑通)

不需要通配域名也能开发——有 `/p/<slug>` 开发路由:

```bash
npm run db:init:local                 # 把 schema 应用到本地 D1
npm run dev                           # wrangler dev → http://localhost:8787
# 对着 localhost 发布,再用开发路由打开:
curl -X POST http://localhost:8787/publish \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# 你好\n本地","password":"1234"}'
# 打开 http://localhost:8787/p/<slug> → 密码门 → 输 1234
```

### 步骤 6 — 部署 & ✅ 验证

```bash
npm run deploy                                          # = wrangler deploy
curl https://<worker>.<sub>.workers.dev/health          # → {"ok":true,"service":"hspace"}
open https://hspace.<你的域名>/console                    # GitHub 登录 → 复制 API key
curl -X POST https://<worker>.<sub>.workers.dev/publish \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# 你好\n私密世界","password":"1234"}'
# 打开返回的 url → 密码门 → 输 1234 → 渲染出来。完成。
```

### 故障排查

- **`<slug>.<域>` 不解析 / 522** → 少了被代理通配 DNS 或 Workers 路由(步骤 3 **两者都要**)。
- **OAuth `redirect_uri mismatch`** → 回调必须逐字节等于 `…/auth/github/callback`。
- **`D1_ERROR` / 绑定未定义** → 绑定名必须是 `DB`(及 `BUCKET`/`RATELIMIT`);确认 `schema.sql` 跑过。
- **`too_large` / `rate_limited`** → 是防滥用(§5);调大 `[vars]` 或登录。

## 7. 分发渠道 & CI/CD

四条渠道都在仓库:VS Code/Cursor 扩展(`vscode-extension/`)、MCP server(`mcp-server/`,`hspace-mcp`)、Claude Code 插件(`clients/claude-code/`,`/share`)、OpenAPI(`/openapi.json`)。三条 GitHub Actions:推 `main`(`backend/**`)→ 部署 + `/health`;打 `v*` → Marketplace + Open VSX;打 `mcp-v*` → `npm publish`。仓库 secret:`CLOUDFLARE_API_TOKEN`、`VSCODE_KEY`、`OPENVSX_KEY`、`NPM_TOKEN`(bypass-2FA)。

## 8. 如何扩展

代码围绕数据模型组织,加功能就是往模型上挂:
- **页面加字段** → `schema.sql` 加列 + 在 `patchPage`/`servePage` 读写(`index.ts`)。
- **新的按接收者行为** → 挂在 `grants` 表 + Cookie 里的 `grantId`。
- **新内容类型** → 对象 key 后缀约定 + 服务路径加分支。
- **新 AI 客户端** → 多数复用 MCP server,只是安装外壳不同。

## 9. 坑与成本

- 小写 base36 slug;`.gitignore` 掉 `.env`(别依赖推送保护);CI 发 npm 用 bypass-2FA token;`npm version --no-git-tag-version` 再手动打 tag;OpenAPI 对 GPT Actions 用 `nullable: true`。
- **成本:** Cloudflare Workers Paid($5/月)绰绰有余;免费档轻量可用——留意自定义域的 Workers 路由与 R2/D1 配额。无其他基础设施。

克隆仓库、走一遍 §6,一个下午拥有自己的实例。

源码:<https://github.com/agentx1boss/hspace> · 在线体验:<https://hspace.zhanjian.space>
