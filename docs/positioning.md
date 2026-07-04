# HSpace 产品定位说明(权威版)

> 单一事实来源:所有对外文案(落地页 / Marketplace / 社媒 / README)从本页取用。
> 定稿 2026-07-04,基于 positioning-review.md 六项决议。改这页 = 改定位,需走评审。

## 1. 定位声明(内部标准句式)

> **对于**用 Cursor / Claude Code 等 AI 编程工具的开发者,**当他们**要把刚生成的 demo、方案、报告发给同事和客户看时,**HSpace 是**一个定向分享工具,**它能**把内容一键变成"链接 + 密码"——谁看了有回执、发错了随时撤回、链接不变可迭代。**不同于** Netlify Drop / tiiny.host 等公开托管,**我们**为"只给该看的人"而设计,且发布无需注册、30 秒完成。

对外压缩版(给媒体/介绍用):**"AI 编程时代的定向分享:demo 写完,只发给该看的人。"**

**反定位**(帮团队做功能取舍):我们不是网盘、不是协作编辑工具、不是建站平台、不是公开画廊。

## 2. Slogan

**主 slogan(中)**:AI 写完的 demo,只发给该看的人
**主 slogan(英)**:**Ship to one, not to all.**
> 定稿理由:保留开发者的词 "ship",但用 "to one" 当场重定义——发给一个人,不是发给全世界;"to one, not to all" 对比结构节奏强,单行可印。中文承载信息(场景+人群),英文承载钩子(对比),互补不重复。

**极简备选(视觉主导场景,如海报/OG 卡)**:Only the right eyes.

备选(不同语境取用):

| 语境 | 中 | 英 |
|---|---|---|
| 强调私密 | 链接 + 密码,一次粘贴 | One link, one password, one paste |
| 强调回执 | 发出去的东西,看没看你知道 | Know who actually opened it |
| 强调撤回 | 发错了?收得回 | Sent wrong? Take it back |
| 强调迭代 | 链接是活的 | The link stays, the content evolves |
| 张力句 | 发布侧匿名,分发侧有回执 | Publish anonymously, share accountably |

## 3. 电梯稿(三个长度)

**10 秒**:HSpace 把 AI 帮你写好的 HTML/Markdown 一键变成带密码的链接,只发给该看的人——谁看了有回执,发错了随时撤回。

**30 秒**:用 Cursor、Claude Code 写完一个 demo 或方案,想发给客户 review?公开托管会把它发到全世界。HSpace 反着来:在编辑器或 AI 对话里一键发布,拿到"链接 + 密码",一次粘贴发走。每个接收者可以有自己的密码,谁看了几次你都知道;发错了改个密码就收回;内容改了链接不变。无需注册,开源可自建。

**60 秒**:在 30 秒版基础上追加——"背后是跑在 Cloudflare 边缘的开源 Worker(R2+D1+KV),密码在边缘校验、防爆破,页面不被搜索引擎收录。除了编辑器插件,还有 MCP server 让 Claude/Cursor 在对话里直接发布,OpenAPI 让任何 agent 接入。核心能力免费。"

## 4. 关键信息三支柱(所有文案围绕这三件事)

| 支柱 | 一句话 | 支撑功能 |
|---|---|---|
| 🚀 **30 秒发出去** | 零注册零配置,编辑器/对话里一键,链接+密码一次粘贴 | 插件、MCP、默认密码 |
| 🎯 **发错了?收得回** | 改密码即撤回;每人一链,踢一个人不换全员密码;有回执 | grants、stats、撤回 |
| 🔁 **链接是活的** | 内容随 AI 迭代,链接不变;历史可回滚 | 版本化 |

写文案的规则:**卖结果不卖手段**(说"收得回",不说"边缘密码网关");私密是手段,可控才是结果。

## 5. 用语表

| ✅ 用 | ❌ 不用 | 原因 |
|---|---|---|
| 定向分享 | 私域分发 | 与"私域流量"混淆,像微商工具 |
| 私密分享(品牌语) | 加密分享 | 我们是密码门不是端到端加密,别过度承诺 |
| AI 生成的内容 / AI 写完的 | AI 产物 | "产物"含贬义 |
| 成品内容分享,不是协作编辑 | 内容为主,站点为主 | 后者是内部架构语言 |
| 访问回执 / 谁看了 | 追踪、监控 | 对接收方语境避免监控感 |
| 合集(术语;"册子"仅限叙事文案中作比喻) | 多文件站点 | 守"不做托管"红线 |

**品牌名写法**:HSpace(H 大写 S 大写,不写 hspace/HSPACE/H-Space;包名、域名等技术标识除外)。

## 6. 各渠道 boilerplate(直接复制)

**Marketplace 描述(≤200 字符,中英)**
AI 写完的 demo,只发给该看的人:链接+密码、访问回执、随时撤回、链接不变可迭代。Ship to one, not to all.

**GitHub About(英文优先,面向全球开发者)**
Targeted sharing for AI-built HTML/Markdown: one link + password, view receipts, instant revoke, per-recipient passwords, versioned. Edge-native on Cloudflare, open source & self-hostable.
中文备用:定向分享 AI 生成的 HTML/Markdown:一键"链接+密码",回执、撤回、每人一链、版本化。Cloudflare 边缘,开源可自建。

**社媒 bio(X/即刻)**
AI 写完的 demo,只发给该看的人 🔒 hspace.zhanjian.space

**接收方页脚署名(勿改,信任触点)**
由 HSpace 私密分享 / HSpace · 私密分享

## 7. 目标人群与场景(判断"该不该做某功能"时对照)

**主画像**:用 AI 编程工具(Cursor / Claude Code / Copilot / v0 / bolt)高频产出 HTML/MD 的开发者。
**核心场景**:① demo 发客户 review;② 技术方案发同事圈阅;③ AI 对话里生成的报告直接发出去。
**外扩顺序**:技术型 PM → 设计师 → 咨询/交付型顾问。**外扩触发条件**(呼应商业假设探针):主画像周活发布者 > 200 且 7 日留存 > 25%,才启动下一环人群的测试;此前所有文案与功能只对主画像负责。
**不服务**:要建站的人、要协作编辑的人、要公开传播涨粉的人。

## 8. 边界承诺(对外可复述)

- 永不做公开画廊——私密是产品身份,不是可切换的选项
- 永不做广告/数据变现
- 自建 = 完整能力,开源不阉割
- 不做多文件站点托管、不做构建

---
关联文档:[定位评审](positioning-review.md) · [商业模式假设](business-model-hypothesis.md) · [运营手册](operations.md)
