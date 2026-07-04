# 插件 Sign in + 落地页 Console 入口实施计划 — Phase 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 插件一条「Sign in with GitHub」命令打通「浏览器登录 → 复制 key → 粘贴」闭环;落地页导航加 Console 入口;operations.md 补 OAuth App 配置与 founder 迁移说明。

**Spec:** [2026-07-04-github-login-console-design.md](../specs/2026-07-04-github-login-console-design.md) §6、§7、§10 第 4 条。

**发版:** 插件 0.6.1 → 0.7.0(新命令 = minor)。合并后由维护者打 `v0.7.0` tag 推送触发 CI 发双市场——tag 推送不在本计划内(对外发布动作,人工执行)。

---

### Task 1: 插件 `hspace.signIn`

**Files:**
- Modify: `vscode-extension/src/extension.ts`
- Modify: `vscode-extension/package.json`(命令 + version)
- Modify: `vscode-extension/CHANGELOG.md`
- Modify: `vscode-extension/README.md`、`vscode-extension/README.zh-CN.md`

- [ ] **Step 1: extension.ts 加常量与命令**

在 `DEFAULT_API_BASE` 常量(约 52 行)旁加:

```ts
const CONSOLE_URL = "https://hspace.zhanjian.space/console"; // 托管版 console(自建后端无此页面)
```

在 `setApiKey` 函数前加:

```ts
async function signIn(context: vscode.ExtensionContext) {
  // 浏览器登录 GitHub → console 一键复制 API key → 回编辑器粘贴(粘贴框已提前打开)
  await vscode.env.openExternal(vscode.Uri.parse(CONSOLE_URL + "?from=vscode"));
  await setApiKey(context);
}
```

在 activate 的命令注册区、`reg("hspace.setApiKey", ...)` 之前加:

```ts
  reg("hspace.signIn", () => signIn(context));
```

`setApiKey` 的 InputBox prompt 从 `"Paste your API key (generate it on the account page)"` 改为 `"Paste your API key (copy it from hspace.zhanjian.space/console)"`。

- [ ] **Step 2: 登录引导统一走 signIn**

grep extension.ts 中现有的登录引导(0.6.1 加的:匿名点登录专属功能时的提示,以及任何触发 `hspace.setApiKey` 的引导按钮/动作),把引导动作从执行 `hspace.setApiKey` 改为执行 `hspace.signIn`(提示文案里的 "Set API key" 字样相应改为 "Sign in");`hspace.setApiKey` 命令本身保留。在报告中列出改了哪些位置。

- [ ] **Step 3: package.json**

`version`: `"0.6.1"` → `"0.7.0"`。`contributes.commands` 中 `hspace.setApiKey` 条目之前插入:

```json
{ "command": "hspace.signIn", "title": "HSpace: Sign in with GitHub" },
```

并把 `hspace.setApiKey` 的 title 从 `"HSpace: Set API key (sign in)"` 改为 `"HSpace: Set API key (paste manually)"`。

- [ ] **Step 4: CHANGELOG.md 顶部加**

```markdown
## 0.7.0 — 2026-07-05

- 新增「HSpace: Sign in with GitHub」:打开浏览器到 console,GitHub 登录后一键复制 API key,回编辑器直接粘贴(粘贴框已自动打开)。
- 登录引导统一指向 Sign in with GitHub;「Set API key」保留为手动粘贴入口,提示指向 console 页面。
```

- [ ] **Step 5: 两个 README 补获取 key 的说明**

在讲登录/API key 的合适位置(命令表或使用说明)各加一句:
- README.md: `Sign in: run **HSpace: Sign in with GitHub** — it opens the console (hspace.zhanjian.space/console); sign in, copy your API key, and paste it back into the editor.`
- README.zh-CN.md: `登录:运行 **HSpace: Sign in with GitHub**,浏览器打开 console(hspace.zhanjian.space/console),GitHub 登录后复制 API key 粘贴回编辑器即可。`

位置就近融入现有结构,不重排文档。

- [ ] **Step 6: 编译验证**

Run: `cd vscode-extension && npm run compile`
Expected: 无错误

- [ ] **Step 7: Commit**

```bash
git add vscode-extension
git commit -m "插件 0.7.0:Sign in with GitHub(浏览器登录 + 粘贴 key 闭环)"
```

