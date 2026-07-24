# Markdown 阅读体验升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 HSpace 单篇 Markdown 阅读页加上语法高亮、代码复制、标题锚点、悬浮 TOC/偏好控制器、阅读进度条、图片放大与打印样式。

**Architecture:** 全部在 Cloudflare Worker 边缘渲染(R2 存原文不变)。新增 `backend/src/render.ts` 承载「Markdown→安全 HTML + 标题锚点 + TOC 数据」的纯逻辑(可单测);`backend/src/html.ts` 承载模板、双主题高亮 CSS、统一悬浮控制器与页面交互内联 JS;`backend/src/index.ts` 两处渲染调用改接 `renderMarkdown`。页面自包含,零外部资源。

**Tech Stack:** TypeScript · Cloudflare Workers · marked 18 · marked-highlight · highlight.js(按语言子集注册)· Vitest(纯函数单测)

## Global Constraints

- **自包含**:内联 CSS/JS/SVG,**不引任何外部脚本/字体/图片**(CSP、加载速度、隐私)。
- **存原文、边缘渲染**:R2 存 Markdown 原文,不预处理、不改存储格式;高亮/锚点/TOC 均在渲染时产出。
- **CSP 现状**:仅 `frame-ancestors 'none'`,无 `script-src` 限制 → 内联脚本可用。
- **marked 版本**:`^18.0.5`(已装)。renderer 方法接收单 token 对象,`this.parser.parseInline(token.tokens)` 取内联文本;`marked.lexer` / `marked.walkTokens` / `marked.parser` 均为静态方法。
- **highlight.js 语言子集**(仅注册,控体积):`javascript, typescript, python, json, bash, xml, css, go, rust, sql, diff, yaml`;别名 `js/ts/py/sh/shell/zsh/html/yml`。
- **Worker bundle 体积**:core + ~12 语言 gzip 预算 ≤ ~70KB;`wrangler deploy` 输出复核,超预算削语言集。
- **改完必跑** `cd backend && npx tsc --noEmit`;推 `backend/**` 到 main 触发 CI 自动部署。
- **文案**:托管物叫「稿/Draft」,技术层叫 `page`;取自 `docs/positioning.md`。
- **不做**:阅读时长、手动亮暗切换、Mermaid/公式/任务清单脚注(整个 C 类)。
- **实现优先用 Codex**(用户偏好):编码任务优先交给 Codex。

## File Structure

- **Create** `backend/src/render.ts` — Markdown 渲染纯逻辑:`slugify`、`renderMarkdown`、类型 `TocItem`/`Rendered`。无对 `html.ts` 的依赖(避免循环)。
- **Create** `backend/test/render.test.ts` — render.ts 的 Vitest 单测。
- **Modify** `backend/src/html.ts` — 双主题高亮 CSS + 阅读增强 CSS;`collectionNavWidget`→统一 `readerWidget`;`readingPage` 改选项对象签名并注入交互;`injectCollectionNav` 改调 `readerWidget`。
- **Modify** `backend/src/index.ts` — `:833` 单篇 md、`:871` 合集 md 篇目改用 `renderMarkdown` 并把 `toc` 传入 `readingPage`。
- **Modify** `backend/package.json` — 加依赖 `marked-highlight`、`highlight.js`;devDep `vitest`;script `test`。

---

### Task 1: 工具链与依赖

**Files:**
- Modify: `backend/package.json`
- Create: `backend/test/render.test.ts`(占位,后续任务填充)

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 `npm test`(Vitest);运行时依赖 `marked-highlight` / `highlight.js` 就位。

- [ ] **Step 1: 安装依赖**

```bash
cd backend
npm install marked-highlight highlight.js
npm install -D vitest
```

- [ ] **Step 2: 加 test 脚本**

编辑 `backend/package.json`,在 `"scripts"`(若无则新建)加入:

```json
  "scripts": {
    "test": "vitest run"
  }
```

- [ ] **Step 3: 建一个冒烟测试确认 Vitest 跑得起来**

