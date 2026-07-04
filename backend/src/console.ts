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

  // ---- 通用:同源 API 调用(会话 Cookie 认证;401 会话过期 / 410 页面已过期 → 刷新回真实状态)----
  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (r.status === 401 || r.status === 410) { location.reload(); throw new Error("stale"); }
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || String(r.status));
        return data;
      });
    });
  }
  function alertErr(err) { if (err.message !== "stale") alert("Request failed: " + err.message); }
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
    exp.textContent = "";
    // box 是唯一被重渲染的区域;一次性密码横幅插在 box 之外,撤销/新增他人不会冲掉它
    var box = el("div", null, "Loading…");
    exp.appendChild(box);
    (kind === "grants" ? loadGrants(exp, box, slug) : loadVersions(box, slug)).catch(function (err) {
      box.textContent = "Failed to load.";
      alertErr(err);
    });
  }

  // 访问人:列出/新建/撤销;新建返回的密码只显示这一次(DOM 全走 textContent,label 是用户输入)
  function loadGrants(exp, box, slug) {
    return api("GET", "/pages/" + slug + "/grants").then(function (data) {
      box.textContent = "";
      box.appendChild(el("p", "note", "Each person gets their own password — revoke one without affecting the rest."));
      data.grants.forEach(function (g) {
        var row = el("div", "grow" + (g.revoked ? " revoked" : ""));
        row.appendChild(el("span", "glabel", g.label || "(unnamed)"));
        row.appendChild(el("span", "meta", g.revoked ? "revoked" : g.hits + " visits" + (g.last_seen_at ? " · last " + dstr(g.last_seen_at) : "")));
        if (!g.revoked) {
          var rb = el("button", "btn sm danger", "Revoke");
          rb.onclick = function () {
            if (!confirm('Revoke access for "' + (g.label || "unnamed") + '"?')) return;
            api("DELETE", "/pages/" + slug + "/grants/" + g.id).then(function () { return loadGrants(exp, box, slug); }).catch(alertErr);
          };
          row.appendChild(rb);
        }
        box.appendChild(row);
      });
      var form = el("div", "grow");
      var input = el("input", "gin");
      input.placeholder = "Name or label, e.g. Alice";
      input.maxLength = 100;
      var add = el("button", "btn sm", "Add person");
      var submit = function () {
        if (add.disabled) return;
        add.disabled = true;
        api("POST", "/pages/" + slug + "/grants", input.value ? { label: input.value } : {}).then(function (g) {
          return loadGrants(exp, box, slug).then(function () {
            // 横幅在 box 外,后续列表重渲染不会销毁它;多次新增依次叠加
            exp.insertBefore(el("p", "fresh", 'Password for "' + (g.label || "unnamed") + '": ' + g.password + " — share it now, it won't be shown again."), box);
          });
        }).catch(function (err) { add.disabled = false; alertErr(err); });
      };
      add.onclick = submit;
      input.onkeydown = function (e) { if (e.key === "Enter") submit(); };
      form.appendChild(input); form.appendChild(add);
      box.appendChild(form);
    });
  }

  // 版本历史:列出 + 回滚(回滚 = 升新版,链接不变)
  function loadVersions(box, slug) {
    return api("GET", "/pages/" + slug + "/versions").then(function (data) {
      box.textContent = "";
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
        box.appendChild(row);
      });
    });
  }
})();
</script>`);
}
