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
});
