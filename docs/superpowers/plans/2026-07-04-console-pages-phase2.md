# Console 页面管理实施计划 — Phase 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** console 登录后展示自己的页面列表(标题/slug/类型/浏览数/过期),支持续期、删除,行展开管理访问人(grants)与版本历史。

**Architecture:** 全部改动集中在 `backend/src/console.ts` 一个文件:列表由 serveConsole 服务端直查 D1 渲染;续期/删除/grants/versions 由页面内联 JS 走**既有 API**(同源 fetch + 会话 cookie,`authOwner` 双凭据已就位),变更后 `location.reload()` 保持状态一致。不改 index.ts、不加端点。

**Spec:** [2026-07-04-github-login-console-design.md](../specs/2026-07-04-github-login-console-design.md) §5 第 2、3 条。

**吸收 main 并行改动(2026-07-04)**:永久链接已取消(owner 单期上限 `OWNER_MAX_TTL`=30 天);过期页 PATCH 返 410「弃置即死」→ **过期行不出 Renew 按钮**;grants/versions 端点已改 owner 专属(`login_required`),console 恒为 owner,无影响。

**约束**:自包含(内联 CSS/JS,零外部资源);客户端渲染一律 DOM API + `textContent`(grants label 是用户输入,禁 innerHTML 拼接);JS 写在 TS 模板字符串里,**不得出现反引号与 `${`**。

---

### Task 1: console.ts 页面管理(唯一代码任务)

**Files:**
- Modify: `backend/src/console.ts`(整文件替换为下方内容)

- [ ] **Step 1: 用以下完整内容替换 `backend/src/console.ts`**

```ts
// Web console —— hspace.<domain>/console
// 自包含单页(内联 CSS/JS,不引外部资源,项目红线)。
// 账户区:登录态 + API key(首登自动生成,明文仅出现一次)。
// 页面区:服务端渲染列表;续期/删除/访问人/版本走既有 API(同源 fetch + 会话 Cookie 认证)。
import { randomToken, sha256b64 } from "./crypto";
import { sessionOwner } from "./auth";
import type { Env } from "./index";

const now = () => Math.floor(Date.now() / 1000);

interface PageRowLite {
  slug: string;
  filename: string | null;
  created_at: number;
  expires_at: number | null;
  hits: number;
  protected: number;
  object_key: string;
}

export async function serveConsole(url: URL, request: Request, env: Env): Promise<Response> {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store", // 页面可能含一次性明文 key
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  const ownerId = await sessionOwner(request, env);
  if (!ownerId) {
    return new Response(signedOutPage(url.searchParams.get("error")), { status: 200, headers });
  }

  const user = await env.DB.prepare(
    "SELECT github_login FROM users WHERE owner_id = ?"
  ).bind(ownerId).first<{ github_login: string }>();

  let freshKey: string | null = null;
  let keyRow = await env.DB.prepare(
    "SELECT created_at FROM api_keys WHERE owner_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1"
  ).bind(ownerId).first<{ created_at: number }>();
  if (!keyRow) {
    // 首次登录:自动生成 key,明文渲染进本次响应,之后只有哈希
    freshKey = randomToken(24);
    const ts = now();
    await env.DB.prepare(
      "INSERT INTO api_keys (key_hash, owner_id, created_at) VALUES (?, ?, ?)"
    ).bind(await sha256b64(freshKey), ownerId, ts).run();
    keyRow = { created_at: ts };
  }

  const { results: pages } = await env.DB.prepare(
    `SELECT slug, filename, created_at, expires_at, hits,
            (password_hash IS NOT NULL) AS protected, object_key
     FROM pages WHERE owner_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 200`
  ).bind(ownerId).all<PageRowLite>();

  const html = consolePage({
    githubLogin: user?.github_login ?? ownerId,
    freshKey,
    keyCreatedAt: keyRow.created_at,
    fromVscode: url.searchParams.get("from") === "vscode",
    pages: pages ?? [],
    domain: env.USERCONTENT_DOMAIN,
  });
  return new Response(html, { status: 200, headers });
}

const ESC_MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC_MAP[c]);

// GitHub 官方 mark(16×16 单 path,内联 SVG)
const GH_ICON = `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

