import { describe, it, expect } from "vitest";
import { sanitizeRawHtml, safeUrl } from "../src/sanitize";

describe("safeUrl 协议闸门", () => {
  it("放行相对路径、锚点、http(s)、mailto", () => {
    expect(safeUrl("/a/b")).toBe("/a/b");
    expect(safeUrl("#sec")).toBe("#sec");
    expect(safeUrl("https://example.com/x?a=1")).toBe("https://example.com/x?a=1");
    expect(safeUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
  });
  it("挡 javascript: 及其大小写/空白/实体变形", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeUrl(" javascript:alert(1)")).toBeNull();
    expect(safeUrl("java\tscript:alert(1)")).toBeNull();
    expect(safeUrl("java&Tab;script:alert(1)")).toBeNull();
    expect(safeUrl("&#106;avascript:alert(1)")).toBeNull();
    expect(safeUrl("&#x6a;avascript:alert(1)")).toBeNull();
  });
  it("挡 vbscript: / data:text/html / file: / blob:", () => {
    expect(safeUrl("vbscript:msgbox")).toBeNull();
    expect(safeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
    expect(safeUrl("blob:https://x/y")).toBeNull();
  });
  it("data: 只放行 base64 位图,svg+xml 不放行(可带脚本)", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(safeUrl(png)).toBe(png);
    expect(safeUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBeNull();
  });
});

