// 内嵌页面模板：密码页 / Markdown 阅读页 / 合集目录页 / 锁定页 / 404

// 站点 favicon(32px PNG 内联,所有模板共用)
export const FAVICON_LINK = '<link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAByklEQVR4AexWvU4CQRCevcJYWKiFBQIac4mNUFCZQOIRa30BY0KIlS+hFL6CFYkk8gRqayCRwooCCpuLUf5ipQ2Vhjt3Vvay7t0eF+MFQm7Dx87Mfjvz5QMuaDDlFQmYTQficd1YT+i1WEK3Y0n93O9r4vACcL36eDpgEajZAAbgsuEMh2AoA8U5PDykXBSPYVC4BGBT+fKvIeIhHSimGFsa/AiHYMslINi1/2NFAiIH5tuB10LuoFPItShsihbm8u/H14HMygJwdAs5QwY/E/f9tcU9xitmjwjADR2YosBXCvN+MbuNCYdSwMnWElxmVh3YwJ6O+IR0IJ7z+GJn2WBci1T5EHG3LO1QzJUCmh+fIi+02FfA7v0bnDbfGah9eRn8TNzLz8MS4xFy7KV6NPq6E+tKAZyETiASlUZdBtZllF+GwHhXD1X6UaDd7XGvNuab149P45xtEwUw1h/fNiqN22SlkaYgFGnM5VahCpCHeeWRgMiB2XNAs6AO8iJQkkuY0weOizvomL7/ovGeCJcDvZ5ZB2EgDlE17XfNPOciT7MhLzYPErsE4CUcOOiaBMGGYFEBzkUeE6/gqcqeAlTkMOrzL2CSa98AAAD//6djUEEAAAAGSURBVAMASMzLQVmiCxsAAAAASUVORK5CYII=">';

// 落地页:各页页脚的品牌署名指向这里(增长闭环,新标签打开)
const LANDING = "https://hspace.zhanjian.space";
// 页脚署名带来源标记,落地页据此显示「你是被分享过来的?」引导并统计飞轮流入
const FOOT_HREF = LANDING + "?ref=shared";
// 统一页脚署名:密码页 / 阅读页 / 目录页 / 合集导航 / 404 一律用英文 slogan(品牌 tagline)
const FOOT_SIG = "HSpace · Ship to one, not to all.";

/**
 * 「收藏」入口:阅读页/目录页页脚渲染,指向 hspace console 的收藏流(带签名 save 令牌)。
 * 读者点击 → 登录(若未登录)→ 收藏进自己账号。
 * alreadySaved(内容子域的 hs_sv_<slug> 标记 Cookie,在从 Console 免密打开时种下)为真时,
 * 显示「已收藏」并直接指向 Console 收藏列表(点它看真实收藏,不重复入库)。token 为空则不渲染。
 */
function saveLink(token?: string, alreadySaved?: boolean): string {
  if (alreadySaved) {
    return `<a class="save saved" href="${LANDING}/console" target="_blank" rel="noopener">已收藏</a><span class="sep">·</span>`;
  }
  if (!token) return "";
  // 令牌含 base64 的 +//=,必须 URL 编码,否则 query 解析把 + 变空格导致验签失败
  return `<a class="save" href="${LANDING}/console?save=${encodeURIComponent(token)}" target="_blank" rel="noopener">收藏</a><span class="sep">·</span>`;
}

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

/** 品牌标记(白 H + 橙,置于墨色圆角砖上) */
const BRAND_MARK = `<svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
  <rect x="9" y="8" width="11" height="48" rx="5.5" fill="#fff"/>
  <rect x="30" y="8" width="11" height="48" rx="5.5" fill="#fff"/>
  <rect x="13" y="29.5" width="35" height="5" rx="2.5" fill="#F0784F"/>
  <circle cx="51" cy="32" r="6" fill="#F0784F"/>
</svg>`;

/**
 * 密码门 —— 接收方唯一的品牌触点。私密、可信、亮暗自适应、移动端友好。
 * action="" → 提交到当前 URL；成功后服务端 303 跳回同一路径,深链得以保留。
 */
