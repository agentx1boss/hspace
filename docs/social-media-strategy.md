# HSpace 跨平台社交媒体策略

> 文档定位:可执行运营方案。**所有对外文案一律取自 `docs/positioning.md`**(用语表、slogan、写作规则),改文案 = 改定位,需走评审。
> 制定日期:2026-07-09 · 阶段:MVP 已上线,处于「主画像周活发布者 > 200 且 7 日留存 > 25%」上量闸门之前(见 positioning §7)。当前所有动作**只对主画像**(用 AI 编程工具的开发者)负责。

## 0. 执行摘要

HSpace 是「AI 编程时代的定向分享」工具——把 AI 写好的 HTML/Markdown 一键变成「链接 + 密码」,只发给该看的人。我们面对的是**全球开发者,以英文为主**。因此社媒策略的根本原则是:

- **开发者在哪,我们就在哪**:X/Twitter、GitHub、Reddit/HN、dev.to 是主战场;LinkedIn 作为思想领导力与「技术型 PM / 顾问」外扩的辅助战场。
- **卖结果不卖手段**:讲「收得回」「谁看了你知道」「稿在改链接不变」,不讲密码网关、边缘校验。
- **内容即产品演示**:每条帖子尽量可演示、可点、可复现(workflow-native)。
- **开源即信任**:把「开源可自建 + Cloudflare 边缘」当作品牌资产持续讲。

本方案给出:平台优先级、内容支柱、日历框架、创始人思想领导力、社区建设与 KPI,以及 90 天落地路线。

## 1. 目标与北极星指标

**品牌目标**:在「AI 编程产出如何安全地发给该看的人」这一心智里,成为第一提及。
**产品目标(真正北极星)**——社媒最终要服务这些:

- 周活跃发布者数(触发上量闸门的关键指标,见 positioning §7)
- 匿名 → 登录转化率(认真使用自然导向账号)
- 链接创建数 / 回执查看数
- GitHub Stars / 插件安装量(开发者信任与分发)

**社媒直接目标**:

- 把社媒流量转化为「安装插件 / 试用发布 / 进 GitHub」的动作
- 建立创始人思想领导力,为后续演讲 / 播客 / 媒体铺垫

## 2. 平台组合与优先级

> 关键洞察:HSpace 是开发者工具,不是通用 B2B SaaS。把精力投在「开发者密度高」的平台;LinkedIn 只做思想领导力与外扩人群,不做主转化场。

### Tier 1 — 主战场(开发者密度最高,优先投入)

| 平台 | 角色 | 为什么 |
|---|---|---|
| **X / Twitter** | 发现 + 创始人声音 + 实时 | 开发者工具第一发现引擎;thread 适合讲「场景 + 演示」;可直链落地页 / 插件 |
| **GitHub** | 品牌信任面 + 流量入口 | 仓库即门面:Stars / Releases / README / Discussions;每次发版即内容 |
| **Reddit + Hacker News** | 有机触达 + 反馈 | Show HN、r/ClaudeAI、r/cursor、r/selfhosted、r/programming 是精准人群;适合「场景故事 + 求助反馈」 |

### Tier 2 — 辅助战场(可信度 + 外扩)

| 平台 | 角色 | 为什么 |
|---|---|---|
| **LinkedIn** | 创始人思想领导力 + 技术型 PM / 顾问外扩 | 外扩顺序里技术型 PM → 顾问是下一步;LinkedIn 文章 / Newsletter 建立权威,但开发者密度低,不追求爆量 |
| **dev.to / Hashnode** | 长文叙事 | 「为什么需要定向分享」类深度文,SEO + 开发者读者 |

### Tier 3 — 脉冲式(发布 / 活动节点)

| 平台 | 角色 |
|---|---|
| **Product Hunt** | 一次性发布冲量 + 外链 |
| **Discord / 社区** | 在 Cursor、Claude Code 等现有社区参与,不另起炉灶(避免变成公开画廊,守边界) |

## 3. 平台策略详情

### 3.1 X / Twitter(主)
- **频率**:每周 3–4 条,以 thread 为主(1 条钩子推 + 3–5 条展开)。
- **格式**:短视频 / GIF 演示插件一键发布 → 文案讲结果;对比「公开托管 vs 定向分享」。
- **钩子结构**:遵循定位「钩子 + 钩子,不要钩子 + 说明」。例:`You shipped the demo. Now don't ship it to the world. 🔒`
- **创始人人设**:稳定输出带个人观点(`I think sharing AI output is broken`),中性 / 赋权语气,不用客服腔。
- **社区动作**:在 #buildinpublic、AI coding 相关推文下真诚评论;经授权、匿名化后转推用户场景。
- **Hashtag**:用行业标签(`#AICoding` `#DevTools` `#Cursor` `#ClaudeCode`);品牌标签统一 `#ShipToOne`(对应英文 slogan 缩写,谨慎使用,避免自嗨)。

