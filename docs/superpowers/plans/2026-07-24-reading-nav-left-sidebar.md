# 阅读导航改为左侧固定栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单篇/合集 md 阅读页的导航从底部悬浮胶囊改为桌面端持久的左侧固定栏(章节 TOC + 合集篇目 + 阅读偏好);窄屏保留悬浮胶囊兜底。

**Architecture:** 全部在 `backend/src/html.ts`。桌面(≥1100px)用已有 `.side` 固定栏承载:合集篇目(现状)+ 当前篇 TOC(新增)+ 字号/宽度偏好(从胶囊移入);短单篇(标题 <3 且非合集)桌面不出左栏。悬浮 `readerWidget` 在桌面用媒体查询隐藏、窄屏保留。左栏在主文档(非 Shadow DOM),偏好按钮用内联 JS 直接设 `--reading-size/--reading-width`。

**Tech Stack:** TypeScript · Cloudflare Worker · Vitest · 现有 marked/highlight 渲染管线(不改动)

## Global Constraints

- **自包含**:内联 CSS/JS/SVG,不引外部脚本/字体/图片。
- **双主题 + `prefers-reduced-motion` 友好**;沿用现有 `--bg/--fg/--muted/--accent/--soft/--border/--panel` 变量。
- **偏好档位映射精确**:`SZ={s:'16px',m:'17px',l:'19px'}`、`WD={n:'34rem',m:'42rem',w:'52rem'}`;localStorage 键 `hs-size`/`hs-width`。为避免第三份字面量:`earlyPrefs` 把映射挂到 `window.__hsSZ`/`window.__hsWD`,`pageJs` 复用(带兜底);Shadow DOM 胶囊内的那份保持独立(隔离作用域)。
- **左栏出现条件(桌面)= 合集(有 nav)或 TOC≥3**;短单篇桌面无左栏、无桌面偏好控件(偏好在窄屏胶囊仍在)。
- **窄屏(<1100px)**:`.side` 隐藏(现状),悬浮胶囊保留。桌面与窄屏两套导航永不同时出现。
- **不做 scroll-spy**(既定降级):TOC 仅点击跳转,无滚动高亮。
- **改完必跑** `cd backend && npx tsc --noEmit`;`cd backend && npm test` 全绿。
- **实现优先用 Codex**(用户偏好)但**禁用 `codex exec --full-auto`**(绕过主机审批门,未授权);Codex 停滞则直接编辑。

## File Structure

- **Modify** `backend/src/html.ts`:
  - `BASE_CSS` `@media(min-width:1100px)` 块:`.side` 改 flex 列;新增 `.side .stoc`(TOC)与 `.side .prefs`(偏好)样式。
  - `sidebar()`:签名与产出改为「篇目 + TOC + 偏好」。
  - `readingPage()`:`showSide` 逻辑;单篇满足条件也渲染 `.side` + `has-side`;`earlyPrefs` 挂 window 映射;`pageJs` 增左栏偏好接线。
  - `readerWidget()`:Shadow `<style>` 加桌面隐藏媒体查询。
- **Create** `backend/test/readingpage.test.ts`:左栏渲染 + 门限 + 偏好接线断言。
- **Modify** `backend/test/widget.test.ts`:新增桌面隐藏媒体查询断言。

---

### Task 1: 左侧固定栏承载 TOC + 篇目 + 偏好(桌面)

**Files:**
- Modify: `backend/src/html.ts`(`sidebar()` `:229`、`BASE_CSS` `@media` 块 `:172-184`、`readingPage()` `:252-305`)
- Create: `backend/test/readingpage.test.ts`

**Interfaces:**
- CONSUMES: `TocItem {level,text,slug}`、`CollectionNav`、`esc`、`readerWidget`(不改)。
- PRODUCES: `sidebar(o: { nav?: CollectionNav; toc: TocItem[]; prefs: boolean }): string`;`readingPage` 在 `showSide = !!nav || toc.length>=3` 时渲染 `.side` 并给 body 加 `has-side`。

- [ ] **Step 1: 写失败测试**

创建 `backend/test/readingpage.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test`
Expected: FAIL —— 单篇不再渲染 `.side`(旧逻辑仅 nav 时有)、`sidebar` 旧签名产出不含 TOC/偏好。

- [ ] **Step 3: 重写 `sidebar()`**

把整个 `function sidebar(nav: CollectionNav): string { ... }`(`:229`–`:234` 一带)替换为:

```ts
function sidebar(o: { nav?: CollectionNav; toc: TocItem[]; prefs: boolean }): string {
  const { nav, toc, prefs } = o;
  const docs = nav
    ? `<div class="ct">${esc(nav.collectionTitle)}</div><ol>` +
      nav.docs
        .map(
          (d) =>
            `<li><a class="${d.index === nav.current ? "on" : ""}" href="/${d.index}"><span class="n">${d.index}</span><span>${esc(d.title)}</span></a></li>`,
        )
        .join("") +
      `</ol>`
    : "";
  const tocBlock =
    toc.length >= 3
      ? `<div class="stoc"><div class="ct">本篇目录</div>` +
        toc.map((t) => `<a class="l${t.level}" href="#${t.slug}">${esc(t.text)}</a>`).join("") +
        `</div>`
      : "";
  const prefsBlock = prefs
    ? `<div class="prefs"><div class="ct">显示</div>` +
      `<div class="seg" data-k="size"><button data-size="s">小</button><button data-size="m">中</button><button data-size="l">大</button></div>` +
      `<div class="seg" data-k="width"><button data-width="n">窄</button><button data-width="m">中</button><button data-width="w">宽</button></div></div>`
    : "";
  return `<nav class="side">${docs}${tocBlock}${prefsBlock}</nav>`;
}
```

- [ ] **Step 4: 扩展 `.side` 桌面样式**

在 `BASE_CSS` 的 `@media(min-width:1100px){ ... }` 块内,把:

```css
    .has-side .side{display:block;position:fixed;top:0;left:0;bottom:0;width:264px;overflow-y:auto;
         border-right:1px solid var(--border);background:var(--panel);padding:32px 16px}
```

改为(display:block → flex 列,便于偏好置底):

```css
    .has-side .side{display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;width:264px;overflow-y:auto;
         border-right:1px solid var(--border);background:var(--panel);padding:32px 16px}
```

并在该 `@media` 块内(闭合 `}` 之前)追加:

```css
    .side .stoc{margin-top:18px}
    .side .stoc a{display:block;padding:6px 12px;border-radius:8px;color:var(--muted);font-size:13px;line-height:1.4;text-decoration:none;border-left:3px solid transparent}
    .side .stoc a:hover{background:var(--soft);color:var(--fg)}
    .side .stoc a.l3{padding-left:24px}
    .side .stoc a.l4{padding-left:36px;font-size:12.5px}
    .side .prefs{margin-top:auto;padding-top:18px}
    .side .prefs .seg{display:flex;gap:6px;margin:6px 0 0}
    .side .prefs .seg button{flex:1;padding:6px 0;border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:8px;cursor:pointer;font:inherit;font-size:13px}
    .side .prefs .seg button:hover{border-color:var(--accent)}
    .side .prefs .seg button.on{background:var(--accent);border-color:var(--accent);color:#fff}
```

- [ ] **Step 5: 改 `readingPage`——showSide、sidebar 调用、window 映射、左栏偏好接线**

(a) 把 `earlyPrefs` 定义(`:268`–`:271`)替换为(挂 window 供 pageJs 复用):

```ts
  const earlyPrefs =
    `<script>(function(){try{var SZ={s:'16px',m:'17px',l:'19px'},WD={n:'34rem',m:'42rem',w:'52rem'};` +
    `window.__hsSZ=SZ;window.__hsWD=WD;` +
    `var s=localStorage.getItem('hs-size'),w=localStorage.getItem('hs-width');var r=document.documentElement;` +
    `if(SZ[s])r.style.setProperty('--reading-size',SZ[s]);if(WD[w])r.style.setProperty('--reading-width',WD[w]);}catch(e){}})();</script>`;
```

(b) 在 `pageJs` 的 `try{` 块内、`}catch(e){}` 之前,追加左栏偏好接线(主文档,非 Shadow DOM):

```ts
    `var SZ=window.__hsSZ||{s:'16px',m:'17px',l:'19px'},WD=window.__hsWD||{n:'34rem',m:'42rem',w:'52rem'};` +
    `function smark(k,v){document.querySelectorAll('.side .seg[data-k="'+k+'"] button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-'+k)===v)})}` +
    `var cs=localStorage.getItem('hs-size')||'m',cw=localStorage.getItem('hs-width')||'m';smark('size',cs);smark('width',cw);` +
    `document.querySelectorAll('.side .seg[data-k="size"] button').forEach(function(b){b.addEventListener('click',function(){var v=b.getAttribute('data-size');localStorage.setItem('hs-size',v);document.documentElement.style.setProperty('--reading-size',SZ[v]);smark('size',v)})});` +
    `document.querySelectorAll('.side .seg[data-k="width"] button').forEach(function(b){b.addEventListener('click',function(){var v=b.getAttribute('data-width');localStorage.setItem('hs-width',v);document.documentElement.style.setProperty('--reading-width',WD[v]);smark('width',v)})});` +
```

(c) 把 body 组装(`:290`、`:296`–`:297`)从:

```ts
  const widget = readerWidget({ nav, toc, prefs: true });
```
```ts
<body class="${nav ? "has-side" : ""}">
  ${nav ? sidebar(nav) : ""}
```

改为:

```ts
  const showSide = !!nav || toc.length >= 3;
  const widget = readerWidget({ nav, toc, prefs: true });
```
```ts
<body class="${showSide ? "has-side" : ""}">
  ${showSide ? sidebar({ nav, toc, prefs: true }) : ""}
```

- [ ] **Step 6: 运行测试(全绿)**

Run: `cd backend && npm test`
Expected: PASS —— 新 readingpage 4 例 + 既有 render/widget 全过。

- [ ] **Step 7: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 8: 提交**

```bash
git add backend/src/html.ts backend/test/readingpage.test.ts
git commit -m "feat: 阅读导航改为桌面左侧固定栏(TOC+篇目+偏好)"
```

---

### Task 2: 桌面隐藏悬浮胶囊(窄屏保留)

**Files:**
- Modify: `backend/src/html.ts`(`readerWidget()` Shadow `<style>` `:419` 一带)
- Modify: `backend/test/widget.test.ts`

**Interfaces:**
- CONSUMES: 无新增。
- PRODUCES: `readerWidget` 输出的 Shadow CSS 在 `@media(min-width:1100px)` 下 `.pill,.panel{display:none}`,使桌面只见左栏、窄屏只见胶囊。

- [ ] **Step 1: 写失败测试**

在 `backend/test/widget.test.ts` 的 `describe` 内追加:

```ts
  it("桌面(≥1100px)隐藏悬浮胶囊", () => {
    const out = readerWidget({ toc: [], prefs: true });
    // Shadow <style> 内应有桌面隐藏规则;该子串唯一,不与面板默认 display:none 混淆
    expect(out).toContain("@media(min-width:1100px){.pill,.panel{display:none");
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test`
Expected: FAIL —— 尚无该媒体查询。

- [ ] **Step 3: 加桌面隐藏媒体查询**

在 `readerWidget` 的 Shadow `<style>` 里,把:

```css
      @media(prefers-reduced-motion:reduce){.panel{animation:none}}
```

改为(在其后追加桌面隐藏规则):

```css
      @media(prefers-reduced-motion:reduce){.panel{animation:none}}
      @media(min-width:1100px){.pill,.panel{display:none!important}}
```

- [ ] **Step 4: 运行测试(全绿)**

Run: `cd backend && npm test`
Expected: PASS(含新胶囊隐藏例)。

- [ ] **Step 5: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 6: 提交**

```bash
git add backend/src/html.ts backend/test/widget.test.ts
git commit -m "feat: 桌面隐藏悬浮胶囊(改用左栏),窄屏保留"
```

---

## Self-Review

**Spec coverage:**
- 桌面持久左栏(单篇 TOC / 合集 篇目+TOC)→ Task 1 sidebar() + `.side` CSS ✓
- 偏好移入左栏底部 → Task 1 prefsBlock + `.prefs{margin-top:auto}` + pageJs 接线 ✓
- 短单篇(<3 标题)桌面不出左栏 → Task 1 `showSide = !!nav || toc.length>=3` ✓
- 窄屏保留胶囊、桌面隐藏 → Task 2 媒体查询 ✓
- 两套导航永不同时出现 → `.side` 仅 `@media(min-width:1100px)` 显示(现状)+ 胶囊 `@media(min-width:1100px)` 隐藏 ✓
- 不做 scroll-spy → 左栏 TOC 仅 `href` 锚点,无 IntersectionObserver ✓
- 不新增第三份 SZ/WD 字面量 → earlyPrefs 挂 `window.__hsSZ/__hsWD`,pageJs 复用带兜底 ✓
- 自包含/双主题/reduced-motion/存原文 → 全内联,`.side` 用主题变量,渲染管线不改 ✓

**Placeholder scan:** 无 TBD/TODO;每步含完整代码;测试步含真实断言。

**Type consistency:** `sidebar({nav?,toc,prefs})` 新签名唯一调用点在 readingPage Step 5(c),已同步;`showSide` 同时驱动 body class 与 sidebar 渲染;`TocItem`/`CollectionNav` 沿用既有类型;localStorage 键 `hs-size`/`hs-width` 与 `SZ`/`WD` 档位在 earlyPrefs、pageJs、widget 三处值一致(pageJs 经 window 复用 earlyPrefs 定义)。

**边界确认:** 左栏 TOC 用未转义 `href="#slug"`(主文档),与胶囊内 JSON 转义的 `href=\"#slug\"` 区分;`data-size="l"` 在左栏(未转义)出现使单篇 ≥3 断言成立;短单篇断言 `<body class="">` 与 `.side` 缺席均成立(widget 宿主 `#hspace-nav-host` 仍在,但非 `.side`)。