const STYLE = `<style>
*{box-sizing:border-box;margin:0}
body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;color:#1b1f24}
.wrap{max-width:720px;margin:0 auto;padding:40px 20px}
.center{display:flex;min-height:85vh;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border:1px solid #e3e6ea;border-radius:10px;padding:28px}
.card+.card{margin-top:16px}
.login{text-align:center;width:360px;max-width:100%}
h1{font-size:20px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#666e77;margin:20px 0 8px}
h2:first-child{margin-top:0}
.sub{color:#666e77;margin:6px 0 20px}
.bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.btn{font:inherit;padding:7px 14px;border:1px solid #cfd4da;border-radius:8px;background:#fff;cursor:pointer;text-decoration:none;color:inherit;display:inline-flex;align-items:center;gap:8px}
.btn:hover{background:#f0f2f4}
.btn.gh{background:#1b1f24;color:#fff;border-color:#1b1f24;justify-content:center;width:100%}
.btn.gh:hover{background:#32383f}
.btn.plain{border:none;background:none;color:#666e77}
.btn.sm{padding:4px 10px;font-size:13px;border-radius:6px}
.btn.danger{color:#c0392b;border-color:#e3b4ad}
.btn.danger:hover{background:#fdf2f0}
.keyrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
code{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f0f2f4;padding:6px 10px;border-radius:6px;word-break:break-all}
.note{color:#666e77;font-size:13px;margin-top:8px}
.err{color:#c0392b;margin-bottom:14px}
.tip{background:#fff8e1;border:1px solid #f0e0a0;border-radius:8px;padding:10px 14px;margin-bottom:16px}
.page{padding:12px 0;border-bottom:1px solid #edf0f2}
.page:last-child{border-bottom:none;padding-bottom:0}
.prow{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pmain a{color:inherit;text-decoration:none}
.pmain a:hover{text-decoration:underline}
.meta{color:#666e77;font-size:13px}
.pacts{display:flex;gap:6px;flex-wrap:wrap}
.pexp{margin-top:10px;padding:8px 12px;background:#f8f9fa;border:1px solid #edf0f2;border-radius:8px}
.grow{display:flex;align-items:center;gap:10px;padding:6px 0;flex-wrap:wrap}
.grow.revoked{opacity:.55}
.glabel{font-weight:600;min-width:110px}
.gin{font:inherit;padding:5px 10px;border:1px solid #cfd4da;border-radius:6px;flex:1;min-width:160px}
.fresh{background:#eafaf0;border:1px solid #bfe8cd;border-radius:6px;padding:8px 12px;margin:0 0 8px;font-size:14px}
.expired{color:#c0392b}
</style>`;