export function passwordPage(error = false, lang: "en" | "zh" = "en", expiresAt: number | null = null): string {
  const t = lang === "zh"
    ? { title: "输入密码 · HSpace", h1: "有人给你分享了内容", sub: "输入访问密码即可查看",
        ph: "访问密码", aria: "访问密码", btn: "查看内容", err: "密码不正确，请重试", until: "有效期至" }
    : { title: "Enter password · HSpace", h1: "Someone shared this with you", sub: "Enter the password to view it",
        ph: "Password", aria: "Password", btn: "View content", err: "Wrong password — try again", until: "Available until" };
  const expLine = expiresAt
    ? `\n  <div class="exp">${t.until} ${new Date(expiresAt * 1000).toISOString().slice(0, 10)}</div>`
    : "";
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">${FAVICON_LINK}
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${t.title}</title>
<style>
  :root{--bg:#f4f2ef;--fg:#1d1d1f;--muted:#6e6e73;--accent:#E2603C;--card:#fff;
        --field:#f7f6f4;--border:#e3e0db;--ring:rgba(226,96,60,.18);--ink:#1A1D24}
  @media(prefers-color-scheme:dark){:root{--bg:#141519;--fg:#e8e6e3;--muted:#8b8b90;--accent:#F0784F;
        --card:#212329;--field:#191b20;--border:#31343b;--ring:rgba(240,120,79,.22);--ink:#1A1D24}}
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
       display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;
       font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
       background-image:radial-gradient(120% 90% at 50% -10%,var(--ring),transparent 60%)}
  .card{background:var(--card);width:100%;max-width:360px;padding:34px 30px 28px;border-radius:20px;
        border:1px solid var(--border);box-shadow:0 12px 40px rgba(0,0,0,.10);
        animation:rise .45s cubic-bezier(.16,1,.3,1) both}
  @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .tile{width:52px;height:52px;border-radius:14px;background:var(--ink);
        display:flex;align-items:center;justify-content:center;margin:0 auto 18px;
        box-shadow:0 6px 18px rgba(26,29,36,.28)}
  h1{font-size:19px;font-weight:680;letter-spacing:-.01em;margin:0 0 6px;text-align:center}
  .sub{font-size:13.5px;color:var(--muted);text-align:center;margin:0 0 22px}
  .field{position:relative;display:flex;align-items:center}
  .field .lk{position:absolute;left:14px;font-size:15px;opacity:.55;pointer-events:none}
  input{width:100%;box-sizing:border-box;padding:13px 14px 13px 40px;border-radius:12px;
        border:1.5px solid var(--border);background:var(--field);color:var(--fg);
        font-size:16px;letter-spacing:.02em;transition:border-color .15s,box-shadow .15s}
  input::placeholder{color:var(--muted);letter-spacing:0}
  input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px var(--ring)}
  button{width:100%;margin-top:14px;padding:13px;border:0;border-radius:12px;background:var(--accent);
         color:#fff;font-size:15.5px;font-weight:650;cursor:pointer;transition:filter .15s,transform .05s}
  button:hover{filter:brightness(1.05)}
  button:active{transform:translateY(1px)}
  .err{color:var(--accent);font-size:13px;margin:12px 0 0;text-align:center;font-weight:550}
  .foot{color:var(--muted);font-size:12px;display:flex;align-items:center;gap:6px}
  .foot .dot{width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block}
  .foot a{color:var(--muted);text-decoration:none}
  .foot a:hover{color:var(--accent)}
  .exp{color:var(--muted);font-size:11px;opacity:.55;letter-spacing:.02em;margin-top:-8px}
  .shake{animation:shake .4s}
  @keyframes shake{10%,90%{transform:translateX(-1px)}30%,70%{transform:translateX(-4px)}50%{transform:translateX(4px)}}
  @media(prefers-reduced-motion:reduce){.card,.shake{animation:none}}
</style></head>
<body>
  <form class="card${error ? " shake" : ""}" method="POST" action="" autocomplete="off">
    <div class="tile">${BRAND_MARK}</div>
    <h1>${t.h1}</h1>
    <p class="sub">${t.sub}</p>
    <div class="field">
      <span class="lk">🔒</span>
      <input type="password" name="password" placeholder="${t.ph}" autofocus required
             autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
             aria-label="${t.aria}">
    </div>
    <button type="submit">${t.btn}</button>
    ${error ? `<p class="err" role="alert">${t.err}</p>` : ""}
  </form>
  <div class="foot"><span class="dot"></span><a href="${FOOT_HREF}" target="_blank" rel="noopener">${FOOT_SIG}</a></div>${expLine}
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
  footer a{color:var(--muted);border-bottom:none}
  footer a:hover{color:var(--accent)}
  footer .save{color:var(--accent);font-weight:600}
  footer .save.saved{color:var(--muted);font-weight:400}
  footer .sep{margin:0 8px;opacity:.45}
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

/** Markdown 阅读页；传入 nav 时渲染合集导航;updatedAt(epoch 秒)非空时页脚显示"更新于";saveToken/alreadySaved 决定页脚「收藏/已收藏」 */
export function readingPage(title: string, articleHtml: string, nav?: CollectionNav, updatedAt?: number | null, saveToken?: string, alreadySaved?: boolean): string {
  const pageTitle = nav ? `${title} · ${nav.collectionTitle}` : title;
  const crumb = nav
    ? `<div class="crumb"><a href="/">← 目录</a><span class="sep">·</span>${esc(nav.collectionTitle)}</div>`
    : "";
  const upd = updatedAt ? ` · 更新于 ${new Date(updatedAt * 1000).toISOString().slice(0, 10)}` : "";
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">${FAVICON_LINK}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<style>${BASE_CSS}</style></head>
<body class="${nav ? "has-side" : ""}">
  ${nav ? sidebar(nav) : ""}
  <div class="wrap">
    <main>${crumb}${articleHtml}${nav ? prevNext(nav) : ""}</main>
    <footer>${saveLink(saveToken, alreadySaved)}<span class="dot"></span><a href="${FOOT_HREF}" target="_blank" rel="noopener">${FOOT_SIG}</a>${upd}</footer>
  </div>
</body></html>`;
}

/** 合集目录页;saveToken/alreadySaved 决定页脚「收藏/已收藏」 */
export function tocPage(collectionTitle: string, docs: NavDoc[], meta: string, saveToken?: string, alreadySaved?: boolean): string {
  const rows = docs.map(d =>
    `<a class="row" href="/${d.index}"><span class="n">${d.index}</span><span class="t">${esc(d.title)}</span><span class="arw">→</span></a>`
  ).join("");
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">${FAVICON_LINK}
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
  <footer>${saveLink(saveToken, alreadySaved)}<span class="dot"></span><a href="${FOOT_HREF}" target="_blank" rel="noopener">${FOOT_SIG}</a></footer>
</body></html>`;
}

/**
 * 合集中 html 篇目的悬浮导航条(可折叠):目录 + 逐篇 + 上/下篇。
 * 用 Shadow DOM 与用户页面彻底样式隔离——既不被页面 CSS 污染,也不影响页面。
 * 只往 body 追加一个宿主元素 + 一段 IIFE,不改动用户原有 DOM。
 */
function collectionNavWidget(nav: CollectionNav): string {
  const items = nav.docs.map((d) =>
    `<a class="doc${d.index === nav.current ? " on" : ""}" href="/${d.index}"><i>${d.index}</i><span>${esc(d.title)}</span></a>`
  ).join("");
  const prev = nav.current > 1 ? nav.current - 1 : 0;
  const next = nav.current < nav.docs.length ? nav.current + 1 : 0;
  const pn =
    `<div class="pn">` +
    (prev ? `<a href="/${prev}">← 上一篇</a>` : `<span class="dis">← 上一篇</span>`) +
    (next ? `<a class="nx" href="/${next}">下一篇 →</a>` : `<span class="dis nx">下一篇 →</span>`) +
    `</div>`;
  const markup =
    `<style>
      :host{all:initial}
      *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif}
      .pill{position:fixed;left:16px;bottom:16px;z-index:2147483647;display:inline-flex;align-items:center;gap:8px;
            padding:9px 14px;background:#1A1D24;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:999px;
            box-shadow:0 4px 18px rgba(0,0,0,.32);cursor:pointer;font-size:13px;font-weight:600;line-height:1}
      .pill .dot{width:7px;height:7px;border-radius:50%;background:#F0784F}
      .panel{position:fixed;left:16px;bottom:64px;z-index:2147483647;width:270px;max-width:calc(100vw - 32px);
             background:#fff;color:#1d1d1f;border:1px solid #e5e2dd;border-radius:14px;overflow:hidden;
             box-shadow:0 16px 44px rgba(0,0,0,.24);display:none;animation:pop .16s ease-out}
      .panel.open{display:block}
      @keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e5e2dd;font-weight:700;font-size:13px}
      .hd .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .hd .x{cursor:pointer;color:#6e6e73;font-size:16px;line-height:1}
      .list{max-height:min(50vh,340px);overflow-y:auto;padding:6px}
      .doc{display:flex;gap:10px;align-items:baseline;padding:9px 10px;border-radius:8px;color:#1d1d1f;
           text-decoration:none;font-size:13.5px;line-height:1.4;border-left:3px solid transparent}
      .doc:hover{background:#f2f0ed}
      .doc.on{background:#f2f0ed;border-left-color:#E2603C;font-weight:600}
      .doc i{color:#8b8b90;font-style:normal;font-size:12px;font-variant-numeric:tabular-nums}
      .doc.on i{color:#E2603C}
      .pn{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e2dd}
      .pn a,.pn .dis{flex:1;text-align:center;padding:8px;border-radius:8px;font-size:12.5px;font-weight:600;text-decoration:none}
      .pn a{color:#1d1d1f;background:#f2f0ed}
      .pn a:hover{background:#e7e4df}
      .pn .nx{text-align:center}
      .pn .dis{color:#c4c0b8}
      .brand{display:block;text-align:center;padding:8px;font-size:11.5px;color:#8b8b90;text-decoration:none;border-top:1px solid #e5e2dd}
      .brand:hover{color:#E2603C}
      @media(prefers-color-scheme:dark){.brand{border-color:#2e3036}}
      @media(prefers-color-scheme:dark){
        .panel{background:#22242a;color:#e8e6e3;border-color:#2e3036}
        .hd{border-color:#2e3036}.hd .x{color:#8b8b90}
        .doc{color:#e8e6e3}.doc:hover,.doc.on{background:#2a2d34}
        .pn{border-color:#2e3036}.pn a{color:#e8e6e3;background:#2a2d34}.pn a:hover{background:#33373f}.pn .dis{color:#55585f}
      }
      @media(prefers-reduced-motion:reduce){.panel{animation:none}}
    </style>
    <button class="pill" id="p" aria-label="打开目录"><span class="dot"></span>目录 · ${nav.current}/${nav.docs.length}</button>
    <div class="panel" id="n" role="dialog" aria-label="合集导航">
      <div class="hd"><span class="t">${esc(nav.collectionTitle)}</span><span class="x" id="x" aria-label="关闭">×</span></div>
      <div class="list">${items}</div>
      ${pn}
      <a class="brand" href="${FOOT_HREF}" target="_blank" rel="noopener">${FOOT_SIG}</a>
    </div>`;
  const json = JSON.stringify(markup).replace(/</g, "\\u003c");
  return `<div id="hspace-nav-host"></div><script>(function(){try{` +
    `var h=document.getElementById('hspace-nav-host');var r=h.attachShadow({mode:'open'});r.innerHTML=${json};` +
    `var p=r.getElementById('p'),n=r.getElementById('n'),x=r.getElementById('x');` +
    `p.addEventListener('click',function(){n.classList.toggle('open')});` +
    `x.addEventListener('click',function(){n.classList.remove('open')});` +
    `}catch(e){var a=document.createElement('a');a.href='/';a.textContent='\\u2190 目录';` +
    `a.style.cssText='position:fixed;left:16px;bottom:16px;z-index:2147483647;background:#1A1D24;color:#fff;padding:9px 14px;border-radius:999px;text-decoration:none;font:600 13px sans-serif';` +
    `document.body.appendChild(a);}})();</script>`;
}

/** 把合集悬浮导航注入 html 篇目:插到最后一个 </body> 前,缺失则追加 */
export function injectCollectionNav(html: string, nav: CollectionNav): string {
  const w = collectionNavWidget(nav);
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i === -1 ? html + w : html.slice(0, i) + w + html.slice(i);
}

export function lockedPage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>尝试次数过多</title>
<style>body{font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#17181c;color:#888;text-align:center}</style>
</head><body><div><h1>⏳ 尝试次数过多</h1><p>密码错误次数过多，请 15 分钟后再试。</p></div></body></html>`;
}

export function notFoundPage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">${FAVICON_LINK}<title>页面不存在</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;display:flex;flex-direction:column;gap:14px;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#17181c;color:#888;text-align:center}
a{color:#8b8b90;text-decoration:none;font-size:13px}a:hover{color:#F0784F}</style>
</head><body><div><h1>404</h1><p>该页面不存在、已删除或已过期。</p></div>
<a href="${FOOT_HREF}" target="_blank" rel="noopener">${FOOT_SIG}</a></body></html>`;
}
