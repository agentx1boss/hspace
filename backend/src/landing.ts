// HSpace 落地页 —— 自包含单页,内联样式与 SVG,无外部请求。可被搜索引擎索引。

import { FAVICON_LINK } from "./html";

const SITE = "https://hspace.zhanjian.space";
const GITHUB = "https://github.com/agentx1boss/hspace";
const MARKETPLACE = "https://marketplace.visualstudio.com/items?itemName=agentx1boss.hspace";
const OPENVSX = "https://open-vsx.org/extension/agentx1boss/hspace";

const MARK = `<svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
  <rect x="9" y="8" width="11" height="48" rx="5.5" fill="#fff"/>
  <rect x="30" y="8" width="11" height="48" rx="5.5" fill="#fff"/>
  <rect x="13" y="29.5" width="35" height="5" rx="2.5" fill="#F0784F"/>
  <circle cx="51" cy="32" r="6" fill="#F0784F"/>
</svg>`;

function feature(icon: string, title: string, body: string): string {
  return `<div class="feat"><div class="fi">${icon}</div><h3>${title}</h3><p>${body}</p></div>`;
}
function step(n: string, title: string, body: string): string {
  return `<div class="step"><div class="sn">${n}</div><div><h3>${title}</h3><p>${body}</p></div></div>`;
}

