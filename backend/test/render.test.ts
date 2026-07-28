import { describe, it, expect } from "vitest";
import { slugify, renderMarkdown } from "../src/render";

describe("slugify", () => {
  it("小写化并连字符化", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });
  it("保留 CJK", () => {
    expect(slugify("快速开始")).toBe("快速开始");
  });
  it("去标点、压缩连字符", () => {
    expect(slugify("A, B & C!")).toBe("a-b-c");
  });
});

describe("renderMarkdown", () => {
  it("为 fenced js 输出 hljs class", () => {
    const { html } = renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain('class="hljs');
    expect(html).toContain("hljs-keyword");
  });
  it("给标题加 id 并抽取 toc", () => {
    const { html, toc } = renderMarkdown("## 快速开始\n\ntext\n\n### 步骤");
    expect(html).toContain('<h2 id="快速开始"');
    expect(html).toContain('class="anchor"');
    expect(toc).toEqual([
      { level: 2, text: "快速开始", slug: "快速开始" },
      { level: 3, text: "步骤", slug: "步骤" },
    ]);
  });
  it("重复标题 slug 去重", () => {
    const { toc } = renderMarkdown("## Setup\n\n## Setup");
    expect(toc.map((t) => t.slug)).toEqual(["setup", "setup-1"]);
  });
  it("未知语言优雅降级为转义纯文本", () => {
    const { html } = renderMarkdown("```nosuchlang\n<a>\n```");
    expect(html).toContain("&lt;a&gt;");
  });
  it("无 h2-h4 标题时 toc 为空", () => {
    expect(renderMarkdown("# Title\n\ntext").toc).toEqual([]);
  });
  it("内嵌原始 HTML:排版标签保留,危险标签/属性剥掉(#19)", () => {
    const { html } = renderMarkdown(
      "<b>粗</b> 与 <span onclick=\"alert(1)\">span</span>\n\n<iframe src=\"https://evil.example\"></iframe>",
    );
    expect(html).toContain("<b>粗</b>");
    expect(html).toContain("<span>span</span>");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<iframe");
  });
  it("markdown 链接/图片过协议闸门", () => {
    expect(renderMarkdown("[x](javascript:alert(1))").html).not.toContain("href");
    expect(renderMarkdown("[x](https://ok.example)").html).toContain('href="https://ok.example"');
    expect(renderMarkdown("![图](javascript:alert(1))").html).not.toContain("<img");
    expect(renderMarkdown("![图](https://cdn.example/a.png)").html).toContain(
      '<img src="https://cdn.example/a.png" alt="图">',
    );
  });
  it("代码块里的 <script> 只是文字", () => {
    const { html } = renderMarkdown("```html\n<script>alert(1)</script>\n```");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;");
  });
  it("GFM 任务列表与表格不受净化影响", () => {
    const { html } = renderMarkdown("- [x] 完成\n- [ ] 待办\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });
  it("TOC 文本剥离行内 markdown(加粗/代码)", () => {
    const { toc } = renderMarkdown("## **加粗**标题\n\n## 普通\n\n## `代码`标题");
    expect(toc.map((t) => t.text)).toEqual(["加粗标题", "普通", "代码标题"]);
  });
});