### 3.2 LinkedIn(辅助)
- **频率**:每周 1 条(创始人个人号优先于公司页)。
- **内容**:行业观点文(「AI 帮你写好了,你打算怎么安全发出去?」)、产品里程碑背后的思考、用户场景(匿名化)。
- **语气**:专业、权威但不傲慢;可第一人称。
- **Newsletter**:季度起一个「定向分享观察」Newsletter,沉淀 subscribers。
- **公司页**:保持更新(产品新闻、创始人 spotlight、行业洞察),目标互动率 3%+。

### 3.3 GitHub(品牌信任面)
- **动作**:每次发版写好 Release Notes(讲「你得到什么结果」);用 Discussions 收集反馈;README 已完善,确保链接常新;在合适节点自然引导 Star,不乞讨。
- **联动**:X / Reddit 发版时同步;Release 即内容。

### 3.4 Reddit / Hacker News(有机)
- **Show HN**:上量闸门前也可发(讲清是开发者工具、开源、解决什么痛点),诚实、不营销腔。
- **Subreddit 参与**:r/ClaudeAI、r/cursor 讲「在对话里直接发布」的 MCP 场景;r/selfhosted 讲自建;r/programming 讲「为什么公开托管不适合发给客户」。
- **规则**:遵守各版规,价值优先,不硬广;用「我做了 X 解决自己的痛点」而非「来用我的产品」。

### 3.5 dev.to / Hashnode(长文)
- 每月 1 篇深度文:如 *Public by default is wrong for AI-built demos* / *How we built edge-native password gating on Cloudflare* / *Why your AI demo shouldn't live on a public URL*。

## 4. 内容支柱(对齐定位三支柱 + 2 战略支柱)

| # | 支柱 | 对应定位 | 帖子示例 | 主平台 |
|---|---|---|---|---|
| **P1** | 30 秒发出去 | 🚀 30秒发出去 | GIF:编辑器里一键 → 链接 + 密码到剪贴板 | X / Reddit |
| **P2** | 发错了?收得回 | 🎯 发错了?收得回 | `Sent the wrong draft? Change the password, it's gone for them.` + 回执截图(脱敏) | X / LinkedIn |
| **P3** | 链接是活的 | 🔁 链接是活的 | 「改了 5 版,客户看的还是同一个链接」版本化演示 | X / dev.to |
| **P4** | 为 AI 工作流而生 | AI-native | MCP:在 Claude / Cursor 对话里直接 `/share` | X / Reddit |
| **P5** | 开源可自建 | 信任资产 | 自建教程 + Cloudflare 边缘架构图 | GitHub / dev.to |

**写作规则(来自 positioning §4–5,硬约束)**:
- 用「定向分享」「私密分享」「访问回执」「稿 / Draft」,不用「私域分发 / 加密分享 / 追踪监控 / 页面文件(营销语境)」。
- 卖结果不卖手段;钩子 + 钩子;无人称优先;第二人称只用于赞美 / 赋权。
- 品牌名 **HSpace**;英文为主(全球开发者)。

## 5. 内容日历框架

**月度主题轮转**(4 周循环,确保五支柱都被覆盖):
- 第 1 周:**P1** 速度(一键发布演示)
- 第 2 周:**P2** 控制(撤回 / 回执故事)
- 第 3 周:**P4** AI 工作流(MCP / 插件场景)
- 第 4 周:**P3** 活的链接 + **P5** 开源(版本化 + 自建)

**每周节奏(示例)**:
- 周一:X thread(P1 / P4 演示类)
- 周三:Reddit / HN 参与 + 1 条 X(P2 故事)
- 周五:LinkedIn 创始人观点(双周)或 X(P3 / P5)
- 双周:dev.to 长文
- 随发版:GitHub Release + 全平台同步

(首月周历见附录 A)

## 6. 创始人思想领导力

- **定位**:「认真思考 AI 产出如何负责任地分享的人」。
- **产出**:X 每周 2–3 条带观点的推文;LinkedIn 每月 1 篇行业文;dev.to 每月 1 篇深度。
- **借势**:用社媒声量换取播客 / 会议邀请(AI engineer 类节目、dev tool 社区)。
- **媒体**:把「开源 + 隐私边界承诺(永不做公开画廊 / 广告)」作为差异点讲给科技媒体。

## 7. 社区建设与用户运营

