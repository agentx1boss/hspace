# 设计:单篇 Markdown 阅读体验升级

日期:2026-07-24
状态:已批准(待实现计划)

## 背景

HSpace 的 Markdown 稿在边缘渲染:`marked` (GFM) → 注入 `readingPage` 模板
(`backend/src/html.ts`),渲染调用在 `backend/src/index.ts:833`(单篇)与
`:871`(合集篇目)。当前已具备:42rem 宽、17px/1.75 系统字体、亮暗自适应、
标题/表格/引用/图片基础排版、合集侧栏 + 翻页、代码块底色。

读者是「被定向分享」的具体对象,阅读体验直接关系到「点开即读、心里有数」的
产品承诺与专业观感。本设计聚焦**单篇阅读体验**的三块升级。

## 约束(红线,不可违背)

- **自包含页面**:内联 CSS/JS/SVG,**不引任何外部脚本/字体/图片**(CSP、加载
  速度、隐私)。语法高亮主题、图标、控件全部内联。
- **存原文、边缘渲染**:R2 存 Markdown 原文,模板/渲染升级即时对存量生效。
  高亮、锚点、TOC 均在边缘渲染时产出,**不预处理、不改存储格式**。
- **CSP 现状**:仅 `frame-ancestors 'none'`,无 `script-src` 限制 → 内联脚本/样式
  自由(现有合集导航胶囊即依赖此)。新增内联 JS 全部可行。
- **文案**:取自 `docs/positioning.md`;托管物叫「稿/Draft」,技术层叫 `page`。

## 范围

**做:**
- A 代码体验:语法高亮 + 复制按钮 + 语言标签(全部)
- B 结构导航:标题锚点 + 悬浮 TOC 胶囊 + 阅读进度条(全部)
- D 排版偏好:字号/宽度调节 + 图片 lightbox + 打印样式

**不做(本版明确排除):**
- 预估阅读时长
- 手动亮暗切换(系统自动跟随已生效,不重复造轮子)
- 整个 C 类富内容:Mermaid 图、数学公式(KaTeX)、任务清单/脚注样式
  ——受自包含约束 bundle 体积代价大,留待后续单独立项

## 改动面

- `backend/package.json`:新增依赖 `marked-highlight` + `highlight.js`
- `backend/src/html.ts`:模板与样式(`BASE_CSS`)、悬浮控制器、锚点/复制/lightbox/
  进度条/偏好的内联 JS
- `backend/src/index.ts:833` 与 `:871`:接入 `marked-highlight`、锚点生成、TOC 数据
  构建、把控制器改为统一控制器

## A · 代码体验

### 语法高亮
- 方案:`marked-highlight`(marked 18 已移除内建 highlight 选项,需此扩展)+
  `highlight.js`。
- **只注册 AI 高频语言**以控 Worker 体积:`javascript, typescript, python, json,
  bash/sh, html/xml, css, go, rust, sql, diff, yaml`(约 13 种)。逐个
  `hljs.registerLanguage` 显式注册,不打包全量。
- 体积预算:core + ~13 语言 gzip 预计 +40~70KB,远低于 Workers 付费版 10MB 上限;
  实现时以 `wrangler deploy` 输出的 bundle 大小复核,超预期则削减语言集。
- 边缘染出 `hljs`-class 的 `<span>`;**内联一套用 CSS 变量写的亮暗双主题**
  (跟随 `prefers-color-scheme`),**零客户端 JS**。
- 未识别语言 / 无 fence 语言:优雅降级为现有纯底色 `<pre>`,不报错。

### 复制按钮 + 语言标签
- `<pre>` 右上角:语言标签(取 fence info string,大写或规范名)+ 复制按钮。
- 复制:极小内联 JS,`navigator.clipboard.writeText`;点后短暂显示「已复制/Copied」
  再恢复。无 clipboard API 时按钮隐藏(而非报错)。
- 悬停显现、移动端常显;不干扰代码横向滚动。

## B · 结构导航

### 标题锚点
- 边缘渲染时为 `h2–h4` 生成 slug `id`(小写、非字符转连字符、CJK 保留);重复
  slug 追加 `-2/-3` 去重。
- hover 标题显现「#」链接,点击复制本节深链(`location.href#slug`)到剪贴板 +
  更新地址栏。

### 悬浮 TOC 胶囊
- **复用现有 `collectionNavWidget` 的 Shadow DOM 隔离方案**(同款胶囊 + 面板,
  同款亮暗样式),避免被用户/正文 CSS 污染。
