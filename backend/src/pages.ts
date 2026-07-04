// 法务/运营页面:隐私政策、服务条款、举报。自包含,亮暗自适应,可索引。

import { FAVICON_LINK } from "./html";

const SITE = "https://hspace.zhanjian.space";
// TODO: 换成你实际监控的邮箱,并在 Cloudflare Email Routing 上把它接到你的收件箱
const CONTACT = "abuse@zhanjian.space"; // 举报/联系邮箱

const DOC_CSS = `
  :root{--bg:#faf9f7;--fg:#1d1d1f;--muted:#6a6a70;--accent:#E2603C;--card:#fff;--border:#e7e4df;--soft:#f2f0ec;--ink:#1A1D24}
  @media(prefers-color-scheme:dark){:root{--bg:#141519;--fg:#e8e6e3;--muted:#9a9aa0;--accent:#F0784F;--card:#1d1f24;--border:#2c2f36;--soft:#1a1c21;--ink:#1A1D24}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
       font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
  a{color:var(--accent)}
  .top{border-bottom:1px solid var(--border)}
  .top .in{max-width:46rem;margin:0 auto;padding:16px 24px;display:flex;align-items:center;gap:9px;font-weight:750}
  .top .tile{width:30px;height:30px;border-radius:8px;background:var(--ink);display:flex;align-items:center;justify-content:center}
  main{max-width:46rem;margin:0 auto;padding:44px 24px 64px}
  h1{font-size:28px;letter-spacing:-.02em;margin:0 0 6px}
  .upd{color:var(--muted);font-size:13.5px;margin-bottom:32px}
  h2{font-size:19px;margin:34px 0 10px;letter-spacing:-.01em}
  p,li{color:var(--fg)}
  ul{padding-left:1.3em}
  li{margin:.4em 0}
  .muted{color:var(--muted)}
  footer{max-width:46rem;margin:0 auto;padding:0 24px 48px;color:var(--muted);font-size:13px}
  footer a{color:var(--muted)}
  /* report form */
  label{display:block;font-weight:600;font-size:14px;margin:18px 0 6px}
  input,select,textarea{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:10px;border:1.5px solid var(--border);
        background:var(--card);color:var(--fg);font:inherit;font-size:15px}
  input:focus,select,textarea:focus{outline:none;border-color:var(--accent)}
  textarea{min-height:110px;resize:vertical}
  button{margin-top:20px;padding:12px 22px;border:0;border-radius:11px;background:var(--accent);color:#fff;font-weight:650;font-size:15px;cursor:pointer}
  button:hover{filter:brightness(1.05)}
  .note{background:var(--soft);border:1px solid var(--border);border-radius:12px;padding:16px 18px;font-size:14px;color:var(--muted);margin-top:8px}
`;

const MARK = `<svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
  <rect x="9" y="8" width="11" height="48" rx="5.5" fill="#fff"/><rect x="30" y="8" width="11" height="48" rx="5.5" fill="#fff"/>
  <rect x="13" y="29.5" width="35" height="5" rx="2.5" fill="#F0784F"/><circle cx="51" cy="32" r="6" fill="#F0784F"/></svg>`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">${FAVICON_LINK}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · HSpace</title>
<link rel="canonical" href="${SITE}/">
<style>${DOC_CSS}</style></head>
<body>
  <div class="top"><div class="in"><a href="/" style="display:flex;align-items:center;gap:9px;text-decoration:none;color:inherit"><span class="tile">${MARK}</span>HSpace</a></div></div>
  <main>${body}</main>
  <footer><a href="/">← 返回首页</a> · <a href="/privacy">隐私政策</a> · <a href="/terms">服务条款</a> · <a href="/report">举报内容</a></footer>