- **不另起公开画廊**(守边界):社区只做「交流技巧 / 反馈」,不托管公开内容。
- **起点**:GitHub Discussions + 在 Cursor / Claude Code 社区真诚参与。
- **用户故事**:征集「你怎么用 HSpace 发给客户 / 同事」,匿名化后做成 X / LinkedIn 素材(经授权)。
- **倡导者**:创始人 + 核心用户自然代言;暂不做大规模员工倡导计划(团队小,先验证)。

## 8. KPI 与度量

**产品北极星(优先看)**
- 周活跃发布者(上量闸门指标)
- 匿名 → 登录转化率
- 链接创建数 / 回执查看数
- GitHub Stars、插件安装量

**品牌指标(对标角色基准,分阶段)**
- X 粉丝与互动率(目标互动率 1–2% 起步,成熟后 3%+)
- LinkedIn 公司页互动率 3%+、个人号 5%+
- 跨平台触达月增(目标 20%)
- 粉丝月增(目标 8%,早期可更高)
- Share of Voice:在「AI demo 分享 / targeted sharing」相关讨论中的提及占比(类目新兴,以「占据品类词」为目标)

**归因**:UTM 区分各平台落地页流量;GitHub / 插件安装以「发版周 vs 平时」对比看社媒拉动。

## 9. 90 天落地路线图

- **第 1–30 天(奠基)**:搭好 X / LinkedIn / GitHub 资料(bio 用 positioning §6 boilerplate);确定声音与视觉;发 3–4 条支柱种子帖;进入相关社区;建立 UTM 与度量基线。
- **第 31–60 天(起势)**:稳定周节奏;发布首篇 dev.to 深度文;Reddit / HN 持续参与;开始双周 LinkedIn 文;周报跟踪产品北极星。
- **第 61–90 天(放大)**:Show HN / Product Hunt 脉冲;创始人 LinkedIn 文章系列;按数据优化(哪些支柱 / 平台转化最好);评估上量闸门进度,决定是否启动外扩人群测试。

## 10. 风险与边界(必须守住)

来自 positioning.md 的红线,任何社媒动作不得违背:
- ❌ 不做公开画廊叙事;社区不得变成公开内容墙。
- ❌ 不公开展示 Free / Pro / Team 价格(纸面假设)。
- ❌ 不说「加密存储」;只说 HTTPS 传输 + 密码哈希。
- ❌ 不暗示永久链接;到期是身份,诚实讲。
- ❌ 不用「私域分发 / 加密分享 / 追踪监控」等禁用词。
- ❌ 不夸大隐私(当前为规则扫描,未接专业扫描器前不声称「安全无忧」)。
- ✅ 卖结果不卖手段;文案一律取自 positioning.md。

## 附录 A:首月周历(示例)

| 周 | 周一(X thread) | 周三(X + Reddit) | 周五(LinkedIn / X) | 长文 / 发版 |
|---|---|---|---|---|
| W1 | P1:一键发布 GIF | P2:撤回故事 | X P5 架构图 | — |
| W2 | P4:MCP `/share` 演示 | Reddit r/cursor | LinkedIn:行业观点 | dev.to 首篇 |
| W3 | P2:回执「谁看了」 | X P1 客户场景 | X P3 版本化 | — |
| W4 | P3:链接不变迭代 | HN Show 准备 | LinkedIn 双周 | 发版同步 |

## 附录 B:可直接用的帖子模板(英文,主语言)

**X 发布推文(钩子 + 演示)**
> You shipped the demo in Cursor. Don't ship it to the world. 🔒
> One click → a link + password, only for the people who should see it. Know who opened it. Take it back anytime.
> hspace.zhanjian.space #AICoding

**X thread(场景)**
> 1/ Sent a client a demo on a public URL. Two days later it's in a Slack you're not in.
> 2/ HSpace flips the default: private by default, one password per recipient, revocable.
> 3/ Built for the AI coding workflow — publish from the editor or straight from Claude / Cursor via MCP.
> 4/ Open source, edge-native on Cloudflare. Try it: hspace.zhanjian.space

**LinkedIn(创始人观点)**
> We've optimized AI to write the demo. We barely thought about how it gets to the right eyes.
> Most "share" tools compete on the public link. HSpace goes the other way: targeted sharing — a link + password, view receipts, instant revoke.
> Ship to one, not to all.

**Reddit / Show HN(诚实、价值优先)**
> Show HN: I built a tool to share AI-generated HTML / Markdown with a link + password instead of a public URL. Private by default, per-recipient passwords, view receipts, revocable. Open source, runs on Cloudflare. Looking for feedback from people who send demos / reports to clients.

**dev.to 标题候选**
> - Public by default is the wrong default for AI-built demos
> - How we built edge-native password gating (without a backend)
> - Ship to one, not to all: targeted sharing for the AI coding workflow
