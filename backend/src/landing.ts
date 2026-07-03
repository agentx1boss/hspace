// HSpace 落地页 —— 自包含单页,内联样式与 SVG,无外部请求。可被搜索引擎索引。

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
<title>HSpace — 私密分享 AI 生成的内容</title>
<meta name="description" content="一键把 AI 生成的 HTML / Markdown 发布成「链接 + 密码」,只交给该看的人。不是托管,是私域分发。">
<meta property="og:title" content="HSpace — 私密分享 AI 生成的内容">
<meta property="og:description" content="一键把 AI 生成的 HTML / Markdown 发布成链接 + 密码,只给该看的人。">
<meta property="og:type" content="website">
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
         background:color-mix(in srgb,var(--bg) 82%,transparent);border-bottom:1px solid var(--border)}
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

  @media(max-width:720px){.grid3,.steps,.feats{grid-template-columns:1fr}.hero{padding:52px 0 44px}}
</style></head>
<body>
  <header><div class="wrap">
    <a class="logo" href="/"><span class="tile">${MARK}</span>HSpace</a>
    <nav class="nav">
      <a class="ghost" href="#how">如何使用</a>
      <a class="ghost" href="#features">功能</a>
      <a class="ghost" href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>
      <a class="btn btn-p" href="${MARKETPLACE}" target="_blank" rel="noopener">安装插件</a>
    </nav>
  </div></header>

  <section class="hero"><div class="wrap">
    <span class="tag">私域分发,不是公开托管</span>
    <h1>私密分享 <span class="hl">AI 生成</span>的内容</h1>
    <p class="lead">一键把 AI 帮你写好的 HTML 或 Markdown 发布成「链接 + 密码」,像递名片一样,只交给该看的人。</p>
    <div class="cta">
      <a class="btn btn-p" href="${MARKETPLACE}" target="_blank" rel="noopener">安装 VS Code 插件</a>
      <a class="btn btn-s" href="${GITHUB}" target="_blank" rel="noopener">在 GitHub 查看</a>
    </div>

    <div class="mock">
      <div class="row">
        <div class="lk">🔒</div>
        <div><div class="url">a7k2m9.zhanjian.space</div><div class="sub">AI 生成的方案 · 7 天后自动失效</div></div>
      </div>
      <div class="pw"><span class="k">访问密码</span><span class="v">4831</span></div>
      <div class="copied"><span class="d"></span>链接和密码已复制,粘贴发走即可</div>
    </div>
  </div></section>

  <section class="band"><div class="wrap">
    <h2>不是又一个 HTML 托管</h2>
    <p class="sec-sub">常规托管都在抢「发布到全世界」。HSpace 反着来。</p>
    <div class="grid3">
      <div class="diff"><h3>🔐 默认私密</h3><p>每次发布自动生成密码,没有密码谁也看不到,不被搜索引擎索引,不怕转发扩散。</p></div>
      <div class="diff"><h3>📄 内容为主</h3><p>分发的是一份内容——demo、报告、方案,不是一个网站。没有构建、没有配置,只有「发出去」。</p></div>
      <div class="diff"><h3>🎯 可控可撤回</h3><p>随时改密码、删链接,立即失效;到期自动清理。链接是你可控的资产。</p></div>
    </div>
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
    <h2>为分享 AI 产物而生</h2>
    <p class="sec-sub">内容诞生在与 AI 的对话里,分享也应该无缝衔接。</p>
    <div class="feats">
      ${feature("📝", "Markdown 成刊", "发布 .md 自动渲染成排版精良的阅读页:标题、表格、代码块,亮暗双主题。")}
      ${feature("📚", "文档合集", "一批 md/html 打包成一个链接、一个密码、一个目录页,篇间自由导航。")}
      ${feature("👁", "访问回执", "在面板里看到每个链接被打开了多少次——对方到底看没看,一目了然。")}
      ${feature("🤖", "AI 可直接调用", "MCP server 让 Claude / Cursor 在对话里直接发布;OpenAPI 规范接入 GPT Actions 等。")}
      ${feature("🛡", "边缘密码网关", "密码在边缘校验,签名 Cookie 24 小时免重输,防暴力破解。")}
      ${feature("⚡", "无服务器架构", "跑在 Cloudflare(R2 + D1 + KV),全球边缘,开源可自建。")}
    </div>
  </div></section>

  <section class="cta-band"><div class="wrap">
    <h2>把下一份 AI 产出,私密地发出去</h2>
    <div class="cta">
      <a class="btn btn-p" href="${MARKETPLACE}" target="_blank" rel="noopener">安装 VS Code 插件</a>
      <a class="btn btn-s" href="${OPENVSX}" target="_blank" rel="noopener">Cursor / Open VSX</a>
    </div>
  </div></section>

  <footer><div class="wrap">
    <div>© 2026 HSpace · 私密分享 AI 生成的内容</div>
    <div class="links">
      <a href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>
      <a href="${MARKETPLACE}" target="_blank" rel="noopener">Marketplace</a>
      <a href="${OPENVSX}" target="_blank" rel="noopener">Open VSX</a>
    </div>
  </div></footer>
</body></html>`;
}