</body></html>`;
}

export function privacyPage(): string {
  return shell("隐私政策", `
    <h1>隐私政策</h1>
    <div class="upd">最后更新:2026-07-04</div>
    <p>HSpace(以下简称"本服务")是一个把内容发布成带密码链接的私密分享工具。本政策说明我们如何处理你的数据。</p>
    <h2>我们收集什么</h2>
    <ul>
      <li><strong>你发布的内容</strong>:你主动发布的 HTML / Markdown 文本,存储于 Cloudflare 边缘(R2)。</li>
      <li><strong>发布元数据</strong>:随机短码、创建/过期时间、访问计数、密码的单向哈希(PBKDF2,我们不存明文密码)。</li>
      <li><strong>有限的技术数据</strong>:用于频率限制与防滥用的 IP 哈希(非明文 IP)、访问次数。我们不使用第三方广告或分析追踪。</li>
    </ul>
    <h2>我们不做什么</h2>
    <ul>
      <li>不收集账号画像、不出售任何数据。</li>
      <li>分享页面带 <code>noindex</code>,不会被搜索引擎收录。</li>
      <li>不在 URL 中放置任何个人信息。</li>
    </ul>
    <h2>数据保留</h2>
    <p>匿名分享最长 7 天后自动删除。你可随时手动删除,删除后内容立即不可访问。举报记录与必要的防滥用日志会保留合理期限。</p>
    <h2>你的权利</h2>
    <p>你可随时删除自己发布的内容(凭编辑凭据或登录)。如需协助或数据相关请求,联系 <a href="mailto:${CONTACT}">${CONTACT}</a>。</p>
    <h2>自建实例</h2>
    <p>本服务开源,可自行部署。自建实例的数据由部署者自行掌控,本政策仅适用于官方实例。</p>
  `);
}

export function termsPage(): string {
  return shell("服务条款", `
    <h1>服务条款</h1>
    <div class="upd">最后更新:2026-07-04</div>
    <p>使用 HSpace 即表示你同意以下条款。</p>
    <h2>可接受使用</h2>
    <p>你对自己发布的内容负全部责任。<strong>禁止</strong>发布或分发:</p>
    <ul>
      <li>钓鱼、诈骗、凭据收集页面;</li>
      <li>恶意软件、混淆的恶意脚本;</li>
      <li>侵犯他人知识产权、隐私或合法权益的内容;</li>
      <li>违法、暴力、仇恨或其他滥用性内容。</li>
    </ul>
    <h2>下架与封禁</h2>
    <p>我们可在收到举报或自行发现违规时,不经事先通知移除内容、封禁滥用来源。举报见 <a href="/report">举报页</a>。</p>
    <h2>服务"按现状"提供</h2>
    <p>本服务免费、按"现状"提供,不对可用性、内容留存或适用性作任何担保。匿名内容会自动过期,请勿将本服务作为唯一存储。</p>
    <h2>限制</h2>
    <p>存在体积、频率、有效期与访问量等限制(以产品说明为准),用于防滥用与控制成本。</p>
    <h2>联系</h2>
    <p><a href="mailto:${CONTACT}">${CONTACT}</a></p>
  `);
}

export function reportPage(prefillSlug = "", done = false, error = ""): string {
  if (done) {
    return shell("举报已收到", `
      <h1>举报已收到</h1>
      <div class="upd">感谢你帮助我们保持平台干净。</div>
      <p>我们会尽快核实。若属实,相关内容将被移除。如需补充信息或紧急处理,可邮件 <a href="mailto:${CONTACT}">${CONTACT}</a>。</p>
      <p style="margin-top:24px"><a href="/">← 返回首页</a></p>
    `);
  }
  return shell("举报内容", `
    <h1>举报违规内容</h1>
    <div class="upd">发现钓鱼、恶意或侵权内容?告诉我们,我们会核实并处理。</div>
    ${error ? `<div class="note" style="color:var(--accent)">${error}</div>` : ""}
    <form method="POST" action="/report">
      <label for="slug">被举报的链接或短码</label>
      <input id="slug" name="slug" placeholder="如 https://ab12cd7.zhanjian.space 或 ab12cd7" value="${prefillSlug.replace(/"/g, "&quot;")}">
      <label for="reason">类型</label>
      <select id="reason" name="reason">
        <option value="phishing">钓鱼 / 诈骗</option>
        <option value="malware">恶意软件 / 脚本</option>
        <option value="copyright">侵权 / 盗版</option>
        <option value="other">其他</option>
      </select>
      <label for="detail">补充说明</label>
      <textarea id="detail" name="detail" placeholder="简述问题(可选)"></textarea>
      <label for="reporter">你的联系方式(可选,便于回访)</label>
      <input id="reporter" name="reporter" placeholder="邮箱(可选)">
      <button type="submit">提交举报</button>
    </form>
    <div class="note">也可直接邮件 <a href="mailto:${CONTACT}">${CONTACT}</a>。</div>
  `);
}