export function landingPage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HSpace — AI 写完的 demo,只发给该看的人</title>
${FAVICON_LINK}
<link rel="canonical" href="${SITE}/">
<meta name="description" content="AI 写完的 demo,只发给该看的人:一键变成「链接 + 密码」,谁看了有回执,发错了随时撤回。为 Cursor / Claude Code 开发者而生的定向分享。">
<meta property="og:title" content="HSpace — AI 写完的 demo,只发给该看的人">
<meta property="og:description" content="一键变成「链接 + 密码」:谁看了有回执,发错了随时撤回,链接不变可迭代。">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/">
<meta property="og:image" content="${SITE}/og-card.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="HSpace — AI 写完的 demo,只发给该看的人">
<meta name="twitter:image" content="${SITE}/og-card.png">
<style>
  :root{--bg:#faf9f7;--fg:#1d1d1f;--muted:#6a6a70;--accent:#E2603C;--card:#fff;
        --border:#e7e4df;--soft:#f2f0ec;--ink:#1A1D24;--ring:rgba(226,96,60,.14)}
  @media(prefers-color-scheme:dark){:root{--bg:#141519;--fg:#e8e6e3;--muted:#9a9aa0;--accent:#F0784F;
        --card:#1d1f24;--border:#2c2f36;--soft:#1a1c21;--ink:#1A1D24;--ring:rgba(240,120,79,.16)}}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
       font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:1000px;margin:0 auto;padding:0 24px}
  .btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:11px;font-weight:650;font-size:15px;transition:filter .15s,transform .05s,background .15s}
  .btn:active{transform:translateY(1px)}
  .btn-p{background:var(--accent);color:#fff}
  .btn-p:hover{filter:brightness(1.06)}
  .btn-s{background:var(--soft);color:var(--fg);border:1px solid var(--border)}
  .btn-s:hover{border-color:var(--accent)}

  header{position:sticky;top:0;z-index:10;backdrop-filter:saturate(1.4) blur(10px);
         background:var(--bg);background:color-mix(in srgb,var(--bg) 82%,transparent);border-bottom:1px solid var(--border)}
  header .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
  .logo{display:flex;align-items:center;gap:9px;font-weight:750;font-size:17px;letter-spacing:-.01em}
  .logo .tile{width:34px;height:34px;border-radius:9px;background:var(--ink);display:flex;align-items:center;justify-content:center}
  .nav{display:flex;align-items:center;gap:10px}
  .nav .ghost{color:var(--muted);font-size:14.5px;padding:8px 10px}
  .nav .ghost:hover{color:var(--fg)}

  .hero{padding:76px 0 64px;text-align:center}
  .tag{display:inline-block;font-size:13px;color:var(--accent);background:var(--ring);
       padding:5px 13px;border-radius:999px;font-weight:600;margin-bottom:22px}
  h1{font-size:clamp(32px,6vw,52px);line-height:1.1;letter-spacing:-.02em;margin:0 0 18px;font-weight:800}
  h1 .hl{color:var(--accent)}
  .lead{font-size:clamp(16px,2.4vw,19px);color:var(--muted);max-width:36rem;margin:0 auto 32px}
  .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}

  .mock{max-width:440px;margin:56px auto 0;background:var(--card);border:1px solid var(--border);
        border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,.10);padding:22px;text-align:left}
  .mock .row{display:flex;align-items:center;gap:12px}
  .mock .lk{width:42px;height:42px;border-radius:11px;background:var(--ink);display:flex;align-items:center;justify-content:center;font-size:19px;flex:0 0 auto}
  .mock .url{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:600}
  .mock .sub{color:var(--muted);font-size:13px;margin-top:2px}
  .mock .pw{margin-top:16px;display:flex;align-items:center;justify-content:space-between;
            background:var(--soft);border:1px solid var(--border);border-radius:11px;padding:12px 15px}
  .mock .pw .k{color:var(--muted);font-size:13.5px}
  .mock .pw .v{font-family:ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:5px}
  .mock .copied{margin-top:12px;font-size:12.5px;color:var(--accent);display:flex;align-items:center;gap:6px}
  .mock .copied .d{width:6px;height:6px;border-radius:50%;background:var(--accent)}

  section{padding:60px 0}
  .band{background:var(--soft);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
  h2{font-size:clamp(23px,4vw,30px);letter-spacing:-.02em;text-align:center;margin:0 0 8px;font-weight:750}
  .sec-sub{text-align:center;color:var(--muted);margin:0 auto 40px;max-width:34rem}

  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  .diff{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px}
  .diff h3{margin:0 0 8px;font-size:17px}
  .diff p{margin:0;color:var(--muted);font-size:14.5px}

  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
  .step{display:flex;gap:14px}
  .step .sn{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:var(--accent);color:#fff;
            display:flex;align-items:center;justify-content:center;font-weight:700}
  .step h3{margin:2px 0 5px;font-size:16px}
  .step p{margin:0;color:var(--muted);font-size:14.5px}

  .feats{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  .feat{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:22px}
  .feat .fi{font-size:22px;margin-bottom:10px}
  .feat h3{margin:0 0 6px;font-size:16px}
  .feat p{margin:0;color:var(--muted);font-size:14px;line-height:1.6}

  .cta-band{text-align:center}
  .cta-band h2{margin-bottom:20px}

  footer{border-top:1px solid var(--border);padding:32px 0;color:var(--muted);font-size:14px}
  footer .wrap{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
  footer a{color:var(--muted)}footer a:hover{color:var(--fg)}
  footer .links{display:flex;gap:18px}

  /* 产品截图(浏览器窗口 mock) */
  .shots{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:8px}
  .shot{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--card);box-shadow:0 16px 44px rgba(0,0,0,.12)}
  .shot .bar{display:flex;align-items:center;gap:10px;padding:10px 13px;background:var(--soft);border-bottom:1px solid var(--border)}
  .shot .dots{display:flex;gap:6px}
  .shot .dots i{width:10px;height:10px;border-radius:50%;background:var(--border);display:block}
  .shot .addr{flex:1;background:var(--card);border:1px solid var(--border);border-radius:7px;padding:5px 10px;
              font:12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap}
  .shot .cap{text-align:center;font-size:13.5px;color:var(--muted);margin-top:12px}
  /* TOC mock */
  .toc{padding:26px 24px 22px}
  .toc .h{margin:0 0 4px;font-size:19px;font-weight:700;letter-spacing:-.01em}
  .toc .m{color:var(--muted);font-size:12.5px;margin-bottom:14px}
  .toc .r{display:flex;align-items:center;gap:13px;padding:11px 4px;border-top:1px solid var(--border);font-size:14.5px}
  .toc .r .n{color:var(--muted);font-variant-numeric:tabular-nums;font-size:13px}
  .toc .r .a{margin-left:auto;color:var(--accent);opacity:.7}
  /* reading mock with sidebar */
  .read{display:flex;min-height:230px}
  .read .side{width:38%;background:var(--soft);border-right:1px solid var(--border);padding:16px 12px}
  .read .side .t{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);padding:0 8px 8px}
  .read .side .i{display:flex;gap:8px;padding:7px 8px;border-radius:6px;font-size:12.5px;color:var(--muted);border-left:2px solid transparent}
  .read .side .i.on{background:var(--card);color:var(--fg);border-left-color:var(--accent);font-weight:600}
  .read .main{flex:1;padding:20px 20px}
  .read .main .h{margin:0 0 10px;font-size:16px;font-weight:700}
  .read .main .p{height:8px;border-radius:4px;background:var(--soft);margin:8px 0}
  .read .main .tb{margin-top:14px;border:1px solid var(--border);border-radius:7px;overflow:hidden}
  .read .main .tb .tr{display:flex;font-size:11px}
  .read .main .tb .tr>div{flex:1;padding:6px 9px;border-right:1px solid var(--border)}
  .read .main .tb .th{background:var(--soft);font-weight:600}
  /* 体验入口 */
  .try{display:inline-flex;align-items:center;gap:14px;max-width:420px;width:100%;text-align:left;
       background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;
       box-shadow:0 10px 30px rgba(0,0,0,.08);transition:border-color .15s,transform .05s}
  .try:hover{border-color:var(--accent)}
  .try:active{transform:translateY(1px)}
  .try .lk{width:42px;height:42px;border-radius:11px;background:var(--ink);display:flex;align-items:center;justify-content:center;font-size:19px;flex:0 0 auto}
  .try .ta{display:flex;flex-direction:column;flex:1;min-width:0}
  .try .tu{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:600;color:var(--fg)}
  .try .th{font-size:13px;color:var(--muted);margin-top:2px}
  .try .th b{color:var(--accent);font-variant-numeric:tabular-nums;letter-spacing:2px}
  .try .go{color:var(--accent);font-size:20px;flex:0 0 auto}
  /* VS Code 风格编辑器 mock(发送方视角,恒暗——它就是编辑器) */
  .vsc{max-width:760px;margin:8px auto 0;border-radius:12px;overflow:hidden;text-align:left;
       border:1px solid #2c2f36;background:#1e1f24;box-shadow:0 20px 54px rgba(0,0,0,.35);
       font-size:12.5px;color:#c8c8cc}
  .vsc .vbar{display:flex;align-items:center;gap:10px;padding:9px 12px;background:#17181c;border-bottom:1px solid #2c2f36}
  .vsc .vbar .dots{display:flex;gap:6px}
  .vsc .vbar .dots i{width:10px;height:10px;border-radius:50%;background:#3a3d45;display:block}
  .vsc .vbar .vt{flex:1;text-align:center;color:#8b8b90;font-size:11.5px}
  .vsc .vbody{display:flex;min-height:250px;position:relative}
  .vsc .vside{width:222px;flex:0 0 auto;background:#191a1f;border-right:1px solid #2c2f36;padding:10px 8px}
  .vsc .vh{font-size:10px;font-weight:700;letter-spacing:.06em;color:#8b8b90;padding:0 8px 8px}
  .vsc .vi{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:6px;white-space:nowrap;overflow:hidden}
  .vsc .vi.on{background:#26282f}
  .vsc .vi .nm{overflow:hidden;text-overflow:ellipsis}
  .vsc .vi em{font-style:normal;color:#8b8b90;font-size:10.5px;margin-left:auto;flex:0 0 auto}
  .vsc .vmain{flex:1;display:flex;flex-direction:column;min-width:0}
  .vsc .vtabs{display:flex;align-items:center;background:#17181c;border-bottom:1px solid #2c2f36}
  .vsc .vtab{padding:8px 16px;background:#1e1f24;border-right:1px solid #2c2f36;font-size:11.5px;color:#e8e6e3}
  .vsc .vcloud{margin-left:auto;padding:0 14px;font-size:15px;position:relative}
  .vsc .vcloud .ring{position:absolute;inset:2px 6px;border:1.5px solid #F0784F;border-radius:8px;
       animation:pulse 2s ease-out infinite}
  @keyframes pulse{0%{opacity:.9;transform:scale(.9)}70%{opacity:0;transform:scale(1.25)}100%{opacity:0}}
  .vsc .vcode{flex:1;padding:14px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .vsc .vcode i{display:block;height:9px;border-radius:4px;margin:7px 0;opacity:.75}
  .vsc .vtoast{position:absolute;right:12px;bottom:12px;max-width:320px;background:#26282f;border:1px solid #3a3d45;
       border-radius:9px;padding:11px 13px;font-size:11.5px;color:#e8e6e3;box-shadow:0 10px 26px rgba(0,0,0,.4)}
  .vsc .vtoast .ok{color:#F0784F;font-weight:700;margin-right:5px}
  .vsc .vtoast .u{font-family:ui-monospace,monospace}
  .vsc .vtoast .vbtns{display:flex;gap:8px;margin-top:9px}
  .vsc .vtoast .vbtns span{padding:4px 10px;border-radius:6px;background:#F0784F;color:#fff;font-weight:600;font-size:11px}
  .vsc .vtoast .vbtns span+span{background:#3a3d45}
  @media(max-width:720px){.vsc .vside{display:none}}
  /* FAQ */
  .faqs{max-width:44rem;margin:0 auto}
  .faqs details{border:1px solid var(--border);border-radius:12px;background:var(--card);margin:10px 0;padding:0 18px}
  .faqs summary{cursor:pointer;padding:15px 0;font-weight:600;font-size:15.5px;list-style:none;position:relative}
  .faqs summary::after{content:"+";position:absolute;right:2px;color:var(--accent);font-weight:400;font-size:19px}
  .faqs details[open] summary::after{content:"−"}
  .faqs summary::-webkit-details-marker{display:none}
  .faqs p{margin:0 0 15px;color:var(--muted);font-size:14.5px}
  .faqs a{color:var(--accent)}
  @media(max-width:720px){.grid3,.steps,.feats,.shots{grid-template-columns:1fr}.hero{padding:52px 0 44px}}
</style></head>
<body>
  <header><div class="wrap">
    <a class="logo" href="/"><span class="tile">${MARK}</span>HSpace</a>
    <nav class="nav">
      <a class="ghost" href="#how">如何使用</a>
      <a class="ghost" href="#features">功能</a>
      <a class="ghost" href="#faq">FAQ</a>
      <a class="ghost" href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>
      <a class="btn btn-p" href="${MARKETPLACE}" target="_blank" rel="noopener">安装插件</a>
    </nav>
  </div></header>

  <section class="hero"><div class="wrap">
    <span class="tag">为 AI 编程而生 · 定向分享,不是公开托管</span>
    <h1><span class="hl">AI 写完的 demo</span>,只发给该看的人</h1>
    <p class="lead">Cursor / Claude Code 刚生成的 HTML demo、Markdown 方案——一键变成「链接 + 密码」发给同事和客户:谁看了有回执,发错了随时撤回,链接不变可迭代。</p>
    <div class="cta">
      <a class="btn btn-p" href="${MARKETPLACE}" target="_blank" rel="noopener">安装 VS Code 插件</a>
      <a class="btn btn-s" href="${GITHUB}" target="_blank" rel="noopener">在 GitHub 查看</a>
    </div>

    <div class="mock">
      <div class="row">
        <div class="lk">🔒</div>
        <div><div class="url">a7k2m9x.zhanjian.space</div><div class="sub">AI 生成的方案 · 7 天后自动失效</div></div>
      </div>
      <div class="pw"><span class="k">访问密码</span><span class="v">4831</span></div>
      <div class="copied"><span class="d"></span>链接和密码已复制,粘贴发走即可</div>
    </div>
  </div></section>

  <section><div class="wrap" style="text-align:center">
    <h2>你这边:编辑器里点一下</h2>
    <p class="sec-sub">写完就是发完。云图标一点,链接+密码进剪贴板;侧栏面板看回执、管访问人、升版本。</p>
    <div class="vsc">
      <div class="vbar"><div class="dots"><i></i><i></i><i></i></div><span class="vt">pricing-demo.html — my-project</span></div>
      <div class="vbody">
        <div class="vside">
          <div class="vh">HSPACE · 最近发布</div>
          <div class="vi on"><span>🔒</span><span class="nm">pricing-demo.html</span><em>👁 12 · v2</em></div>
          <div class="vi"><span>📖</span><span class="nm">Q3 方案(合集 · 5 篇)</span><em>👁 8</em></div>
          <div class="vi"><span>🔒</span><span class="nm">架构评审.md</span><em>👁 3</em></div>
        </div>
        <div class="vmain">
          <div class="vtabs"><span class="vtab">pricing-demo.html</span><span class="vcloud"><span class="ring"></span>☁️</span></div>
          <div class="vcode" aria-hidden="true">
            <i style="width:52%;background:#6a7bd8"></i>
            <i style="width:78%;background:#3f4250"></i>
            <i style="width:64%;background:#c98a6a"></i>
            <i style="width:83%;background:#3f4250"></i>
            <i style="width:41%;background:#7fae8b"></i>
            <i style="width:70%;background:#3f4250"></i>
          </div>
          <div class="vtoast"><span class="ok">✓</span>已发布:<span class="u">a7k2m9x.zhanjian.space</span>(密码 4831,链接和密码已复制)
            <div class="vbtns"><span>浏览器打开</span><span>修改密码</span></div>
          </div>
        </div>
      </div>
    </div>
    <div style="font-size:13.5px;color:var(--muted);margin-top:12px">VS Code / Cursor 插件 · 也可在 Claude 对话里经 MCP 直接发布</div>
  </div></section>

  <section class="band"><div class="wrap">
    <h2>对方那边:输一次密码,通览全部</h2>
    <p class="sec-sub">目录、逐篇阅读、篇间导航,全在一个链接里。</p>
    <div class="shots">
      <div>
        <div class="shot">
          <div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="addr">🔒 q3plan.zhanjian.space</div></div>
          <div class="toc">
            <div class="h">Q3 增长方案</div>
            <div class="m">5 篇 · 2026-07 分享</div>
            <div class="r"><span class="n">1</span><span>总览与目标</span><span class="a">→</span></div>
            <div class="r"><span class="n">2</span><span>数据分析</span><span class="a">→</span></div>
            <div class="r"><span class="n">3</span><span>渠道策略</span><span class="a">→</span></div>
            <div class="r"><span class="n">4</span><span>预算与排期</span><span class="a">→</span></div>
            <div class="r"><span class="n">5</span><span>附录:竞品对比</span><span class="a">→</span></div>
          </div>
        </div>
        <div class="cap">合集目录页</div>
      </div>
      <div>
        <div class="shot">
          <div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="addr">🔒 q3plan.zhanjian.space/2</div></div>
          <div class="read">
            <div class="side">
              <div class="t">Q3 增长方案</div>
              <div class="i"><span>1</span><span>总览与目标</span></div>
              <div class="i on"><span>2</span><span>数据分析</span></div>
              <div class="i"><span>3</span><span>渠道策略</span></div>
              <div class="i"><span>4</span><span>预算与排期</span></div>
            </div>
            <div class="main">
              <div class="h">数据分析</div>
              <div class="p" style="width:96%"></div>
              <div class="p" style="width:88%"></div>
              <div class="p" style="width:70%"></div>
              <div class="tb">
                <div class="tr th"><div>指标</div><div>Q1</div><div>Q2</div></div>
                <div class="tr"><div>GMV</div><div>1.2M</div><div>1.5M</div></div>
              </div>
            </div>
          </div>
        </div>
        <div class="cap">Markdown 篇目 · 侧栏导航</div>
      </div>
    </div>
  </div></section>

  <section><div class="wrap">
    <h2>不是又一个 HTML 托管</h2>
    <p class="sec-sub">常规托管都在抢「发布到全世界」;给同事和客户看的东西,要的是另一套能力。</p>
    <div class="grid3">
      <div class="diff"><h3>🚀 30 秒发出去</h3><p>零注册、零配置,编辑器或 AI 对话里一键发布,链接+密码一次粘贴。别家的密码保护要付费套餐加一堆配置,这里是默认。</p></div>
      <div class="diff"><h3>🎯 发错了?收得回</h3><p>改密码即撤回;每人一链,踢掉一个人不用换所有人的密码;谁看了、看了几次,有回执。</p></div>
      <div class="diff"><h3>🔁 链接是活的</h3><p>AI 迭代内容,链接不变——review 意见改完直接更新,历史版本可回滚。不用再发「最终版_v3」新链接。</p></div>
    </div>
  </div></section>

  <section class="band"><div class="wrap" style="text-align:center">
    <h2>亲自体验一次</h2>
    <p class="sec-sub">下面是一本真实的 HSpace 私密合集(含 Markdown 与 HTML)。输入密码,你就完成了一次接收方的完整体验。</p>
    <a class="try" href="https://q0i7otn.zhanjian.space" target="_blank" rel="noopener">
      <span class="lk">🔒</span>
      <span class="ta"><span class="tu">q0i7otn.zhanjian.space</span><span class="th">一本 3 篇的册子 · 访问密码 <b>1024</b></span></span>
      <span class="go">→</span>
    </a>
  </div></section>

  <section id="how"><div class="wrap">
    <h2>三步发走</h2>
    <p class="sec-sub">在编辑器里,或直接在 AI 对话里。</p>
    <div class="steps">
      ${step("1", "打开文件或文件夹", "任意 .html / .md 文件,或右键一个文件夹发布为合集。")}
      ${step("2", "一键发布", "点云图标,自动生成 4 位密码,内容上传到边缘。")}
      ${step("3", "链接 + 密码发走", "两者一起进剪贴板,微信 / 邮件里一次粘贴,交给该看的人。")}
    </div>
  </div></section>

  <section id="features" class="band"><div class="wrap">
    <h2>为 AI 编程工作流而生</h2>
    <p class="sec-sub">内容诞生在编辑器和 AI 对话里,分享也应该在那里发生。发布侧匿名,分发侧有回执。</p>
    <div class="feats">
      ${feature("📝", "Markdown 成刊", "发布 .md 自动渲染成排版精良的阅读页:标题、表格、代码块,亮暗双主题。")}
      ${feature("📚", "文档合集", "一批 md/html 打包成一个链接、一个密码、一个目录页,篇间自由导航。")}
      ${feature("👥", "每人一链", "给每个接收者一个专属密码:谁看了、看了几次一清二楚,踢掉一个人不用换所有人的密码。")}
      ${feature("👁", "访问回执", "在面板里看到每个链接被打开了多少次——对方到底看没看,一目了然。")}
      ${feature("🤖", "AI 可直接调用", "MCP server 让 Claude / Cursor 在对话里直接发布;OpenAPI 规范接入 GPT Actions 等。")}
      ${feature("🛡", "边缘密码网关", "密码在边缘校验,签名 Cookie 24 小时免重输,防暴力破解。")}
    </div>
  </div></section>

  <section id="faq"><div class="wrap">
    <h2>你可能想问</h2>
    <div class="faqs">
      <details><summary>内容会被搜索引擎收录吗?</summary><p>不会。所有分享页面都带 noindex,且必须输入密码才能看到内容——链接被转发也没关系,没有密码就是一堵墙。</p></details>
      <details><summary>内容存在哪里?保留多久?</summary><p>内容加密传输后存储在 Cloudflare 全球边缘(R2)。匿名分享最长 7 天自动失效;你也可以随时手动删除,链接立即失效。</p></details>
      <details><summary>发错了 / 不想给某人看了怎么办?</summary><p>随时改密码(旧密码立即失效)或直接删除。用「每人一链」时,可以只撤销某一个人的密码,其他人不受影响。</p></details>
      <details><summary>免费吗?有什么限制?</summary><p>匿名免费即用:单文件 ≤ 1MB、最长 7 天有效、每天 50 次。禁止钓鱼与恶意内容,违规会被下架。</p></details>
      <details><summary>可以自己部署吗?</summary><p>可以。前后端完全开源(MIT),后端是一个 Cloudflare Worker,照 <a href="${GITHUB}" target="_blank" rel="noopener">README</a> 十分钟即可拥有自己的实例,插件与 MCP 均可指向自建地址。</p></details>
    </div>
  </div></section>

  <section class="cta-band band"><div class="wrap">
    <h2>下一个 demo 写完,试试这样发</h2>
    <div class="cta">
      <a class="btn btn-p" href="${MARKETPLACE}" target="_blank" rel="noopener">安装 VS Code 插件</a>
      <a class="btn btn-s" href="${OPENVSX}" target="_blank" rel="noopener">Cursor / Open VSX</a>
    </div>
  </div></section>

  <footer><div class="wrap">
    <div>© 2026 HSpace · AI 时代的定向分享</div>
    <div class="links">
      <a href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>
      <a href="${MARKETPLACE}" target="_blank" rel="noopener">Marketplace</a>
      <a href="/privacy">隐私</a>
      <a href="/terms">条款</a>
      <a href="/report">举报</a>
    </div>
  </div></footer>
</body></html>`;
}