- 从文档标题(h2–h4)构建当前篇 TOC;点击平滑滚动到锚点;滚动时用
  `IntersectionObserver` 高亮当前区块。
- **仅当标题数 ≥3 时出现**,短文不打扰。

### 阅读进度条
- 顶部固定 2px 细线,随滚动百分比推进,`--accent` 色。
- 不占布局(fixed);打印与 reduced-motion 下隐藏/降级。

## D · 排版偏好

### 字号 / 宽度调节
- 三档字号(如 16 / 17 / 19px)× 三档正文宽度(窄 36rem / 默认 42rem / 宽 52rem)。
- `localStorage` 记住选择。**已知限制**:内容页为各自子域
  `<slug>.zhanjian.space`,偏好**不跨篇/跨子域携带**;本版接受此限制,不做跨域同步。
- 控件收纳进统一悬浮控制器(见下),而非新增浮标。

### 图片 lightbox
- 点正文 `<img>` → 全屏遮罩查看,点击遮罩 / Esc 关闭。内联 JS,遮罩内联样式,
  亮暗适配。

### 打印样式
- `@media print`:隐藏悬浮控制器、页脚署名、进度条;正文铺满;代码块允许换行防
  截断;链接可选显示 URL。

## 关键决策:悬浮件统一收纳

**问题**:升级后可能同时出现——合集导航胶囊(左下,仅合集)+ TOC 胶囊 + 偏好控件,
三浮标堆叠违背「点开即读」的克制。

**决策(已批准)**:统一为**一个**左下角悬浮控制器,扩展现有合集胶囊而非新增:
- **合集篇目**:面板含「篇目列表 + 当前篇 TOC + 偏好」。
- **独立单篇**:面板含「TOC + 偏好」。
- 一个浮标、一致视觉语言、移动端干净。
- **阅读进度条独立在顶部**,不计入浮标。

## 单元边界

- **染色器接入**:`index.ts` 渲染处配置 `marked` + `marked-highlight`,输入原文、
  输出带 `hljs` class 的 HTML。职责:Markdown→安全 HTML。可独立测试(给定
  fenced code → 断言输出含预期 class)。
- **锚点/TOC 数据**:从渲染后的标题结构提取 `{level, text, slug}` 列表,喂给模板。
  职责单一,可脱离模板测试。
- **统一悬浮控制器**(`html.ts` 内一个函数):输入 = 可选合集 nav + TOC 列表 +
  偏好配置,输出 = 一段 Shadow DOM 宿主 + IIFE。不改用户原有 DOM。
- **偏好持久化 / lightbox / 进度条 / 复制 / 锚点复制**:各自独立的小段内联 IIFE,
  互不依赖,失败各自 try/catch 降级。
- **高亮主题 CSS**:一段用 CSS 变量的字符串常量,拼进 `BASE_CSS`。

## 错误处理与降级

- 语法高亮:未知语言 → 纯底色;`marked-highlight` 抛错 → 回退无高亮渲染,不 500。
- 所有内联控件脚本 try/catch;失败静默降级(如现有合集胶囊的 fallback 链接模式)。
- `navigator.clipboard` 缺失 → 复制/锚点按钮隐藏。
- `prefers-reduced-motion` → 平滑滚动降级为直接跳转,动画关闭。

## 测试

- **单元/边缘渲染**:对渲染函数断言——fenced code 出 `hljs` class;标题出去重
  slug id;无 fence 语言不炸;空文档/无标题时 TOC 数据为空(胶囊不渲染)。
- **类型检查**:`cd backend && npx tsc --noEmit`(改完必跑)。
- **手动冒烟**:本地 `wrangler dev`(注意 `hspace-local-dev-quirks` 记录的
  `--local-upstream` 坑)渲染样例 md/合集,验证亮暗、移动端、打印、lightbox、
  偏好持久化、TOC 滚动高亮。
- **bundle 体积**:`wrangler deploy` 输出复核,超 70KB 预算则削语言集。

## 部署

- `backend/**` 推 main → CI 自动 `tsc + wrangler deploy + /health` 冒烟。
- 实现分阶段(见后续实现计划);每阶段跑 `tsc --noEmit` 保持绿灯。

## 实现说明

- **优先用 Codex 落地**(用户偏好):实现阶段将编码任务优先交给 Codex。
