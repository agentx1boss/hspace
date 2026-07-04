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


type Lang = "en" | "zh";
const L: Record<Lang, Record<string, string>> = {
  en: {
    htmllang: "en",
    title: "HSpace — Ship your AI-built demo to exactly the right people",
    desc: "The HTML demo or Markdown doc your AI just wrote — turn it into a link + password: see who opened it, revoke anytime, iterate without changing the link. Targeted sharing for Cursor / Claude Code developers.",
    ogTitle: "HSpace — Ship to one, not to all.",
    ogDesc: "One link + password: see who opened it, revoke anytime, iterate without changing the link.",
    navHow: "How it works", navFeat: "Features", navFaq: "FAQ", install: "Install",
    heroTag: "Built for AI coding · Targeted sharing, not public hosting",
    heroH1: `Ship <span class="hl">to one</span>, not to all.`,
    heroLead: "The HTML demo or Markdown doc Cursor / Claude Code just wrote — turn it into a link + password for teammates and clients: see who opened it, revoke anytime, iterate without changing the link.",
    tension: "Publish anonymously, share accountably.",
    ctaInstall: "Install the VS Code extension", ctaGithub: "View on GitHub",
    mockSub: "AI-generated proposal · expires in 7 days", pwLabel: "Password",
    copied: "Link & password copied — just paste",
    s1h: "Your side: one click in the editor",
    s1sub: "Done writing = done sharing. Click the cloud icon and link+password hit your clipboard; the sidebar shows receipts, recipients and versions.",
    vsRecent: "HSPACE · RECENT",
    vsColl: "Q3 plan (collection · 5)", vsArch: "architecture-review.md",
    vsToast: "Published: a7k2m9x.zhanjian.space (password 4831, link & password copied)",
    vsOpen: "Open", vsChpw: "Change password",
    s1cap: "VS Code / Cursor extension · or publish right inside Claude via MCP",
    s2h: "Their side: one password, the whole thing",
    s2sub: "Table of contents, per-doc reading, cross-doc navigation — all behind one link.",
    tocTitle: "Q3 Growth Plan", tocMeta: "5 docs · shared 2026-07",
    d1: "Overview & goals", d2: "Data analysis", d3: "Channel strategy", d4: "Budget & timeline", d5: "Appendix: competitors",
    capToc: "Collection index", capRead: "Markdown doc · sidebar nav",
    readH: "Data analysis", tMetric: "Metric",
    diffH: "Not another HTML host",
    diffSub: "Regular hosts race to publish to the world. Sharing with teammates and clients needs a different toolkit.",
    anti: "Not a: file drive · collab editor · site builder · public gallery.",
    c1t: "🚀 Out in 30 seconds", c1b: "Zero signup, zero config — publish from your editor or an AI chat, link+password in one paste. Others gate content behind paid tiers and setup; here it's the default.",
    c2t: "🎯 Sent wrong? Take it back", c2b: "Change the password to revoke; per-recipient links mean kicking one person out doesn't change everyone's password; you get receipts on who opened it and how often.",
    c3t: "🔁 The link stays live", c3b: "AI iterates the content, the link stays the same — update after review comments, roll back to any version. No more “final_v3” links.",
    tryH: "Try it yourself",
    trySub: "Below is a real password-gated HSpace collection (Markdown + HTML). Enter the password and you’ve just been a recipient.",
    tryTh: `A 3-doc collection · password <b>1024</b>`,
    howH: "Three steps to send", howSub: "In your editor, or right in an AI chat.",
    st1t: "Open a file or folder", st1b: "Any .html / .md file, or right-click a folder to publish a collection.",
    st2t: "Publish in one click", st2b: "Click the cloud icon; a 4-digit password is generated and content goes to the edge.",
    st3t: "Send link + password", st3b: "Both land on your clipboard; one paste into Slack / email, to the right people.",
    featH: "Built for the AI coding workflow",
    featSub: "Content is born in your editor and AI chats — sharing should happen there too. Publish anonymously, share accountably.",
    f1t: "Markdown, beautifully published", f1b: "Publish .md and it renders into a clean reading page: headings, tables, code blocks, light/dark themes.",
    f2t: "Document collections", f2b: "Bundle a batch of md/html into one link, one password, one table of contents with cross-doc nav.",
    f3t: "Per-recipient links", f3b: "Give each recipient their own password: know who opened it and how often; kick one out without changing everyone else's.",
    f4t: "View receipts", f4b: "See how many times each link was opened, right in the panel — whether they actually looked, at a glance.",
    f5t: "Callable by AI", f5b: "An MCP server lets Claude / Cursor publish inside the chat; an OpenAPI spec plugs into GPT Actions and agents.",
    f6t: "Edge password gate", f6b: "Passwords verified at the edge, signed cookie remembers for 24h, brute-force locked out.",
    faqH: "You might ask",
    faqQ1: "Will it get indexed by search engines?", faqA1: "No. Every shared page is noindex and requires a password — even if the link is forwarded, without the password it's a wall.",
    faqQ2: "Where is content stored, and for how long?", faqA2: "Content is sent over HTTPS and stored at Cloudflare's edge (R2); passwords are stored only as one-way hashes, never plaintext. Anonymous shares expire in 7 days at most; you can also delete anytime and the link goes dark immediately.",
    faqQ3: "Sent to the wrong person / want to cut access?", faqA3: "Change the password (the old one dies instantly) or delete it. With per-recipient links, you can revoke just one person without affecting the others.",
    faqQ4: "Is it free? Any limits?", faqA4: "Core capabilities are free right now — password sharing, collections, receipts, per-recipient links, versioning, all un-gated. Anonymous & instant: single file ≤ 1MB, up to 7 days, 50/day; phishing and malicious content are prohibited and taken down. Permanent links, custom branding and team spaces may come to Pro/Team later; core stays free and open source.",
    faqQ5: "Can I self-host?", faqA5_pre: "Yes. Front and back end are fully open source (MIT); the backend is a Cloudflare Worker — follow the ", faqA5_link: "README", faqA5_post: " and you have your own instance in ten minutes; the extension and MCP can point at it.",
    ctaBandH: "Next demo you build, try sharing it this way",
    ctaVsx: "Cursor / Open VSX",
    flinkPrivacy: "Privacy", flinkTerms: "Terms", flinkReport: "Report",
    switchLabel: "中文",
  },
  zh: {
    htmllang: "zh",
    title: "HSpace — 稿出即递,点开即读,心里有数",
    desc: "稿出即递,点开即读,心里有数——AI 写完的 demo/文档,一键变成「链接 + 密码」只给该看的人。为 Cursor / Claude Code 开发者而生的定向分享。",
    ogTitle: "HSpace — 稿出即递,点开即读,心里有数",
    ogDesc: "一键变成「链接 + 密码」:谁看了有回执,发错了随时撤回,链接不变可迭代。",
    navHow: "如何使用", navFeat: "功能", navFaq: "FAQ", install: "安装插件",
    heroTag: "为 AI 编程而生 · 定向分享,不是公开托管",
    heroH1: `<span class="hl">稿出即递</span>,点开即读,心里有数`,
    heroLead: "Cursor / Claude Code 刚出的稿——HTML demo、Markdown 方案,一键变成「链接 + 密码」发给同事和客户。Markdown 自动排成阅读页、HTML 原样能跑,对方点开就能看;谁看了有回执,发错了随时撤回,链接不变可迭代。",
    tension: "发布侧匿名,分发侧有回执。",
    ctaInstall: "安装 VS Code 插件", ctaGithub: "在 GitHub 查看",
    mockSub: "AI 生成的方案 · 7 天后自动失效", pwLabel: "访问密码",
    copied: "链接和密码已复制,粘贴发走即可",
    s1h: "你这边:编辑器里点一下",
    s1sub: "写完就是发完。云图标一点,链接+密码进剪贴板;侧栏面板看回执、管访问人、升版本。",
    vsRecent: "HSPACE · 最近发布",
    vsColl: "Q3 方案(合集 · 5 篇)", vsArch: "架构评审.md",
    vsToast: "已发布:a7k2m9x.zhanjian.space(密码 4831,链接和密码已复制)",
    vsOpen: "浏览器打开", vsChpw: "修改密码",
    s1cap: "VS Code / Cursor 插件 · 也可在 Claude 对话里经 MCP 直接发布",
    s2h: "对方那边:输一次密码,通览全部",
    s2sub: "目录、逐篇阅读、篇间导航,全在一个链接里。",
    tocTitle: "Q3 增长方案", tocMeta: "5 篇 · 2026-07 分享",
    d1: "总览与目标", d2: "数据分析", d3: "渠道策略", d4: "预算与排期", d5: "附录:竞品对比",
    capToc: "合集目录页", capRead: "Markdown 篇目 · 侧栏导航",
    readH: "数据分析", tMetric: "指标",
    diffH: "不是又一个 HTML 托管",
    diffSub: "常规托管都在抢「发布到全世界」;给同事和客户看的东西,要的是另一套能力。",
    anti: "我们不是:网盘 · 协作工具 · 建站平台 · 公开画廊。",
    c1t: "🚀 30 秒发出去", c1b: "零注册、零配置,编辑器或 AI 对话里一键发布,链接+密码一次粘贴。别家的密码保护要付费套餐加一堆配置,这里是默认。",
    c2t: "🎯 发错了?收得回", c2b: "改密码即撤回;每人一链,踢掉一个人不用换所有人的密码;谁看了、看了几次,有回执。",
    c3t: "🔁 链接是活的", c3b: "AI 迭代内容,链接不变——review 意见改完直接更新,历史版本可回滚。不用再发「最终版_v3」新链接。",
    tryH: "亲自体验一次",
    trySub: "下面是一本真实的 HSpace 私密合集(含 Markdown 与 HTML)。输入密码,你就完成了一次接收方的完整体验。",
    tryTh: `一本 3 篇的册子 · 访问密码 <b>1024</b>`,
    howH: "三步发走", howSub: "在编辑器里,或直接在 AI 对话里。",
    st1t: "打开文件或文件夹", st1b: "任意 .html / .md 文件,或右键一个文件夹发布为合集。",
    st2t: "一键发布", st2b: "点云图标,自动生成 4 位密码,内容上传到边缘。",
    st3t: "链接 + 密码发走", st3b: "两者一起进剪贴板,微信 / 邮件里一次粘贴,交给该看的人。",
    featH: "为 AI 编程工作流而生",
    featSub: "内容诞生在编辑器和 AI 对话里,分享也应该在那里发生。发布侧匿名,分发侧有回执。",
    f1t: "Markdown 成刊", f1b: "发布 .md 自动渲染成排版精良的阅读页:标题、表格、代码块,亮暗双主题。",
    f2t: "文档合集", f2b: "一批 md/html 打包成一个链接、一个密码、一个目录页,篇间自由导航。",
    f3t: "每人一链", f3b: "给每个接收者一个专属密码:谁看了、看了几次一清二楚,踢掉一个人不用换所有人的密码。",
    f4t: "访问回执", f4b: "在面板里看到每个链接被打开了多少次——对方到底看没看,一目了然。",
    f5t: "AI 可直接调用", f5b: "MCP server 让 Claude / Cursor 在对话里直接发布;OpenAPI 规范接入 GPT Actions 等。",
    f6t: "边缘密码网关", f6b: "密码在边缘校验,签名 Cookie 24 小时免重输,防暴力破解。",
    faqH: "你可能想问",
    faqQ1: "内容会被搜索引擎收录吗?", faqA1: "不会。所有分享页面都带 noindex,且必须输入密码才能看到内容——链接被转发也没关系,没有密码就是一堵墙。",
    faqQ2: "内容存在哪里?保留多久?", faqA2: "内容经 HTTPS 传输,存储在 Cloudflare 全球边缘(R2);密码只存单向哈希,不存明文。匿名分享最长 7 天自动失效;你也可以随时手动删除,链接立即失效。",
    faqQ3: "发错了 / 不想给某人看了怎么办?", faqA3: "随时改密码(旧密码立即失效)或直接删除。用「每人一链」时,可以只撤销某一个人的密码,其他人不受影响。",
    faqQ4: "免费吗?有什么限制?", faqA4: "核心能力现在全部免费——密码分享、合集、访问回执、每人一链、版本化,都不阉割。匿名即用:单文件 ≤ 1MB、最长 7 天有效、每天 50 次;禁止钓鱼与恶意内容,违规会被下架。未来永久链接、自定义品牌、团队空间会面向 Pro / Team,核心能力永远免费、开源可自建。",
    faqQ5: "可以自己部署吗?", faqA5_pre: "可以。前后端完全开源(MIT),后端是一个 Cloudflare Worker,照 ", faqA5_link: "README", faqA5_post: " 十分钟即可拥有自己的实例,插件与 MCP 均可指向自建地址。",
    ctaBandH: "下一个 demo 写完,试试这样发",
    ctaVsx: "Cursor / Open VSX",
    flinkPrivacy: "隐私", flinkTerms: "条款", flinkReport: "举报",
    switchLabel: "EN",
  },
};

