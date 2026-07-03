// 内嵌页面模板：密码页 / Markdown 阅读页 / 合集目录页 / 锁定页 / 404

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface NavDoc {
  index: number;
  title: string;
}
export interface CollectionNav {
  collectionTitle: string;
  docs: NavDoc[];
  current: number; // 1-based
}

export function passwordPage(error = false): string {
  // action="" → 提交到当前 URL；成功后由服务端 303 跳回同一路径，深链得以保留
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>需要密码</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#17181c;color:#e8e6e3}
  .card{background:#22242a;padding:32px;border-radius:14px;width:320px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
  .brand{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:650;margin:0 0 20px}
  .brand .dot{width:9px;height:9px;border-radius:50%;background:#F0784F;display:inline-block}
  h1{font-size:16px;margin:0 0 16px;font-weight:600}
  input{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:9px;border:1px solid #34363d;background:#17181c;color:#fff;font-size:15px}
  input:focus{outline:none;border-color:#F0784F}
  button{width:100%;margin-top:12px;padding:11px;border:0;border-radius:9px;background:#F0784F;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:hover{background:#e2603c}
  .err{color:#ff8a6b;font-size:13px;margin-top:10px}
</style></head>
<body>
  <form class="card" method="POST" action="">
    <div class="brand"><span class="dot"></span>HSpace</div>
    <h1>🔒 有人分享了内容给你</h1>
    <input type="password" name="password" placeholder="请输入访问密码" autofocus required autocomplete="off">
    <button type="submit">查看内容</button>
    ${error ? '<div class="err">密码不正确，请重试。</div>' : ""}
  </form>
</body></html>`;
}

const BASE_CSS = `
  :root{--bg:#faf9f7;--fg:#1d1d1f;--muted:#6e6e73;--accent:#E2603C;--soft:#f2f0ed;--border:#e5e2dd;--panel:#f4f2ef}
  @media(prefers-color-scheme:dark){:root{--bg:#17181c;--fg:#e8e6e3;--muted:#8b8b90;--accent:#F0784F;--soft:#22242a;--border:#2e3036;--panel:#1c1e23}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
       font:17px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
  a{color:var(--accent);text-decoration:none}
  main{max-width:42rem;margin:0 auto;padding:56px 24px 40px}
  h1,h2,h3,h4{line-height:1.35;margin:2em 0 .7em;font-weight:700;letter-spacing:-.01em}
  h1{font-size:1.85em;margin-top:0}
  h2{font-size:1.4em;padding-bottom:.3em;border-bottom:1px solid var(--border)}
  h3{font-size:1.15em}
  p{margin:1em 0}
  main a{border-bottom:1px solid transparent}
  main a:hover{border-bottom-color:var(--accent)}
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
  footer{max-width:42rem;margin:0 auto;padding:8px 24px 48px;color:var(--muted);font-size:12.5px}
  footer .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:7px;vertical-align:1px}
  /* 合集侧栏与导航 */
  .side{display:none}
  .crumb{font-size:13.5px;color:var(--muted);margin:-24px 0 32px;padding-bottom:16px;border-bottom:1px solid var(--border)}
  .crumb a{border-bottom:none}
  .crumb .sep{margin:0 8px;opacity:.5}
  .pn{display:flex;gap:12px;margin:40px 0 0;padding-top:24px;border-top:1px solid var(--border)}
  .pn a{flex:1;border:1px solid var(--border);border-radius:10px;padding:12px 16px;display:block;transition:border-color .15s}
  .pn a:hover{border-color:var(--accent)}
  .pn .dir{font-size:12px;color:var(--muted);margin-bottom:3px}
  .pn .t{font-size:14.5px;color:var(--fg);font-weight:600}
  .pn .next{text-align:right}
  @media(min-width:1100px){
    .has-side .side{display:block;position:fixed;top:0;left:0;bottom:0;width:264px;overflow-y:auto;
         border-right:1px solid var(--border);background:var(--panel);padding:32px 16px}
    .has-side .wrap{padding-left:264px}
    .side .ct{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:0 12px;margin-bottom:12px}
    .side ol{list-style:none;padding:0;margin:0}
    .side li{margin:1px 0}
    .side a{display:flex;gap:10px;padding:9px 12px;border-radius:8px;color:var(--fg);font-size:14px;line-height:1.4;border-left:3px solid transparent}
    .side a:hover{background:var(--soft)}
    .side a.on{background:var(--soft);border-left-color:var(--accent);font-weight:600}
    .side .n{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12.5px;padding-top:1px}
    .side a.on .n{color:var(--accent)}
  }
`;

function sidebar(nav: CollectionNav): string {
  const items = nav.docs.map(d =>
    `<li><a class="${d.index === nav.current ? "on" : ""}" href="/${d.index}"><span class="n">${d.index}</span><span>${esc(d.title)}</span></a></li>`
  ).join("");
  return `<nav class="side"><div class="ct">${esc(nav.collectionTitle)}</div><ol>${items}</ol></nav>`;
}

function prevNext(nav: CollectionNav): string {
  const prev = nav.docs.find(d => d.index === nav.current - 1);
  const next = nav.docs.find(d => d.index === nav.current + 1);
  if (!prev && !next) return "";
  const left = prev
    ? `<a href="/${prev.index}"><div class="dir">← 上一篇</div><div class="t">${esc(prev.title)}</div></a>`
    : `<span style="flex:1"></span>`;
  const right = next
    ? `<a class="next" href="/${next.index}"><div class="dir">下一篇 →</div><div class="t">${esc(next.title)}</div></a>`
    : `<span style="flex:1"></span>`;
  return `<nav class="pn">${left}${right}</nav>`;
}

/** Markdown 阅读页；传入 nav 时渲染合集导航(面包屑 + 宽屏侧栏 + 上/下篇) */
export function readingPage(title: string, articleHtml: string, nav?: CollectionNav): string {
  const pageTitle = nav ? `${title} · ${nav.collectionTitle}` : title;
  const crumb = nav
    ? `<div class="crumb"><a href="/">← 目录</a><span class="sep">·</span>${esc(nav.collectionTitle)}</div>`
    : "";
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<style>${BASE_CSS}</style></head>
<body class="${nav ? "has-side" : ""}">
  ${nav ? sidebar(nav) : ""}
  <div class="wrap">
    <main>${crumb}${articleHtml}${nav ? prevNext(nav) : ""}</main>
    <footer><span class="dot"></span>HSpace · 私密分享</footer>
  </div>
</body></html>`;
}

/** 合集目录页 */
export function tocPage(collectionTitle: string, docs: NavDoc[], meta: string): string {
  const rows = docs.map(d =>
    `<a class="row" href="/${d.index}"><span class="n">${d.index}</span><span class="t">${esc(d.title)}</span><span class="arw">→</span></a>`
  ).join("");
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(collectionTitle)}</title>
<style>${BASE_CSS}
  .meta{color:var(--muted);font-size:13.5px;margin:-16px 0 28px}
  .list{margin:0;border-top:1px solid var(--border)}
  .row{display:flex;align-items:center;gap:16px;padding:16px 6px;border-bottom:1px solid var(--border);color:var(--fg);min-height:48px}
  .row:hover{color:var(--accent)}
  .row .n{color:var(--muted);font-variant-numeric:tabular-nums;font-size:14px;min-width:1.4em}
  .row:hover .n{color:var(--accent)}
  .row .t{flex:1;font-size:16.5px;font-weight:500;line-height:1.4}
  .row .arw{opacity:0;color:var(--accent);transition:opacity .15s}
  .row:hover .arw{opacity:1}
</style></head>
<body>
  <main>
    <h1>${esc(collectionTitle)}</h1>
    <div class="meta">${esc(meta)}</div>
    <div class="list">${rows}</div>
  </main>
  <footer><span class="dot"></span>HSpace · 私密分享</footer>
</body></html>`;
}

/**
 * 合集中 html 篇目的悬浮「← 目录」按钮。
 * 只注入这一个自包含元素,不改动用户 DOM;内联样式全部 !important 以抵御页面 CSS。
 */
export function backToTocButton(): string {
  const s = [
    "position:fixed!important", "left:16px!important", "bottom:16px!important",
    "z-index:2147483647!important", "margin:0!important",
    "display:inline-flex!important", "align-items:center!important", "gap:7px!important",
    "padding:9px 15px!important", "background:#1A1D24!important", "color:#fff!important",
    "font:600 13.5px/1 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif!important",
    "text-decoration:none!important", "border-radius:999px!important",
    "box-shadow:0 4px 16px rgba(0,0,0,.28)!important", "border:1px solid rgba(255,255,255,.14)!important",
    "opacity:.92!important",
  ].join(";");
  const dot = "width:7px;height:7px;border-radius:50%;background:#F0784F;display:inline-block";
  return `<a href="/" aria-label="返回目录" style="${s}"><span style="${dot}"></span>← 目录</a>`;
}

/** 把悬浮按钮注入 html 篇目:插到最后一个 </body> 前,缺失则追加 */
export function injectBackButton(html: string): string {
  const btn = backToTocButton();
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i === -1 ? html + btn : html.slice(0, i) + btn + html.slice(i);
}

export function lockedPage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>尝试次数过多</title>
<style>body{font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#17181c;color:#888;text-align:center}</style>
</head><body><div><h1>⏳ 尝试次数过多</h1><p>密码错误次数过多，请 15 分钟后再试。</p></div></body></html>`;
}

export function notFoundPage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>页面不存在</title>
<style>body{font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#17181c;color:#888}</style>
</head><body><div><h1>404</h1><p>该页面不存在、已删除或已过期。</p></div></body></html>`;
}
