import { describe, it, expect } from "vitest";
import { readingPage } from "../src/html";

const toc3 = [
  { level: 2, text: "甲", slug: "jia" },
  { level: 2, text: "乙", slug: "yi" },
  { level: 3, text: "丙", slug: "bing" },
];

describe("readingPage 左侧固定栏", () => {
  it("单篇 ≥3 标题:渲染 .side(TOC + 偏好)、has-side、无篇目列表", () => {
    const out = readingPage({ title: "T", articleHtml: "<p>x</p>", toc: toc3 });
    expect(out).toContain('<body class="has-side">');
    expect(out).toContain('<nav class="side">');
    expect(out).toContain('href="#jia"'); // 左栏 TOC(主文档,未 JSON 转义)
    expect(out).toContain('href="#bing"');
    expect(out).toContain('data-size="l"'); // 左栏偏好按钮
    expect(out).toContain('data-width="n"');
    expect(out).not.toContain("<li>"); // 单篇左栏无合集篇目 <ol><li>
  });
  it("单篇 <3 标题:不渲染 .side、body 不含 has-side", () => {
    const out = readingPage({ title: "T", articleHtml: "<p>x</p>", toc: [{ level: 2, text: "甲", slug: "jia" }] });
    expect(out).toContain('<body class="">');
    expect(out).not.toContain('<nav class="side">');
  });
  it("合集:.side 含篇目列表 + TOC + 偏好", () => {
    const nav = { collectionTitle: "教程", docs: [{ index: 1, title: "一" }, { index: 2, title: "二" }], current: 1 };
    const out = readingPage({ title: "一", articleHtml: "<p>x</p>", toc: toc3, nav });
    expect(out).toContain('<nav class="side">');
    expect(out).toContain('href="/2"'); // 篇目列表
    expect(out).toContain('href="#bing"'); // TOC
    expect(out).toContain('data-size="m"'); // 偏好
  });
  it("左栏偏好接线脚本存在(主文档,设 --reading-size)", () => {
    const out = readingPage({ title: "T", articleHtml: "<p>x</p>", toc: toc3 });
    expect(out).toContain(".side .seg[data-k=");
    expect(out).toContain("--reading-size");
  });
});
