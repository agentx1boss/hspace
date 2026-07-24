import { describe, it, expect } from "vitest";
import { readerWidget } from "../src/html";

describe("readerWidget", () => {
  it("有 nav 时含篇目与位置角标", () => {
    const out = readerWidget({
      nav: { collectionTitle: "教程", docs: [{ index: 1, title: "一" }, { index: 2, title: "二" }], current: 1 },
      toc: [],
      prefs: false,
    });
    expect(out).toContain("hspace-nav-host");
    expect(out).toContain("1/2");
    expect(out).toContain("教程");
  });
  it("toc >=3 时渲染 TOC 链接", () => {
    const toc = [
      { level: 2, text: "甲", slug: "jia" },
      { level: 2, text: "乙", slug: "yi" },
      { level: 2, text: "丙", slug: "bing" },
    ];
    const out = readerWidget({ toc, prefs: true });
    // 返回值是 <script> 内联的 JS 字符串字面量(JSON.stringify(markup)),其中的
    // 原始双引号会被转义为 \" —— 这是必要的合法 JS 语法(浏览器解析 <script> 时会
    // 还原成真实 DOM 属性 href="#jia");因此断言需匹配转义后的形式。
    expect(out).toContain('href=\\"#jia\\"');
    expect(out).toContain('href=\\"#bing\\"');
  });
  it("toc <3 时不渲染 TOC 段", () => {
    const out = readerWidget({ toc: [{ level: 2, text: "甲", slug: "jia" }], prefs: true });
    expect(out).not.toContain('href="#jia"');
  });
  it("prefs 时含字号/宽度按钮", () => {
    const out = readerWidget({ toc: [], prefs: true });
    // 同上:内联 <script> 字符串字面量中的引号被转义为 \"
    expect(out).toContain('data-size=\\"l\\"');
    expect(out).toContain('data-width=\\"n\\"');
  });
});