---

### Task 2: 落地页 Console 入口

**Files:**
- Modify: `backend/src/landing.ts`

- [ ] **Step 1: L 字典两种语言各加一键**

en 侧(navHow 等旁):`navConsole: "Console",`;zh 侧:`navConsole: "控制台",`。

- [ ] **Step 2: header 导航插入链接**

在 `<a class="ghost" href="${GITHub}" ...>GitHub</a>` 之前插入一行:

```html
<a class="ghost" href="/console">${s.navConsole}</a>
```

(同源相对链接,不加 target;`/console` 已由 worker 服务。)

- [ ] **Step 3: 验证**

Run: `cd backend && npx tsc --noEmit`
Expected: 无输出

Run(wrangler dev 后台,普通 localhost 即可——landing 由 handleApi `/` 分支服务):
`curl -s http://localhost:8787/ | grep -o 'href="/console">Console'` → 匹配
`curl -s "http://localhost:8787/?lang=zh" | grep -o '控制台'` → 匹配

- [ ] **Step 4: Commit**

```bash
git add backend/src/landing.ts
git commit -m "落地页导航加 Console 入口(中英)"
```

---

### Task 3: operations.md 运维说明

**Files:**
- Modify: `docs/operations.md`(在「第一方置顶内容」章节之后、「待办」之前插入新章节)

- [ ] **Step 1: 插入以下章节**

```markdown
## GitHub 登录(OAuth App 与密钥)

console(`hspace.zhanjian.space/console`)的 GitHub 登录依赖一个 OAuth App + 三个 Worker secrets:

- OAuth App(github.com/settings/applications/new):Homepage `https://hspace.zhanjian.space`,callback **必须精确等于** `https://hspace.zhanjian.space/auth/github/callback`。
- 本地开发另建一个 dev App(callback `http://localhost:8787/auth/github/callback`),凭据放 `backend/.dev.vars`(gitignored)。
- secrets(`cd backend` 后 `npx wrangler secret put <名字>`):`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`SESSION_SECRET`(`openssl rand -hex 32` 生成)。轮换 `SESSION_SECRET` 会使所有登录会话立即失效(用户需重新登录),API key 不受影响。

## founder 账户迁移(一次性)

把 GitHub 登录之前的 founder 数据归到 GitHub 身份下(登录一次后执行):

```bash
# 1. 查自己的 GitHub owner_id(登录过 console 后 users 表有记录)
npx wrangler d1 execute html-share --remote --command "SELECT owner_id, github_login FROM users"
# 2. 查旧 founder owner_id(HSPACE_API_KEY 对应的那行)
npx wrangler d1 execute html-share --remote --command "SELECT DISTINCT owner_id FROM api_keys"
# 3. 归并 pages 与 api_keys(<old> 为旧 owner_id,<gh> 形如 gh:123456)
npx wrangler d1 execute html-share --remote --command "UPDATE pages SET owner_id='<gh>' WHERE owner_id='<old>'; UPDATE api_keys SET owner_id='<gh>' WHERE owner_id='<old>'"
```

注意:console 的 Regenerate 会**删除该 owner 的全部 key**(每用户一行语义)。迁移后建议弃用旧 `HSPACE_API_KEY`,在 console 重新生成一把,更新 `.env`,此后只维护这一把。promo 册子页面(置顶内容)迁移后会出现在 console 列表中,`expires_at=NULL` 显示为 "no expiry"——**不要**在 console 对它们点 Renew(会写入 30 天过期,失去常驻;真点了就按上文「第一方置顶内容」重新置 NULL)。
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations.md
git commit -m "operations:GitHub OAuth 配置与 founder 迁移说明"
```

---

### 发版与验收(合并后,人工)

1. 合并 PR(`backend/**` 自动部署落地页;`gh run watch` 看绿灯)
2. 打 tag 发插件:`git tag v0.7.0 && git push origin v0.7.0`(CI 发 Marketplace + Open VSX)
3. 验收:落地页导航出现 Console(中英);装新版插件跑「Sign in with GitHub」→ 浏览器 console 带提示条 → 复制粘贴 → 发布一页 30 天生效
4. 按 operations.md 执行 founder 迁移