export function landingPage(lang: Lang = "en"): string {
  const s = L[lang];
  const other = lang === "en" ? "?lang=zh" : "?lang=en";
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${s.title}</title>
${FAVICON_LINK}
<link rel="canonical" href="${SITE}/">
<meta name="description" content="${s.desc}">
<meta property="og:title" content="${s.ogTitle}">
<meta property="og:description" content="${s.ogDesc}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/">
<meta property="og:image" content="${SITE}/og-card.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${s.ogTitle}">
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
  .lead{font-size:clamp(16px,2.4vw,19px);color:var(--muted);max-width:36rem;margin:0 auto 14px}
  .tension{font-size:13.5px;color:var(--muted);font-style:italic;margin:0 auto 30px}
  .anti{text-align:center;color:var(--muted);font-size:13.5px;margin:-28px auto 36px;letter-spacing:.02em}
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
      <a class="ghost" href="#how">${s.navHow}</a>
      <a class="ghost" href="#features">${s.navFeat}</a>
      <a class="ghost" href="#faq">FAQ</a>
      <a class="ghost" href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>
      <a class="btn btn-p" href="${MARKETPLACE}" target="_blank" rel="noopener">${s.install}</a>
      <a class="ghost" href="${other}">${s.switchLabel}</a>
    </nav>
  </div></header>

  <section class="hero"><div class="wrap">
    <span class="tag">${s.heroTag}</span>
    <h1>${s.heroH1}</h1>
    <p class="lead">${s.heroLead}</p>
    <p class="tension">${s.tension}</p>
    <div class="cta">
      <a class="btn btn-p" href="${MARKETPLACE}" target="_blank" rel="noopener">${s.ctaInstall}</a>
      <a class="btn btn-s" href="${GITHUB}" target="_blank" rel="noopener">${s.ctaGithub}</a>
    </div>
  </div></section>

  <section class="band"><div class="wrap" style="text-align:center">
    <h2>${s.tryH}</h2>
    <p class="sec-sub">${s.trySub}</p>
    <a class="try" href="https://q0i7otn.zhanjian.space" target="_blank" rel="noopener">
      <span class="lk">🔒</span>
      <span class="ta"><span class="tu">q0i7otn.zhanjian.space</span><span class="th">${s.tryTh}</span></span>
      <span class="go">→</span>
    </a>
  </div></section>

  <section><div class="wrap" style="text-align:center">
    <h2>${s.s1h}</h2>
    <p class="sec-sub">${s.s1sub}</p>
    <div class="vsc">
      <div class="vbar"><div class="dots"><i></i><i></i><i></i></div><span class="vt">pricing-demo.html — my-project</span></div>
      <div class="vbody">
        <div class="vside">
          <div class="vh">${s.vsRecent}</div>
          <div class="vi on"><span>🔒</span><span class="nm">pricing-demo.html</span><em>👁 12 · v2</em></div>
          <div class="vi"><span>📖</span><span class="nm">${s.vsColl}</span><em>👁 8</em></div>
          <div class="vi"><span>🔒</span><span class="nm">${s.vsArch}</span><em>👁 3</em></div>
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
          <div class="vtoast"><span class="ok">✓</span>${s.vsToast}
            <div class="vbtns"><span>${s.vsOpen}</span><span>${s.vsChpw}</span></div>
          </div>
        </div>
      </div>
    </div>
    <div style="font-size:13.5px;color:var(--muted);margin-top:12px">${s.s1cap}</div>
  </div></section>

  <section class="band"><div class="wrap">
    <h2>${s.s2h}</h2>
    <p class="sec-sub">${s.s2sub}</p>
    <div class="shots">
      <div>
        <div class="shot">
          <div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="addr">🔒 q3plan.zhanjian.space</div></div>
          <div class="toc">
            <div class="h">${s.tocTitle}</div>
            <div class="m">${s.tocMeta}</div>
            <div class="r"><span class="n">1</span><span>${s.d1}</span><span class="a">→</span></div>
            <div class="r"><span class="n">2</span><span>${s.d2}</span><span class="a">→</span></div>
            <div class="r"><span class="n">3</span><span>${s.d3}</span><span class="a">→</span></div>
            <div class="r"><span class="n">4</span><span>${s.d4}</span><span class="a">→</span></div>
            <div class="r"><span class="n">5</span><span>${s.d5}</span><span class="a">→</span></div>
          </div>
        </div>
        <div class="cap">${s.capToc}</div>
      </div>
      <div>
        <div class="shot">
          <div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="addr">🔒 q3plan.zhanjian.space/2</div></div>
          <div class="read">
            <div class="side">
              <div class="t">${s.tocTitle}</div>
              <div class="i"><span>1</span><span>${s.d1}</span></div>
              <div class="i on"><span>2</span><span>${s.d2}</span></div>
              <div class="i"><span>3</span><span>${s.d3}</span></div>
              <div class="i"><span>4</span><span>${s.d4}</span></div>
            </div>
            <div class="main">
              <div class="h">${s.d2}</div>
              <div class="p" style="width:96%"></div>
              <div class="p" style="width:88%"></div>
              <div class="p" style="width:70%"></div>
              <div class="tb">
                <div class="tr th"><div>${s.tMetric}</div><div>Q1</div><div>Q2</div></div>
                <div class="tr"><div>GMV</div><div>1.2M</div><div>1.5M</div></div>
              </div>
            </div>
          </div>
        </div>
        <div class="cap">${s.capRead}</div>
      </div>
    </div>
  </div></section>

  <section><div class="wrap">
    <h2>${s.diffH}</h2>
    <p class="sec-sub">${s.diffSub}</p>
    <p class="anti">${s.anti}</p>
    <div class="grid3">
      <div class="diff"><h3>${s.c1t}</h3><p>${s.c1b}</p></div>
      <div class="diff"><h3>${s.c2t}</h3><p>${s.c2b}</p></div>
      <div class="diff"><h3>${s.c3t}</h3><p>${s.c3b}</p></div>
    </div>
  </div></section>


  <section id="how"><div class="wrap">
    <h2>${s.howH}</h2>
    <p class="sec-sub">${s.howSub}</p>
    <div class="steps">
      ${step("1", s.st1t, s.st1b)}
      ${step("2", s.st2t, s.st2b)}
      ${step("3", s.st3t, s.st3b)}
    </div>
  </div></section>

  <section id="features" class="band"><div class="wrap">
    <h2>${s.featH}</h2>
    <p class="sec-sub">${s.featSub}</p>
    <div class="feats">
      ${feature("📝", s.f1t, s.f1b)}
      ${feature("📚", s.f2t, s.f2b)}
      ${feature("🤖", s.f5t, s.f5b)}
    </div>
  </div></section>

  <section id="faq"><div class="wrap">
    <h2>${s.faqH}</h2>
    <div class="faqs">
      <details><summary>${s.faqQ1}</summary><p>${s.faqA1}</p></details>
      <details><summary>${s.faqQ2}</summary><p>${s.faqA2}</p></details>
      <details><summary>${s.faqQ3}</summary><p>${s.faqA3}</p></details>
      <details><summary>${s.faqQ4}</summary><p>${s.faqA4}</p></details>
      <details><summary>${s.faqQ5}</summary><p>${s.faqA5_pre}<a href="${GITHUB}" target="_blank" rel="noopener">${s.faqA5_link}</a>${s.faqA5_post}</p></details>
    </div>
  </div></section>

  <section class="cta-band band"><div class="wrap">
    <h2>${s.ctaBandH}</h2>
    <div class="cta">
      <a class="btn btn-p" href="${MARKETPLACE}" target="_blank" rel="noopener">${s.ctaInstall}</a>
      <a class="btn btn-s" href="${OPENVSX}" target="_blank" rel="noopener">${s.ctaVsx}</a>
    </div>
  </div></section>

  <footer><div class="wrap">
    <div>© 2026 HSpace · Ship to one, not to all.</div>
    <div class="links">
      <a href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>
      <a href="${MARKETPLACE}" target="_blank" rel="noopener">Marketplace</a>
      <a href="/privacy">${s.flinkPrivacy}</a>
      <a href="/terms">${s.flinkTerms}</a>
      <a href="/report">${s.flinkReport}</a>
    </div>
  </div></footer>
  <script>(function(){try{
    if(navigator.doNotTrack==='1'||window.doNotTrack==='1'||navigator.msDoNotTrack==='1')return;
    var L='${lang}';
    function e(n){try{navigator.sendBeacon('/e?n='+n+'&l='+L)}catch(_){}}
    e('pv');
    document.addEventListener('click',function(ev){
      var a=ev.target.closest&&ev.target.closest('a');if(!a)return;var h=a.href||'';
      if(h.indexOf('marketplace.visualstudio.com')>-1)e('install');
      else if(h.indexOf('open-vsx.org')>-1)e('vsx');
      else if(h.indexOf('q0i7otn')>-1)e('try');
      else if(h.indexOf('github.com')>-1)e('gh');
    },true);
  }catch(_){}})();</script>
</body></html>`;
}
