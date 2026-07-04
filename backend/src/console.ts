// Web console —— hspace.<domain>/console
// 自包含单页(内联 CSS/JS,不引外部资源,项目红线)。v1 只有账户区:
// 登录态 + API key(首次登录自动生成,明文服务端渲染,仅出现一次)。英文文案,zh 后置。
import { randomToken, sha256b64 } from "./crypto";
import { sessionOwner } from "./auth";
import type { Env } from "./index";

const now = () => Math.floor(Date.now() / 1000);

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

  const html = consolePage({
    githubLogin: user?.github_login ?? ownerId,
    freshKey,
    keyCreatedAt: keyRow.created_at,
    fromVscode: url.searchParams.get("from") === "vscode",
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
.wrap{max-width:640px;margin:0 auto;padding:40px 20px}
.center{display:flex;min-height:85vh;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border:1px solid #e3e6ea;border-radius:10px;padding:28px}
.login{text-align:center;width:360px;max-width:100%}
h1{font-size:20px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#666e77;margin:20px 0 8px}
.sub{color:#666e77;margin:6px 0 20px}
.bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.btn{font:inherit;padding:7px 14px;border:1px solid #cfd4da;border-radius:8px;background:#fff;cursor:pointer;text-decoration:none;color:inherit;display:inline-flex;align-items:center;gap:8px}
.btn:hover{background:#f0f2f4}
.btn.gh{background:#1b1f24;color:#fff;border-color:#1b1f24;justify-content:center;width:100%}
.btn.gh:hover{background:#32383f}
.btn.plain{border:none;background:none;color:#666e77}
.keyrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
code{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f0f2f4;padding:6px 10px;border-radius:6px;word-break:break-all}
.note{color:#666e77;font-size:13px;margin-top:8px}
.err{color:#c0392b;margin-bottom:14px}
.tip{background:#fff8e1;border:1px solid #f0e0a0;border-radius:8px;padding:10px 14px;margin-bottom:16px}
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
}

function consolePage(d: ConsoleData): string {
  const date = new Date(d.keyCreatedAt * 1000).toISOString().slice(0, 10);
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
</main>
<script>
(function () {
  var area = document.getElementById("keyarea");
  function bind() {
    var copy = document.getElementById("copy");
    if (copy) copy.onclick = function () {
      navigator.clipboard.writeText(document.getElementById("key").textContent).then(function () {
        copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1500);
      });
    };
    var regen = document.getElementById("regen");
    if (regen) regen.onclick = function () {
      if (!confirm("Regenerate API key? The current key stops working immediately.")) return;
      fetch("/me/api-key", { method: "POST" }).then(function (r) {
        if (r.status === 401) { location.reload(); return null; }
        return r.json();
      }).then(function (data) {
        if (!data) return;
        area.innerHTML = '<div class="keyrow"><code id="key"></code><button class="btn" id="copy">Copy</button></div>' +
          "<p class=\\"note\\">Save it now — it won't be shown again.</p>";
        document.getElementById("key").textContent = data.apiKey;
        bind();
      });
    };
  }
  bind();
})();
</script>`);
}