创建 `backend/test/render.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `cd backend && npm test`
Expected: PASS(1 passed)

- [ ] **Step 5: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 无错误(highlight.js 自带类型;marked-highlight 自带类型)

- [ ] **Step 6: 提交**

```bash
git add backend/package.json backend/package-lock.json backend/test/render.test.ts
git commit -m "chore: 加 marked-highlight/highlight.js + vitest 工具链"
```

---

### Task 2: 渲染核心 render.ts(高亮 + 锚点 + TOC)

**Files:**
- Create: `backend/src/render.ts`
- Test: `backend/test/render.test.ts`(替换 Task 1 的占位内容)

**Interfaces:**
- Consumes: `marked`、`marked-highlight`、`highlight.js/lib/core` 及语言子模块。
- Produces:
  - `interface TocItem { level: number; text: string; slug: string }`
  - `interface Rendered { html: string; toc: TocItem[] }`
  - `function slugify(text: string): string`
  - `function renderMarkdown(md: string): Rendered` — 同步;`html` 含 `hljs` class 的代码与带 `id`+`.anchor` 的 h2–h4;`toc` 仅收 depth 2–4,slug 去重(重复追加 `-1/-2`)。

- [ ] **Step 1: 写失败测试**

替换 `backend/test/render.test.ts` 为:

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test`
Expected: FAIL(找不到模块 `../src/render` / 函数未定义)

- [ ] **Step 3: 实现 render.ts**

创建 `backend/src/render.ts`:

```ts
// 边缘渲染:Markdown → 安全 HTML + 标题锚点 + TOC 数据。存原文,渲染即时生效。
import { marked, Tokens } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import diff from "highlight.js/lib/languages/diff";
import yaml from "highlight.js/lib/languages/yaml";

const LANGS: Record<string, unknown> = {
  javascript, typescript, python, json, bash, xml, css, go, rust, sql, diff, yaml,
};
for (const [name, def] of Object.entries(LANGS)) {
  hljs.registerLanguage(name, def as any);
}
hljs.registerAliases(["js"], { languageName: "javascript" });
hljs.registerAliases(["ts"], { languageName: "typescript" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["sh", "shell", "zsh"], { languageName: "bash" });
hljs.registerAliases(["html", "xhtml"], { languageName: "xml" });
hljs.registerAliases(["yml"], { languageName: "yaml" });

export interface TocItem {
  level: number;
  text: string;
  slug: string;
}
export interface Rendered {
  html: string;
  toc: TocItem[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let configured = false;
function configure(): void {
  if (configured) return;
  configured = true;
  marked.use(
    { gfm: true },
    markedHighlight({
      highlight(code: string, lang: string): string {
        return lang && hljs.getLanguage(lang)
          ? hljs.highlight(code, { language: lang }).value
          : escapeHtml(code);
      },
    }),
    {
      renderer: {
        heading(token: Tokens.Heading): string {
          const text = this.parser.parseInline(token.tokens);
          const slug = (token as Tokens.Heading & { slug?: string }).slug;
          if (!slug) return `<h${token.depth}>${text}</h${token.depth}>\n`;
          return (
            `<h${token.depth} id="${slug}">${text}` +
            `<a class="anchor" href="#${slug}" aria-label="链接到本节">#</a>` +
            `</h${token.depth}>\n`
          );
        },
      },
    },
  );
}

