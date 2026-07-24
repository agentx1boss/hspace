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
    // 不用带引号的 href="#jia" 形式 —— 返回值经 JSON.stringify 转义后引号变成 \"，
    // 该原始子串本就永远不会出现，会让断言恒真、测不出回归。
    // 也不能只查裸 slug "jia"：页脚品牌链接固定含 "zhanjian.space"，其中
    // "...zhan[jia]n..." 恰好包含子串 "jia"，会导致断言对任何输入都恒假失败
    // (与 TOC 是否渲染无关,已用临时脚本验证)。改查 "#jia"(锚点 hash 前缀+slug):
    // 该子串在转义后的 <script> 字符串里原样保留(# 和字母都不被转义),且不会与
    // 任何 CSS 十六进制色值(如 #1A1D24,全是十六进制数字)或页脚 URL 混淆,
    // 因此能在 1 条目 TOC 被误渲染时真正失败(已临时把 html.ts 的 >=3 改成 >=1
    // 验证过:此断言会失败,证明它确实起到回归防护作用)。
    expect(out).not.toContain("#jia");
  });
  it("prefs 时含字号/宽度按钮", () => {
    const out = readerWidget({ toc: [], prefs: true });
    // 同上:内联 <script> 字符串字面量中的引号被转义为 \"
    expect(out).toContain('data-size=\\"l\\"');
    expect(out).toContain('data-width=\\"n\\"');
  });
  it("独立无 nav(仅偏好)时胶囊标签为「阅读工具」而非「目录」", () => {
    const out = readerWidget({ toc: [], prefs: true });
    // 精确定位 pill 按钮的标签文本:pill 是唯一以 `<标签></button>` 收尾的元素,
    // 转义后表现为 `<标签></button>`(`<`→`<`,`>` 不转义)。据此判别 pill
    // 文案,不会与 catch 兜底链接的「← 目录」或 TOC/篇目段的「目录」标题混淆。
    expect(out).not.toContain("目录\\u003c/button>"); // pill 不应再是「目录」
    expect(out).toContain("阅读工具\\u003c/button>"); // 无 nav 时 pill 应为「阅读工具」
  });
  it("桌面(≥1100px)隐藏悬浮胶囊", () => {
    const out = readerWidget({ toc: [], prefs: true });
    // Shadow <style> 内应有桌面隐藏规则;该子串唯一,不与面板默认 display:none 混淆
    expect(out).toContain("@media(min-width:1100px){.pill,.panel{display:none");
  });
});