describe("sanitizeRawHtml", () => {
  it("保留排版类标签", () => {
    expect(sanitizeRawHtml("<b>粗</b><br><details><summary>S</summary>正文</details>")).toBe(
      "<b>粗</b><br><details><summary>S</summary>正文</details>",
    );
  });
  it("<script> 连正文一起吃掉", () => {
    const out = sanitizeRawHtml('<script src="https://evil.example/x.js"></script>');
    expect(out).toBe("");
    expect(sanitizeRawHtml("<script>alert(1)</script>")).toBe("");
    expect(sanitizeRawHtml("<p>前</p><script>alert(1)</script><p>后</p>")).toBe("<p>前</p><p>后</p>");
  });
  it("截断的 <script 也不留(吃到结尾)", () => {
    expect(sanitizeRawHtml("<script>alert(1)")).toBe("");
  });
  it("嵌套截断绕过拼不回标签", () => {
    // `<scr<script>` 整体被当成一个未知标签 `scr` 丢掉,残渣只剩转义文本
    const out = sanitizeRawHtml("<scr<script>ipt>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).toBe("ipt&gt;alert(1)");
  });
  it("<style> / <iframe> / <svg> / <object> 连内容一起丢", () => {
    expect(sanitizeRawHtml("<style>body{background:url(https://evil.example/x)}</style>")).toBe("");
    expect(sanitizeRawHtml('<iframe src="https://evil.example"></iframe>')).toBe("");
    expect(sanitizeRawHtml('<svg onload="alert(1)"><circle /></svg>')).toBe("");
    expect(sanitizeRawHtml('<object data="x.swf"></object>')).toBe("");
  });
  it("剥事件处理属性与 style 属性,保留白名单属性", () => {
    const out = sanitizeRawHtml('<div onclick="alert(1)" style="color:red" id="a">x</div>');
    expect(out).toBe('<div id="a">x</div>');
    expect(sanitizeRawHtml('<img src="/a.png" onerror="alert(1)" alt="A">')).toBe('<img src="/a.png" alt="A">');
  });
  it("挡 href/src 里的危险协议,保留安全的", () => {
    expect(sanitizeRawHtml('<a href="javascript:alert(1)">点</a>')).toBe("<a>点</a>");
    expect(sanitizeRawHtml('<a href="https://ok.example">点</a>')).toBe('<a href="https://ok.example">点</a>');
  });
  it("外链图片按 2026-07-28 决策保留(img-src 放行 https:)", () => {
    expect(sanitizeRawHtml('<img src="https://cdn.example/a.png" alt="A">')).toBe(
      '<img src="https://cdn.example/a.png" alt="A">',
    );
  });
  it("未命中白名单的标签丢标签、留文字", () => {
    expect(sanitizeRawHtml("<marquee>跑</marquee>")).toBe("跑");
    expect(sanitizeRawHtml('<form action="https://evil.example"><p>字</p></form>')).toBe("<p>字</p>");
    expect(sanitizeRawHtml('<input type="password" name="pw">')).toBe("");
  });
  it("target=_blank 一律配 noopener", () => {
    expect(sanitizeRawHtml('<a href="https://x.example" target="_blank">x</a>')).toBe(
      '<a href="https://x.example" target="_blank" rel="noopener noreferrer">x</a>',
    );
    // 自带的 rel 不作数,由我们决定
    expect(sanitizeRawHtml('<a href="https://x.example" target="_top" rel="opener">x</a>')).toBe(
      '<a href="https://x.example">x</a>',
    );
  });
  it("空元素只丢自己,不吞掉后面的内容", () => {
    // 回归:source/meta/link/base 是空元素,永远等不到闭合标签 —— 若按「连内容一起吃」
    // 处理会把整段后文吃光,等于线上一部署就悄悄截断已发布的老稿
    expect(sanitizeRawHtml('<div><picture><source srcset="a.webp"><img src="/b.png" alt="B"></picture><p>AFTER</p></div>')).toBe(
      '<div><img src="/b.png" alt="B"><p>AFTER</p></div>',
    );
    expect(sanitizeRawHtml('<meta charset="utf-8"><p>AFTER</p>')).toBe("<p>AFTER</p>");
    expect(sanitizeRawHtml('<link rel="stylesheet" href="https://evil.example/x.css"><p>AFTER</p>')).toBe("<p>AFTER</p>");
    expect(sanitizeRawHtml('<base href="https://evil.example/"><p>AFTER</p>')).toBe("<p>AFTER</p>");
    expect(sanitizeRawHtml('<embed src="x.swf"><p>AFTER</p>')).toBe("<p>AFTER</p>");
  });
  it("容器型危险元素连内容一起吃", () => {
    expect(sanitizeRawHtml("<textarea><p>x</p></textarea><p>AFTER</p>")).toBe("<p>AFTER</p>");
    expect(sanitizeRawHtml("<noscript><p>x</p></noscript><p>AFTER</p>")).toBe("<p>AFTER</p>");
  });
  it("缺闭合标签只丢标签,不截断后文(原始文本元素例外)", () => {
    // 非原始文本元素:内容继续走净化,后文完整保留
    expect(sanitizeRawHtml("<noscript><p>x</p>")).toBe("<p>x</p>");
    expect(sanitizeRawHtml("<option>甲<option>乙")).toBe("甲乙");
    // 原始文本元素:少了闭合就吃到结尾,不把源码当正文倒出来
    expect(sanitizeRawHtml("<style>body{color:red}")).toBe("");
    expect(sanitizeRawHtml("<textarea>x")).toBe("");
  });
  it("正文不许带 class —— 会撞上阅读页外壳的 CSS", () => {
    // .lb{position:fixed;inset:0;z-index:2147483646} + .lb.open{display:flex} 是图片
    // lightbox 的样式;正文若能自带 class,一个链接就能盖满全屏做钓鱼点击层
    expect(sanitizeRawHtml('<a class="lb open" href="https://evil.example/login">重新输入密码</a>')).toBe(
      '<a href="https://evil.example/login">重新输入密码</a>',
    );
    expect(sanitizeRawHtml('<div class="side">x</div>')).toBe("<div>x</div>");
    expect(sanitizeRawHtml('<div class="progress"><i></i></div>')).toBe("<div><i></i></div>");
  });
  it("正文占不到外壳的 id 命名空间(DOM clobbering)", () => {
    expect(sanitizeRawHtml('<div id="hspace-nav-host">x</div>')).toBe("<div>x</div>");
    expect(sanitizeRawHtml('<div id="my-anchor">x</div>')).toBe('<div id="my-anchor">x</div>');
  });
  it("注释 / DOCTYPE / 处理指令丢掉", () => {
    expect(sanitizeRawHtml("<!-- <script>alert(1)</script> -->a")).toBe("a");
    expect(sanitizeRawHtml("<!doctype html>a")).toBe("a");
  });
  it("标签之外的 < > 一律转义", () => {
    expect(sanitizeRawHtml("a < b > c")).toBe("a &lt; b &gt; c");
  });
  it("属性值里的引号被转义,拼不出新属性", () => {
    const out = sanitizeRawHtml('<div title=\'x" onclick="alert(1)\'>y</div>');
    expect(out).not.toContain("onclick=\"alert");
    expect(out).toContain("&quot;");
  });
});