export function renderMarkdown(md: string): Rendered {
  configure();
  const tokens = marked.lexer(md);
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  marked.walkTokens(tokens, (t) => {
    if (t.type !== "heading") return;
    const h = t as Tokens.Heading & { slug?: string };
    const base = slugify(h.text) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const slug = n === 0 ? base : `${base}-${n}`;
    h.slug = slug;
    if (h.depth >= 2 && h.depth <= 4) toc.push({ level: h.depth, text: h.text, slug });
  });
  const html = marked.parser(tokens);
  return { html, toc };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npm test`
Expected: PASS(全部 8+ 用例)
若 `hljs-keyword` 断言不稳,退而验证 `expect(html).toContain("hljs-")`。

- [ ] **Step 5: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add backend/src/render.ts backend/test/render.test.ts
git commit -m "feat: render.ts 边缘渲染(语法高亮+标题锚点+TOC 抽取)"
```

---

### Task 3: 阅读增强样式(双主题高亮 + chrome + 锚点 + 进度条 + lightbox + 打印)

**Files:**
- Modify: `backend/src/html.ts`(`BASE_CSS` 常量,约 `:122`)

**Interfaces:**
- Consumes: 现有 `--bg/--fg/--muted/--accent/--soft/--border` CSS 变量。
- Produces: `BASE_CSS` 内新增 `.anchor` `.cb-wrap` `.cb-bar` `.cb-lang` `.cb-copy` `.progress` `.lb` 类与 `.hljs-*` token 着色、`main` 用 `--reading-size/--reading-width` 变量、`@media print` 规则。供 Task 4/5 的 DOM 使用。

- [ ] **Step 1: 把 `main` 宽度/字号改为可调变量**

编辑 `backend/src/html.ts`,把 `BASE_CSS` 里这一行:

```css
  main{max-width:42rem;margin:0 auto;padding:56px 24px 40px}
```

改为:

```css
  main{max-width:var(--reading-width,42rem);font-size:var(--reading-size,17px);margin:0 auto;padding:56px 24px 40px}
  html{scroll-behavior:smooth}
  @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
```

- [ ] **Step 2: 在 `BASE_CSS` 模板字符串末尾(闭合反引号前)追加阅读增强块**

```css
  /* 标题锚点 */
  h2,h3,h4{position:relative}
  .anchor{position:absolute;left:-.9em;opacity:0;text-decoration:none;color:var(--muted);font-weight:400;padding-right:.2em}
  h2:hover .anchor,h3:hover .anchor,h4:hover .anchor{opacity:.5}
  .anchor:hover{opacity:1;color:var(--accent);border-bottom:none}
  @media(max-width:640px){.anchor{display:none}}
  /* 代码块 chrome(由 JS 包裹注入) */
  .cb-wrap{position:relative;margin:1.2em 0}
  .cb-wrap pre{margin:0}
  .cb-bar{position:absolute;top:0;right:0;display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:11.5px;color:var(--muted)}
  .cb-lang{text-transform:uppercase;letter-spacing:.04em}
  .cb-copy{cursor:pointer;background:none;border:0;color:var(--muted);font:inherit;font-size:11.5px;padding:2px 6px;border-radius:5px}
  .cb-copy:hover{color:var(--accent);background:var(--bg)}
  /* 阅读进度条 */
  .progress{position:fixed;top:0;left:0;right:0;height:2px;z-index:60;background:transparent;pointer-events:none}
  .progress>i{display:block;height:100%;width:0;background:var(--accent);transition:width .1s linear}
  @media(prefers-reduced-motion:reduce){.progress>i{transition:none}}
  /* 图片 lightbox */
  main img{cursor:zoom-in}
  .lb{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.82);display:none;align-items:center;justify-content:center;cursor:zoom-out}
  .lb.open{display:flex}
  .lb img{max-width:92vw;max-height:92vh;border-radius:8px}
  /* highlight.js 双主题(CSS 变量,跟随 prefers-color-scheme) */
  .hljs{color:var(--fg);background:transparent}
  .hljs-comment,.hljs-quote{color:var(--muted);font-style:italic}
  .hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-section,.hljs-link{color:#c0392b}
  .hljs-string,.hljs-attr,.hljs-template-tag,.hljs-addition{color:#2e7d32}
  .hljs-number,.hljs-built_in,.hljs-type,.hljs-meta{color:#8e5cd9}
  .hljs-title,.hljs-name{color:#1565c0}
  .hljs-attribute,.hljs-variable,.hljs-deletion{color:#b9530f}
  @media(prefers-color-scheme:dark){
    .hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-section,.hljs-link{color:#ff6b6b}
    .hljs-string,.hljs-attr,.hljs-template-tag,.hljs-addition{color:#7ec699}
    .hljs-number,.hljs-built_in,.hljs-type,.hljs-meta{color:#c58af9}
    .hljs-title,.hljs-name{color:#6c9eff}
    .hljs-attribute,.hljs-variable,.hljs-deletion{color:#e0955f}
  }
  /* 打印 */
  @media print{
    .progress,#hspace-nav-host,footer,.crumb,.pn,.side{display:none!important}
    .wrap{padding:0!important}
    main{max-width:none;padding:0}
    pre,code{white-space:pre-wrap;word-break:break-word}
    a{color:inherit}
  }
```

- [ ] **Step 3: 类型检查(确保模板字符串没写坏)**

Run: `cd backend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add backend/src/html.ts
git commit -m "style: 阅读增强 CSS(双主题高亮/代码 chrome/锚点/进度条/lightbox/打印)"
```

---

### Task 4: 统一悬浮控制器 readerWidget(替代 collectionNavWidget)

**Files:**
- Modify: `backend/src/html.ts`(`collectionNavWidget` `:259`、`injectCollectionNav` `:329`)
- Modify: `backend/test/render.test.ts` 不动;Create 断言见下(新测试文件)
- Create: `backend/test/widget.test.ts`

**Interfaces:**
- Consumes: `CollectionNav`(html.ts 已有)、`TocItem`(从 `./render` 导入类型)。
- Produces: `function readerWidget(opts: { nav?: CollectionNav; toc: TocItem[]; prefs: boolean }): string` — 返回 `<div id="hspace-nav-host">` 宿主 + IIFE(Shadow DOM)。面板按序含:合集篇目(有 `nav` 时)、当前篇 TOC(`toc.length>=3` 时)、字号/宽度偏好(`prefs` 时)。`injectCollectionNav(html, nav)` 改为内部调用 `readerWidget({ nav, toc: [], prefs: false })`。

- [ ] **Step 1: 写失败测试**

创建 `backend/test/widget.test.ts`:

```ts
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
    expect(out).toContain('href="#jia"');
    expect(out).toContain('href="#bing"');
  });
  it("toc <3 时不渲染 TOC 段", () => {
    const out = readerWidget({ toc: [{ level: 2, text: "甲", slug: "jia" }], prefs: true });
    expect(out).not.toContain('href="#jia"');
  });
  it("prefs 时含字号/宽度按钮", () => {
    const out = readerWidget({ toc: [], prefs: true });
    expect(out).toContain('data-size="l"');
    expect(out).toContain('data-width="n"');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test`
Expected: FAIL(`readerWidget` 未导出)

- [ ] **Step 3: 用 readerWidget 替换 collectionNavWidget**

编辑 `backend/src/html.ts`:顶部加类型导入(与其他 import 同处):

```ts
import type { TocItem } from "./render";
```

把整个 `function collectionNavWidget(nav: CollectionNav): string { ... }`(`:259`–`:326`)替换为:

```ts
/**
 * 统一悬浮控制器(左下角胶囊 + Shadow DOM 面板):合集篇目 + 当前篇 TOC + 阅读偏好。
 * 用 Shadow DOM 与页面彻底样式隔离;只往 body 追加一个宿主 + 一段 IIFE。
 * prefs 段的按钮通过设置 :root 的 --reading-size/--reading-width 变量并写 localStorage 生效
 * (仅对我们的阅读模板有效,裸 html 篇目传 prefs:false)。
 */
export function readerWidget(opts: { nav?: CollectionNav; toc: TocItem[]; prefs: boolean }): string {
  const { nav, toc, prefs } = opts;
  const pos = nav ? ` · ${nav.current}/${nav.docs.length}` : "";
  const title = nav ? esc(nav.collectionTitle) : "阅读工具";

  const docsSection = nav
    ? `<div class="sec"><div class="lb">合集</div>` +
      nav.docs
        .map(
          (d) =>
            `<a class="doc${d.index === nav.current ? " on" : ""}" href="/${d.index}"><i>${d.index}</i><span>${esc(d.title)}</span></a>`,
        )
        .join("") +
      `</div>`
    : "";

  const tocSection =
    toc.length >= 3
      ? `<div class="sec"><div class="lb">目录</div>` +
        toc
          .map(
            (t) =>
              `<a class="toc l${t.level}" href="#${t.slug}"><span>${esc(t.text)}</span></a>`,
          )
          .join("") +
        `</div>`
      : "";

  const prefsSection = prefs
    ? `<div class="sec"><div class="lb">字号</div><div class="seg" data-k="size">` +
      `<button data-size="s">小</button><button data-size="m">中</button><button data-size="l">大</button></div>` +
      `<div class="lb">宽度</div><div class="seg" data-k="width">` +
      `<button data-width="n">窄</button><button data-width="m">中</button><button data-width="w">宽</button></div></div>`
    : "";

  const markup =
    `<style>
      :host{all:initial}
      *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif}
      .pill{position:fixed;left:16px;bottom:16px;z-index:2147483647;display:inline-flex;align-items:center;gap:8px;
            padding:9px 14px;background:#1A1D24;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:999px;
            box-shadow:0 4px 18px rgba(0,0,0,.32);cursor:pointer;font-size:13px;font-weight:600;line-height:1}
      .pill .dot{width:7px;height:7px;border-radius:50%;background:#F0784F}
      .panel{position:fixed;left:16px;bottom:64px;z-index:2147483647;width:280px;max-width:calc(100vw - 32px);
             background:#fff;color:#1d1d1f;border:1px solid #e5e2dd;border-radius:14px;overflow:hidden;
             box-shadow:0 16px 44px rgba(0,0,0,.24);display:none;animation:pop .16s ease-out}
      .panel.open{display:block}
      @keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e5e2dd;font-weight:700;font-size:13px}
      .hd .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .hd .x{cursor:pointer;color:#6e6e73;font-size:16px;line-height:1}
      .body{max-height:min(60vh,420px);overflow-y:auto;padding:6px}
      .sec{padding:4px 4px 8px}
      .sec+.sec{border-top:1px solid #eee}
      .lb{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8b8b90;padding:8px 8px 4px}
      .doc,.toc{display:flex;gap:10px;align-items:baseline;padding:8px 10px;border-radius:8px;color:#1d1d1f;
           text-decoration:none;font-size:13.5px;line-height:1.4;border-left:3px solid transparent}
      .doc:hover,.toc:hover{background:#f2f0ed}
      .doc.on{background:#f2f0ed;border-left-color:#E2603C;font-weight:600}
      .doc i{color:#8b8b90;font-style:normal;font-size:12px;font-variant-numeric:tabular-nums}
      .toc.l3{padding-left:22px;font-size:13px}.toc.l4{padding-left:34px;font-size:12.5px;color:#6e6e73}
      .seg{display:flex;gap:6px;padding:4px 8px 8px}
      .seg button{flex:1;padding:7px 0;border:1px solid #e5e2dd;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;color:#1d1d1f}
      .seg button:hover{border-color:#E2603C}
      .seg button.on{background:#E2603C;border-color:#E2603C;color:#fff}
      .brand{display:block;text-align:center;padding:8px;font-size:11.5px;color:#8b8b90;text-decoration:none;border-top:1px solid #e5e2dd}
      .brand:hover{color:#E2603C}
      @media(prefers-color-scheme:dark){
        .panel{background:#22242a;color:#e8e6e3;border-color:#2e3036}
        .hd{border-color:#2e3036}.hd .x{color:#8b8b90}.sec+.sec{border-color:#2e3036}.brand{border-color:#2e3036}
        .doc,.toc{color:#e8e6e3}.doc:hover,.toc:hover,.doc.on{background:#2a2d34}
        .toc.l4{color:#8b8b90}
        .seg button{background:#2a2d34;border-color:#2e3036;color:#e8e6e3}.seg button.on{background:#F0784F;border-color:#F0784F;color:#17181c}
      }
      @media(prefers-reduced-motion:reduce){.panel{animation:none}}
    </style>
    <button class="pill" id="p" aria-label="打开阅读工具"><span class="dot"></span>目录${pos}</button>
    <div class="panel" id="n" role="dialog" aria-label="阅读工具">
      <div class="hd"><span class="t">${title}</span><span class="x" id="x" aria-label="关闭">×</span></div>
      <div class="body">${docsSection}${tocSection}${prefsSection}</div>
      <a class="brand" href="${FOOT_HREF}" target="_blank" rel="noopener">${FOOT_SIG}</a>
    </div>`;

  const json = JSON.stringify(markup).replace(/</g, "\\u003c");
  return (
    `<div id="hspace-nav-host"></div><script>(function(){try{` +
    `var h=document.getElementById('hspace-nav-host');var r=h.attachShadow({mode:'open'});r.innerHTML=${json};` +
    `var p=r.getElementById('p'),n=r.getElementById('n'),x=r.getElementById('x');` +
    `p.addEventListener('click',function(){n.classList.toggle('open')});` +
    `x.addEventListener('click',function(){n.classList.remove('open')});` +
    // TOC 点击后收起面板(锚点跳转由 href 原生完成)
    `r.querySelectorAll('.toc').forEach(function(a){a.addEventListener('click',function(){n.classList.remove('open')})});` +
    // 偏好:读 localStorage 高亮当前档;点击写入并设置 :root 变量
    `var SZ={s:'16px',m:'17px',l:'19px'},WD={n:'34rem',m:'42rem',w:'52rem'};` +
    `function mark(k,v){r.querySelectorAll('.seg[data-k=\"'+k+'\"] button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-'+k)===v)})}` +
    `var cs=localStorage.getItem('hs-size')||'m',cw=localStorage.getItem('hs-width')||'m';mark('size',cs);mark('width',cw);` +
    `r.querySelectorAll('.seg[data-k=\"size\"] button').forEach(function(b){b.addEventListener('click',function(){var v=b.getAttribute('data-size');localStorage.setItem('hs-size',v);document.documentElement.style.setProperty('--reading-size',SZ[v]);mark('size',v)})});` +
    `r.querySelectorAll('.seg[data-k=\"width\"] button').forEach(function(b){b.addEventListener('click',function(){var v=b.getAttribute('data-width');localStorage.setItem('hs-width',v);document.documentElement.style.setProperty('--reading-width',WD[v]);mark('width',v)})});` +
    `}catch(e){var a=document.createElement('a');a.href='/';a.textContent='\\u2190 目录';` +
    `a.style.cssText='position:fixed;left:16px;bottom:16px;z-index:2147483647;background:#1A1D24;color:#fff;padding:9px 14px;border-radius:999px;text-decoration:none;font:600 13px sans-serif';` +
    `document.body.appendChild(a);}})();</script>`
  );
}
```

- [ ] **Step 4: 更新 injectCollectionNav 调用新函数**

把 `injectCollectionNav`(`:329`)函数体里这行:

```ts
  const w = collectionNavWidget(nav);
```

改为:

```ts
  const w = readerWidget({ nav, toc: [], prefs: false });
```

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && npm test`
Expected: PASS(render + widget 全绿)

- [ ] **Step 6: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add backend/src/html.ts backend/test/widget.test.ts
git commit -m "feat: 统一悬浮控制器 readerWidget(篇目+TOC+偏好)"
```

---

### Task 5: readingPage 接线 + index.ts 接线 + 体积复核 + 冒烟

> 合并原 Task 5+6(经人工确认):`readingPage` 签名变更本就跨 `html.ts` 与 `index.ts` 两个文件,合成一个任务后每次提交都能通过 `tsc`,不留中间破损态。

**Files:**
- Modify: `backend/src/html.ts`(`readingPage` `:204`)
- Modify: `backend/src/index.ts`(`:20` import、`:833` 单篇、`:871` 合集篇目)

**Interfaces:**
- Consumes: `readerWidget`(Task 4)、`renderMarkdown`(Task 2)、`TocItem`。
- Produces: `readingPage` 改为**选项对象**签名:
  `function readingPage(o: { title: string; articleHtml: string; toc: TocItem[]; nav?: CollectionNav; updatedAt?: number | null; saveToken?: string }): string`
  页面新增:`<head>` 内偏好早应用脚本(防闪)、`.progress` 进度条、`readerWidget` 嵌入、页面级交互 IIFE(进度条 + 代码 chrome/复制 + 锚点复制 + lightbox)。index.ts 两处 md 渲染改用 `renderMarkdown` 并把 `toc` 传入。
- 注:偏好档位映射 `SZ`/`WD` 在本任务的早应用脚本与 Task 4 控件脚本各出现一次(经人工确认接受此重复——两段跑在不同执行上下文)。

- [ ] **Step 1: 重写 readingPage**

把整个 `export function readingPage(...) { ... }`(`:204`–`:222`)替换为:

```ts
/** Markdown 阅读页;nav 时渲染合集导航;updatedAt 非空显示"更新于";saveToken 非空出「保存这份稿」 */
export function readingPage(o: {
  title: string;
  articleHtml: string;
  toc: TocItem[];
  nav?: CollectionNav;
  updatedAt?: number | null;
  saveToken?: string;
}): string {
  const { title, articleHtml, toc, nav, updatedAt, saveToken } = o;
  const pageTitle = nav ? `${title} · ${nav.collectionTitle}` : title;
  const crumb = nav
    ? `<div class="crumb"><a href="/">← 目录</a><span class="sep">·</span>${esc(nav.collectionTitle)}</div>`
    : "";
  const upd = updatedAt ? ` · 更新于 ${new Date(updatedAt * 1000).toISOString().slice(0, 10)}` : "";
  // 偏好早应用(防止字号/宽度切换时的闪烁):在 body 渲染前读 localStorage 设 :root 变量
  const earlyPrefs =
    `<script>(function(){try{var SZ={s:'16px',m:'17px',l:'19px'},WD={n:'34rem',m:'42rem',w:'52rem'};` +
    `var s=localStorage.getItem('hs-size'),w=localStorage.getItem('hs-width');var r=document.documentElement;` +
    `if(SZ[s])r.style.setProperty('--reading-size',SZ[s]);if(WD[w])r.style.setProperty('--reading-width',WD[w]);}catch(e){}})();</script>`;
  // 页面级交互:进度条 / 代码块 chrome+复制 / 锚点复制 / 图片 lightbox
  const pageJs =
    `<script>(function(){try{` +
    `var pi=document.querySelector('.progress>i');` +
    `if(pi)addEventListener('scroll',function(){var d=document.documentElement;var m=d.scrollHeight-d.clientHeight;pi.style.width=(m>0?(d.scrollTop/m*100):0)+'%';},{passive:true});` +
    `document.querySelectorAll('main pre').forEach(function(pre){var code=pre.querySelector('code');if(!code)return;` +
    `var mm=(code.className||'').match(/language-([\\w-]+)/);` +
    `var w=document.createElement('div');w.className='cb-wrap';pre.parentNode.insertBefore(w,pre);w.appendChild(pre);` +
    `var bar=document.createElement('div');bar.className='cb-bar';if(mm)bar.innerHTML='\\u003cspan class=\"cb-lang\"\\u003e'+mm[1]+'\\u003c/span\\u003e';` +
    `if(navigator.clipboard){var b=document.createElement('button');b.type='button';b.className='cb-copy';b.textContent='复制';` +
    `b.addEventListener('click',function(){navigator.clipboard.writeText(code.textContent).then(function(){b.textContent='已复制';setTimeout(function(){b.textContent='复制'},1200)})});bar.appendChild(b);}` +
    `w.appendChild(bar);});` +
    `document.querySelectorAll('.anchor').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var u=location.href.split('#')[0]+a.getAttribute('href');history.replaceState(null,'',u);navigator.clipboard&&navigator.clipboard.writeText(u);})});` +
    `var lb=document.createElement('div');lb.className='lb';var li=document.createElement('img');lb.appendChild(li);document.body.appendChild(lb);` +
    `document.querySelectorAll('main img').forEach(function(img){img.addEventListener('click',function(){li.src=img.src;lb.classList.add('open')})});` +
    `lb.addEventListener('click',function(){lb.classList.remove('open')});` +
    `addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('open')});` +
    `}catch(e){}})();</script>`;
  const widget = readerWidget({ nav, toc, prefs: true });
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">${FAVICON_LINK}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<style>${BASE_CSS}</style>${earlyPrefs}</head>
<body class="${nav ? "has-side" : ""}">
  ${nav ? sidebar(nav) : ""}
  <div class="progress"><i></i></div>
  <div class="wrap">
    <main>${crumb}${articleHtml}${nav ? prevNext(nav) : ""}</main>
    <footer>${saveLink(saveToken)}<span class="dot"></span><a href="${FOOT_HREF}" target="_blank" rel="noopener">${FOOT_SIG}</a>${upd}</footer>
  </div>
  ${widget}
</body></html>`;
}
```

- [ ] **Step 2: 加 render.ts 导入(index.ts)**

在 `backend/src/index.ts` 顶部 import 区(`:20` `import { marked } from "marked";` 附近)加:

```ts
import { renderMarkdown } from "./render";
```

- [ ] **Step 3: 改单篇 md 渲染(`:833`–`:838`)**

把:

```ts
  if (page.object_key.endsWith(".md")) {
    const md = await obj.text();
    const article = await marked.parse(md, { gfm: true, async: true });
    const updated = page.version > 1 && page.updated_at ? page.updated_at : null;
    return htmlResp(readingPage(mdTitle(md, page.filename), article, undefined, updated, saveToken), 200);
  }
```

改为:

```ts
  if (page.object_key.endsWith(".md")) {
    const md = await obj.text();
    const { html: article, toc } = renderMarkdown(md);
    const updated = page.version > 1 && page.updated_at ? page.updated_at : null;
    return htmlResp(readingPage({ title: mdTitle(md, page.filename), articleHtml: article, toc, updatedAt: updated, saveToken }), 200);
  }
```

- [ ] **Step 4: 改合集 md 篇目渲染(`:870`–`:873`)**

把:

```ts
  if (doc.ext === "md") {
    const article = await marked.parse(await obj.text(), { gfm: true, async: true });
    const nav: CollectionNav = { collectionTitle: index.title, docs: navDocs, current: n };
    return htmlResp(readingPage(doc.title, article, nav, updated, saveToken), 200);
  }
```

改为:

```ts
  if (doc.ext === "md") {
    const { html: article, toc } = renderMarkdown(await obj.text());
    const nav: CollectionNav = { collectionTitle: index.title, docs: navDocs, current: n };
    return htmlResp(readingPage({ title: doc.title, articleHtml: article, toc, nav, updatedAt: updated, saveToken }), 200);
  }
```

- [ ] **Step 5: 清理未用的 marked import(若无其它使用)**

Run: `cd backend && grep -n "marked" src/index.ts`
若仅剩顶部 `import { marked } from "marked";` 而无其它 `marked.` 调用,删除该 import 行;否则保留。

- [ ] **Step 6: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 7: 全量测试**

Run: `cd backend && npm test`
Expected: PASS(render + widget)

- [ ] **Step 8: 体积复核(dry-run 部署,不真正上线)**

Run: `cd backend && npx wrangler deploy --dry-run --outdir /tmp/hs-bundle && ls -la /tmp/hs-bundle`
Expected: 打印 bundle;确认总大小在预算内(gzip 后 highlight 增量 ≤ ~70KB)。超预算 → 回 render.ts 削减 `LANGS` 语言集后重跑。

- [ ] **Step 9: 本地冒烟(手动)**

Run: `cd backend && npx wrangler dev --local-upstream <见 hspace-local-dev-quirks 备忘>`
逐项人工验证(亮/暗、桌面/移动、打印预览):
1. 单篇 md:代码高亮着色、复制按钮可用、标题 hover 出 `#` 且点击复制链接、图片点击放大 Esc 关闭、顶部进度条随滚动、悬浮胶囊出「阅读工具」、字号/宽度切换即时生效并刷新后保持。
2. 合集 md 篇目:胶囊面板含篇目 + 当前篇 TOC + 偏好;桌面左侧栏仍在;翻页正常。
3. 合集裸 html 篇目:悬浮胶囊行为同旧(仅篇目导航,无偏好),未被高亮/偏好影响。
4. 短文(<3 标题):胶囊仍在(承载偏好),但无 TOC 段。

- [ ] **Step 10: 提交(html.ts 与 index.ts 一并,单次提交每处都绿)**

```bash
git add backend/src/html.ts backend/src/index.ts
git commit -m "feat: readingPage 交互升级 + 单篇/合集 md 接入 renderMarkdown"
```

- [ ] **Step 11: 推送触发 CI 部署并确认绿灯**

```bash
git push
```
Run: `gh run watch`
Expected: Deploy Backend 工作流绿灯(tsc + wrangler deploy + /health 冒烟通过)。

---

## Self-Review

**Spec coverage:**
- A 语法高亮 → Task 2(render.ts highlight)+ Task 3(hljs 双主题 CSS)✓
- A 复制按钮 + 语言标签 → Task 5(pageJs 代码 chrome)+ Task 3(.cb-* CSS)✓
- B 标题锚点 → Task 2(id+.anchor)+ Task 5(锚点复制)+ Task 3(.anchor CSS)✓
- B 悬浮 TOC 胶囊(≥3 标题)→ Task 4(readerWidget tocSection)✓(仅点击跳转;滚动高亮 scroll-spy 经确认明确降级,不实现——见设计文档订正)
- B 阅读进度条 → Task 3(.progress CSS)+ Task 5(进度 JS + 元素)✓
- D 字号/宽度(localStorage)→ Task 4(prefs 段+写入)+ Task 5(早应用)+ Task 3(main 变量)✓
- D 图片 lightbox → Task 3(.lb CSS)+ Task 5(lightbox JS)✓
- D 打印样式 → Task 3(@media print)✓
- 悬浮件统一收纳 → Task 4(readerWidget 合并篇目+TOC+偏好)✓
- 排除项(阅读时长/手动亮暗/C 类)→ 未出现在任何任务 ✓
- 存原文/边缘渲染/自包含/无外链 → Task 2 同步边缘渲染,所有 CSS/JS 内联 ✓

**Placeholder scan:** 无 TBD/TODO;每个代码步骤含完整代码;每个测试步骤含真实断言。唯一「见备忘」处为 Task 5 Step 9 的 `--local-upstream` 参数(指向已存在的 `hspace-local-dev-quirks` 记忆),属外部既有信息,非占位。

**Type consistency:** `renderMarkdown` 返回 `{ html, toc }`,index.ts 以 `{ html: article, toc }` 解构 ✓;`TocItem {level,text,slug}` 在 render.ts 定义、html.ts 类型导入、测试三处一致 ✓;`readingPage` 选项对象字段名 `title/articleHtml/toc/nav/updatedAt/saveToken` 在 html.ts 定义与 index.ts 两处调用一致 ✓;`readerWidget({nav,toc,prefs})` 在定义、injectCollectionNav 调用、readingPage 调用、测试四处一致 ✓;localStorage 键 `hs-size`/`hs-width` 与档位映射 `SZ/WD` 在 Task 4(widget)与 Task 5(早应用)两处完全一致 ✓。
