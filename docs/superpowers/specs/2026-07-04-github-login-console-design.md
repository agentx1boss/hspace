# GitHub 登录 + Web Console 设计

日期:2026-07-04
状态:待评审

## 1. 目标与非目标

**目标**:补上「用户如何获得 API key」这一缺环,并给登录用户一个最小管理界面。

- GitHub OAuth 登录(web 端唯一登录方式)
- Web console(`hspace.zhanjian.space/console`):API key 管理、我的页面列表、访问人(grants)管理、版本历史
- VS Code 插件:「Sign in with GitHub」= 打开浏览器到 console → 用户复制 key → 粘贴回插件(复用现有 `setApiKey` 存储逻辑)

**非目标**(明确不做):

- 邮箱魔法链接 / 其他 OAuth provider(身份定为 `gh:<github_id>`,单一路径)
- 插件全自动 OAuth 回调(URI handler / localhost 回调)
- 付费、配额购买、团队(见 business-model-hypothesis.md,仍是纸面假设)
- console 里新建/编辑内容(发布始终走插件/MCP/API)
- MCP server 改动(继续读 `HSPACE_API_KEY` 环境变量,key 从 console 获取)

## 2. 数据模型

新增一张表(`backend/schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS users (
  owner_id     TEXT PRIMARY KEY,   -- 'gh:<github_numeric_id>'
  github_login TEXT NOT NULL,      -- 展示用,登录时刷新
  created_at   INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
```

- 现有 `pages.owner_id`、`api_keys.owner_id` 语义不变,新用户的值为 `gh:<id>`。
- **每用户同一时刻只有一把有效 API key**:重新生成 = 删除旧行 + 插入新行(batch 原子;revoked 字段保留但登录用户路径不再使用)。
- founder 迁移:上线后手动一条 UPDATE 把现有 founder `owner_id` 的 `api_keys`/`pages` 归到自己的 `gh:<id>` 下(operations.md 记录步骤)。

## 3. GitHub OAuth 流程(web)

新增 secrets:`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`SESSION_SECRET`(wrangler secret,CI 不涉及)。GitHub OAuth App 回调地址 `https://hspace.zhanjian.space/auth/github/callback`,scope 为空(只取公开身份)。

新增路由(仅挂在 `hspace.` 落地域,新文件 `backend/src/auth.ts`):

| 路由 | 行为 |
|---|---|
| `GET /auth/github` | 生成随机 `state` 存短时 cookie,302 到 GitHub 授权页 |
| `GET /auth/github/callback` | 校验 state → 换 token → `GET api.github.com/user` 取 id/login → upsert `users` → 签发 session cookie → 302 `/console` |
| `POST /auth/logout` | 清 cookie,302 落地页 |

**Session:无状态签名 cookie**(不建 session 表):`__Host-hs_sess = base64(payload).hmac`,payload 含 `{owner_id, exp}`,HMAC-SHA256(SESSION_SECRET),有效期 30 天。属性:`HttpOnly; Secure; SameSite=Lax; Path=/`(host-only,`__Host-` 前缀禁止 Domain 属性)。__Host- 前缀防用户内容子域种 domain cookie 冒充。登出即删 cookie(无服务端吊销;30 天上限可接受,属已知取舍)。

## 4. 认证扩展(关键架构决策)

`authOwner()`(backend/src/index.ts:168)扩展为双凭据:

1. `Authorization: Bearer <key>` —— 现状,不变(插件 / MCP / API 用户)。
2. 无 Bearer 时,读 `__Host-hs_sess` cookie 验签 —— console 前端用。

**理由**:API key 只存 SHA-256 哈希,console 无法拿到明文去调 API;复用 cookie 认证后,console 的页面列表 / 删除 / 续期 / grants / versions **全部直接复用现有端点**,零新增业务逻辑。

**CSRF 防护**:cookie 凭据仅在请求 `Origin`(或 `Referer`)为 `https://hspace.zhanjian.space` 时被接受;配合 `SameSite=Lax`。Bearer 路径不受影响。

新增的 console 专用端点只有两个(cookie 认证):

| 路由 | 行为 |
|---|---|
| `GET /me` | 返回 `{owner_id, github_login, api_key_masked, api_key_created_at}` |
| `POST /me/api-key` | 吊销旧 key → 生成新 key(`randomToken(24)`,同现有逻辑)→ **明文仅此响应返回一次** |

## 5. Web Console

- 单文件自包含页面(内联 CSS/JS/SVG,不引外部资源——项目红线),新文件 `backend/src/console.ts`,挂 `hspace.zhanjian.space/console`。
- 未登录:居中一个「Sign in with GitHub」按钮(链到 `/auth/github`)。
- 已登录,三块内容,英文文案(v1 不做中文,`?lang=zh` 后置):
  1. **Account**:GitHub 用户名;API key 掩码显示 + `Regenerate`(确认后调 `POST /me/api-key`,明文一次性展示 + Copy 按钮)。首次登录且无 key 时自动生成并展示(服务端渲染进页面,展示一次)。
  2. **Pages**:`GET /pages` 列表——slug、标题、类型、过期时间、浏览数;行内操作:Open(新窗口)、Renew(`PATCH` ttl)、Delete(确认)。
  3. **行展开区**:每行可展开 Grants(列出/新建/撤销,复用 3 个现有 grants 端点)与 Versions(列出/restore,复用 2 个现有 versions 端点)。
- `?from=vscode` 参数:页面顶部提示条「Copy your API key and paste it back into the editor」。
- 文案遵循 positioning.md:用 draft/page 术语,不提加密存储,不展示价格。

## 6. VS Code 插件改动(极小)

- 新命令 `hspace.signIn`(「HSpace: Sign in with GitHub」):`vscode.env.openExternal('https://hspace.zhanjian.space/console?from=vscode')`,同时弹出现有的 API key InputBox 等待粘贴。
- `hspace.setApiKey` 保留(手动粘贴入口),提示文案里的 "account page" 终于名副其实。
- 现有 `signOut`、secrets 存储、`Authorization: Bearer` 逻辑全部不变。
- 需要发插件小版本(patch 到 CI tag 流程)。

## 7. 落地页

头部导航加一个 `Console` 链接(指 `/console`),中英文案各一行,两本 promo 册子不涉及。

## 8. 错误处理

- OAuth 失败(state 不匹配 / GitHub 换 token 失败):302 回 `/console?error=auth_failed`,页面显示一行错误 + 重试按钮。
- session 过期:API 返 401,console 前端捕获后刷新页面回到登录态。
- GitHub API 限流/超时:同 auth_failed 处理,不重试。

## 9. 测试与验收

- `npx tsc --noEmit` 通过;部署后跑现有 /health 冒烟。
- 手工验收路径:GitHub 登录 → 首次自动出 key → 复制 → 插件粘贴 → 发布一页(30 天上限生效)→ console 里看到该页 → 建 grant → 撤销 → renew → delete → logout。
- 回归:Bearer 路径(插件/MCP)行为不变;匿名发布不受影响。

## 10. 实施顺序

1. schema + auth.ts(OAuth + session cookie)+ authOwner 扩展 + `/me` 端点 —— 后端可独立部署验证
2. console.ts 页面
3. 插件 `hspace.signIn` + 发版
4. 落地页导航链接;operations.md 补 founder 迁移与 OAuth App 配置说明