const shell = (inner: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Console · HSpace</title>
${STYLE}
</head>
<body>
${inner}
</body>
</html>`;

function signedOutPage(error: string | null): string {
  return shell(`<main class="center">
  <div class="card login">
    <h1>HSpace Console</h1>
    <p class="sub">Manage your API key and shared pages.</p>
    ${error ? `<p class="err">Sign-in failed. Please try again.</p>` : ""}
    <a class="btn gh" href="/auth/github">${GH_ICON} Sign in with GitHub</a>
  </div>
</main>`);
}

interface ConsoleData {
  githubLogin: string;
  freshKey: string | null;
  keyCreatedAt: number;
  fromVscode: boolean;
  pages: PageRowLite[];
  domain: string;
}

const pageType = (key: string) =>
  key.endsWith("/index.json") ? "collection" : key.endsWith(".md") ? "markdown" : "html";
const fmtDate = (epoch: number) => new Date(epoch * 1000).toISOString().slice(0, 10);

function pagesSection(pages: PageRowLite[], domain: string): string {
  if (pages.length === 0) {
    return `<p class="note">No pages yet. Publish a draft from the VS Code extension, MCP, or API — it will show up here.</p>`;
  }
  const ts = now();
  return pages.map((p) => {
    const expired = p.expires_at !== null && p.expires_at < ts;
    const expiry = p.expires_at === null ? "no expiry"
      : expired ? `expired ${fmtDate(p.expires_at)}` : `expires ${fmtDate(p.expires_at)}`;
    // 过期页「弃置即死」(PATCH 返 410),不出 Renew,只留 Delete
    return `<div class="page" data-slug="${esc(p.slug)}">
  <div class="prow">
    <div class="pmain">
      <a href="https://${esc(p.slug)}.${esc(domain)}" target="_blank" rel="noopener"><b>${esc(p.filename || p.slug)}</b></a>
      <div class="meta">${esc(p.slug)} · ${pageType(p.object_key)} · ${p.hits} views · <span${expired ? ' class="expired"' : ""}>${expiry}</span>${p.protected ? " · password" : ""}</div>
    </div>
    <div class="pacts">
      <button class="btn sm" data-act="grants">People</button>
      <button class="btn sm" data-act="versions">Versions</button>${expired ? "" : `
      <button class="btn sm" data-act="renew">Renew 30d</button>`}
      <button class="btn sm danger" data-act="delete">Delete</button>
    </div>
  </div>
  <div class="pexp" hidden></div>
</div>`;
  }).join("\n");
}

function consolePage(d: ConsoleData): string {
  const date = fmtDate(d.keyCreatedAt);
  const keyBlock = d.freshKey
    ? `<div class="keyrow"><code id="key">${esc(d.freshKey)}</code><button class="btn" id="copy">Copy</button></div>
<p class="note">Save it now — it won't be shown again.</p>`
    : `<div class="keyrow"><code>••••••••••••••••••••</code><button class="btn" id="regen">Regenerate</button></div>
<p class="note">Created ${date}. Regenerating revokes the current key immediately.</p>`;

  return shell(`<main class="wrap">
  ${d.fromVscode ? `<div class="tip">Copy your API key below, then paste it back into the editor.</div>` : ""}
  <div class="bar">
    <h1>HSpace Console</h1>
    <form method="post" action="/auth/logout"><button class="btn plain">Sign out</button></form>
  </div>
  <div class="card">
    <h2>Account</h2>
    <p>Signed in as <b>${esc(d.githubLogin)}</b> (GitHub)</p>
    <h2>API key</h2>
    <div id="keyarea">${keyBlock}</div>
    <p class="note">Use it in the VS Code extension ("HSpace: Set API Key") or as <code>Authorization: Bearer &lt;key&gt;</code>.</p>
  </div>
  <div class="card">
    <h2>Pages</h2>
    <div id="pagelist">${pagesSection(d.pages, d.domain)}</div>
  </div>
</main>
<script>
(function () {
  // ---- API key 区 ----
  var area = document.getElementById("keyarea");
  function bindKey() {
    var copy = document.getElementById("copy");
    if (copy) copy.onclick = function () {
      navigator.clipboard.writeText(document.getElementById("key").textContent).then(function () {
        copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1500);
      });
    };
    var regen = document.getElementById("regen");
    if (regen) regen.onclick = function () {
      if (!confirm("Regenerate API key? The current key stops working immediately.")) return;
      api("POST", "/me/api-key").then(function (data) {
        area.innerHTML = '<div class="keyrow"><code id="key"></code><button class="btn" id="copy">Copy</button></div>' +
          "<p class=\\"note\\">Save it now — it won't be shown again.</p>";
        document.getElementById("key").textContent = data.apiKey;
        bindKey();
      }).catch(alertErr);
    };
  }
  bindKey();

  // ---- 通用:同源 API 调用(会话 Cookie 认证;401 = 会话过期 → 回登录态)----
  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (r.status === 401) { location.reload(); throw new Error("unauthorized"); }
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || String(r.status));
        return data;
      });
    });
  }
  function alertErr(err) { if (err.message !== "unauthorized") alert("Request failed: " + err.message); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function dstr(epoch) { return new Date(epoch * 1000).toISOString().slice(0, 10); }

  // ---- Pages 区(事件代理)----
  var list = document.getElementById("pagelist");
  if (list) list.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("button[data-act]") : null;
    if (!btn) return;
    var page = btn.closest(".page");
    var slug = page.getAttribute("data-slug");
    var act = btn.getAttribute("data-act");
    if (act === "renew") {
      if (!confirm("Extend this page to 30 days from now?")) return;
      api("PATCH", "/pages/" + slug, { expiresIn: 2592000 }).then(function () { location.reload(); }).catch(alertErr);
    } else if (act === "delete") {
      if (!confirm("Delete this page? The link stops working immediately.")) return;
      api("DELETE", "/pages/" + slug).then(function () { location.reload(); }).catch(alertErr);
    } else if (act === "grants" || act === "versions") {
      toggle(page, act, slug);
    }
  });

  function toggle(page, kind, slug) {
    var exp = page.querySelector(".pexp");
    if (!exp.hidden && exp.getAttribute("data-kind") === kind) { exp.hidden = true; return; }
    exp.hidden = false;
    exp.setAttribute("data-kind", kind);
    exp.textContent = "Loading…";
    (kind === "grants" ? loadGrants(exp, slug) : loadVersions(exp, slug)).catch(alertErr);
  }

  // 访问人:列出/新建/撤销;新建返回的密码只显示这一次(DOM 全走 textContent,label 是用户输入)
  function loadGrants(exp, slug) {
    return api("GET", "/pages/" + slug + "/grants").then(function (data) {
      exp.textContent = "";
      exp.appendChild(el("p", "note", "Each person gets their own password — revoke one without affecting the rest."));
      data.grants.forEach(function (g) {
        var row = el("div", "grow" + (g.revoked ? " revoked" : ""));
        row.appendChild(el("span", "glabel", g.label || "(unnamed)"));
        row.appendChild(el("span", "meta", g.revoked ? "revoked" : g.hits + " visits" + (g.last_seen_at ? " · last " + dstr(g.last_seen_at) : "")));
        if (!g.revoked) {
          var rb = el("button", "btn sm danger", "Revoke");
          rb.onclick = function () {
            if (!confirm('Revoke access for "' + (g.label || "unnamed") + '"?')) return;
            api("DELETE", "/pages/" + slug + "/grants/" + g.id).then(function () { loadGrants(exp, slug); }).catch(alertErr);
          };
          row.appendChild(rb);
        }
        exp.appendChild(row);
      });
      var form = el("div", "grow");
      var input = el("input", "gin");
      input.placeholder = "Name or label, e.g. Alice";
      input.maxLength = 100;
      var add = el("button", "btn sm", "Add person");
      add.onclick = function () {
        api("POST", "/pages/" + slug + "/grants", input.value ? { label: input.value } : {}).then(function (g) {
          return loadGrants(exp, slug).then(function () {
            exp.insertBefore(el("p", "fresh", 'Password for "' + (g.label || "unnamed") + '": ' + g.password + " — share it now, it won't be shown again."), exp.firstChild);
          });
        }).catch(alertErr);
      };
      form.appendChild(input); form.appendChild(add);
      exp.appendChild(form);
    });
  }

  // 版本历史:列出 + 回滚(回滚 = 升新版,链接不变)
  function loadVersions(exp, slug) {
    return api("GET", "/pages/" + slug + "/versions").then(function (data) {
      exp.textContent = "";
      data.versions.forEach(function (v) {
        var row = el("div", "grow");
        row.appendChild(el("span", "glabel", "v" + v.version + (v.version === data.current ? " · current" : "")));
        row.appendChild(el("span", "meta", (v.size_bytes / 1024).toFixed(1) + " KB · " + dstr(v.created_at)));
        if (v.version !== data.current) {
          var rb = el("button", "btn sm", "Restore");
          rb.onclick = function () {
            if (!confirm("Restore v" + v.version + "? This becomes a new version; the link stays the same.")) return;
            api("POST", "/pages/" + slug + "/versions/" + v.version + "/restore").then(function () { location.reload(); }).catch(alertErr);
          };
          row.appendChild(rb);
        }
        exp.appendChild(row);
      });
    });
  }
})();
</script>`);
}
```

- [ ] **Step 2: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 3: curl 端到端验证**

前置:`cd backend && npx wrangler dev --local-upstream localhost:8787`(后台,读 .dev.vars);铸造会话:

```bash
SESS=$(node -e '
const secret="dev-session-secret", owner="gh:1", exp=Math.floor(Date.now()/1000)+3600;
(async()=>{const enc=new TextEncoder();
const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
const sig=await crypto.subtle.sign("HMAC",key,enc.encode(owner+"."+exp));
console.log(owner+"."+exp+"."+Buffer.from(sig).toString("base64"));})()')
KEY=$(curl -s -X POST http://localhost:8787/me/api-key -H "Cookie: __Host-hs_sess=$SESS" -H "Origin: http://localhost:8787" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).apiKey))')
SLUG=$(curl -s -X POST http://localhost:8787/publish -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"html":"<h1>hello</h1>","filename":"My Test Page"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).slug))')
```

断言:
1. `curl -s http://localhost:8787/console -H "Cookie: __Host-hs_sess=$SESS" | grep -c "My Test Page"` → `1`(列表渲染)
2. 同上响应 `grep -o 'data-act="renew"' | head -1` → 匹配(未过期行有 Renew)
3. 续期(cookie 路径):`curl -s -X PATCH http://localhost:8787/pages/$SLUG -H "Cookie: __Host-hs_sess=$SESS" -H "Origin: http://localhost:8787" -H "Content-Type: application/json" -d '{"expiresIn":2592000}'` → `{"ok":true,...}`
4. 建访问人:`curl -s -X POST http://localhost:8787/pages/$SLUG/grants -H "Cookie: __Host-hs_sess=$SESS" -H "Origin: http://localhost:8787" -H "Content-Type: application/json" -d '{"label":"Alice"}'` → 含 `"password":"<4位数字>"`
5. 列访问人(GET 走 Referer):`curl -s http://localhost:8787/pages/$SLUG/grants -H "Cookie: __Host-hs_sess=$SESS" -H "Referer: http://localhost:8787/console"` → `grants` 数组含 Alice
6. 版本:`curl -s http://localhost:8787/pages/$SLUG/versions -H "Cookie: __Host-hs_sess=$SESS" -H "Referer: http://localhost:8787/console"` → `{"current":1,...}`
7. 删除:`curl -s -X DELETE http://localhost:8787/pages/$SLUG -H "Cookie: __Host-hs_sess=$SESS" -H "Origin: http://localhost:8787"` → `{"ok":true}`;再取 console `grep -c "My Test Page"` → `0`
8. 自包含红线:`grep -nE 'src=|url\(|https?://' backend/src/console.ts` 中除 `href="/auth/github"`、`href="https://<slug>.<domain>"`(Open 链接,导航非资源加载)外无资源引用

结束后杀掉 dev server。

- [ ] **Step 4: Commit**

```bash
git add backend/src/console.ts
git commit -m "console 页面管理:列表/续期/删除 + 访问人 + 版本历史(Phase 2)"
```

---

### 验收(浏览器,合并部署后)

登录生产 console → 列表可见 → Open 新窗口打开 → Renew 后过期日期变 → People 展开建「Alice」拿到一次性密码、访客验密后 visits 增长、Revoke 后旧密码失效 → Versions 展开(PATCH 内容后出现 v2,Restore v1 生效、链接不变)→ Delete 后链接 404。
