// 内嵌页面模板：密码输入页 / 404

export function passwordPage(slug: string, error = false): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>需要密码</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0f1115;color:#e6e6e6}
  .card{background:#1a1d24;padding:32px;border-radius:12px;width:320px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
  h1{font-size:18px;margin:0 0 16px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;font-size:14px}
  button{width:100%;margin-top:12px;padding:10px;border:0;border-radius:8px;background:#4f7cff;color:#fff;font-size:14px;cursor:pointer}
  .err{color:#ff6b6b;font-size:13px;margin-top:8px}
</style></head>
<body>
  <form class="card" method="POST" action="/">
    <h1>🔒 此页面受密码保护</h1>
    <input type="password" name="password" placeholder="请输入密码" autofocus required>
    <button type="submit">查看</button>
    ${error ? '<div class="err">密码不正确，请重试。</div>' : ""}
  </form>
</body></html>`;
}

/** Markdown 阅读模板：内容为主的私密阅读页,亮暗双主题,品牌橙点缀 */
export function readingPage(title: string, articleHtml: string): string {
  const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
  :root{--bg:#faf9f7;--fg:#1d1d1f;--muted:#6e6e73;--accent:#E2603C;--soft:#f2f0ed;--border:#e5e2dd}
  @media(prefers-color-scheme:dark){:root{--bg:#17181c;--fg:#e8e6e3;--muted:#8b8b90;--accent:#F0784F;--soft:#22242a;--border:#2e3036}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
       font:17px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
  main{max-width:42rem;margin:0 auto;padding:56px 24px 48px}
  h1,h2,h3,h4{line-height:1.35;margin:2em 0 .7em;font-weight:700;letter-spacing:-.01em}
  h1{font-size:1.85em;margin-top:0}
  h2{font-size:1.4em;padding-bottom:.3em;border-bottom:1px solid var(--border)}
  h3{font-size:1.15em}
  p{margin:1em 0}
  a{color:var(--accent);text-decoration:none;border-bottom:1px solid transparent}
  a:hover{border-bottom-color:var(--accent)}
  strong{font-weight:650}
  code{background:var(--soft);padding:.15em .45em;border-radius:5px;font-size:.88em;
       font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace}
  pre{background:var(--soft);padding:16px 20px;border-radius:10px;overflow-x:auto;line-height:1.6}
  pre code{background:none;padding:0;font-size:.86em}
  blockquote{margin:1.4em 0;padding:.05em 1.2em;border-left:3px solid var(--accent);color:var(--muted)}
  blockquote p{margin:.6em 0}
  ul,ol{padding-left:1.5em;margin:1em 0}
  li{margin:.35em 0}
  table{border-collapse:collapse;margin:1.4em 0;display:block;overflow-x:auto;max-width:100%}
  th,td{border:1px solid var(--border);padding:8px 14px;text-align:left}
  th{background:var(--soft);font-weight:650}
  img{max-width:100%;border-radius:8px}
  hr{border:0;border-top:1px solid var(--border);margin:2.5em 0}
  footer{max-width:42rem;margin:0 auto;padding:0 24px 48px;color:var(--muted);font-size:12.5px}
  footer .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);
              margin-right:7px;vertical-align:1px}
</style></head>
<body>
  <main>${articleHtml}</main>
  <footer><span class="dot"></span>HSpace · 私密分享</footer>
</body></html>`;
}

export function lockedPage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>尝试次数过多</title>
<style>body{font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0f1115;color:#888;text-align:center}</style>
</head><body><div><h1>⏳ 尝试次数过多</h1><p>密码错误次数过多，请 15 分钟后再试。</p></div></body></html>`;
}

export function notFoundPage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>页面不存在</title>
<style>body{font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0f1115;color:#888}</style>
</head><body><div><h1>404</h1><p>该页面不存在、已删除或已过期。</p></div></body></html>`;
}
