# 决策日志

> 已消化的评审/计划稿(定位评审、文档二审、落地页 rebranding 与升级计划)的决策留痕。
> 结论已落进 [positioning.md](positioning.md) 与代码;此处只保记录与待办。原始详稿见 git 历史。

## 2026-07-04 · 定位评审

从"AI 协作者"过宽画像收窄,六项决议:

1. **主画像 = 用 AI 编程工具的开发者**(Cursor / Claude Code…)。渠道(Marketplace/Open VSX/MCP/GitHub)已对齐这群人。
2. **商业模式 = 个人免费 + 团队订阅(纸面假设,不实施)**。拉力信号出现再建收费,见 [business-model-hypothesis.md](business-model-hypothesis.md)。
3. **用词:弃"私域分发",改"定向分享"**;"私密分享"保留为品牌语。
4. **公开画廊:永不做**(私密是产品身份)。
5. **域名:长期换独立短域名**;权重按"密码页信任感"而非品牌记忆。
6. **对外文案:立即重写**,并出英文版。
→ 全部执行:文案重写、英文版落地页、positioning.md 定稿。

## 2026-07-04 · 定位 + 商业文档二审

采纳并已改:免费边界对齐商业假设、单页访问量封顶归类为"滥用防线"(非付费杠杆)、回执(免费·累计)vs 访问时间线(Pro·明细)边界、Team 定价"含 10 席"、$50 成本红线补推导、反定位声明、外扩触发条件量化、记账口径加"接收方→发布方飞轮"。
**未采纳**:三支柱重命名(保留"30 秒发出去"等)——"能发出去"信息量为零;"30 秒"是只针对回访发布动作的具体可信承诺。

## 2026-07-04 · 落地页 rebranding + 升级

**采纳并已上线**:FAQ 对齐商业假设 + 克制 Pro/Team 伏笔;反定位声明;张力句"发布侧匿名,分发侧有回执";OG 卡重制;英文默认版(?lang=zh + Accept-Language 兜底 + 切换器);体验入口上移到 hero 之后;功能卡 6→3 去重;删 hero 假分享卡(与体验卡重复);准确性修复(FAQ"加密存储"过度承诺 → HTTPS);第一方边缘埋点(`/e` → D1 `metrics`,无 Cookie/PII)。
**暂缓**:Logo 加箭头三角(品牌资产改动,需先出 2–3 矢量候选投票;用户已决定暂不做)。

### 落地页剩余待办(P2,择机)
- ~~增长飞轮:落地页加轻量"看过别人分享而来?"引导,承接页脚署名钩子流量~~ ✅ 2026-07-05:页脚署名带 `?ref=shared` → 落地页顶部条 + `ref` 埋点(闭环 + 可量化)
- 独立短域名(呼应定位决议 5;影响密码页信任感)
- 暗色 accent 微调 `#F0784F → #E87048`(更沉稳)
- Logo 箭头候选(如决定重启)

## 2026-07-05 · Claude Code 插件化 + 多客户端安装引导

**决策:把 `/share` 从"手动两步"升级为一键插件,并让本仓库自身即 marketplace。**
- 背景:原先 Claude Code 用户要 `claude mcp add` + `curl` 拉命令文件两步;插件机制能收敛成一次安装。
- 落地:`clients/claude-code/` 变插件根(`.claude-plugin/plugin.json` + `.mcp.json` 自带 MCP + `commands/share.md`);仓库根 `.claude-plugin/marketplace.json` 使本仓库即 marketplace。装法 = `claude plugin marketplace add agentx1boss/hspace` → `claude plugin install hspace@hspace`(得 `hspace@hspace`,自带 `/share` + MCP)。`claude plugin validate` 双绿。
- 版本 pin:改 `plugin.json` version 推 main 即更新,**无 tag / 无 registry**(区别于插件市场的 `v*`、MCP 的 `mcp-v*`)。已记入 AGENTS.md 命令区。
- 客户端边界厘清:**插件仅 Claude Code 独有**;Cursor/Codex/Desktop 走 MCP(Cursor 另可装 Open VSX 的 VS Code 插件)。
- 一致性:落地页 AI 发布区重排为"一家一卡"(Claude Code 一键装 → Cursor → Codex → Desktop),hero 加「Claude Code plugin」次级按钮跳 `#ai`;`mcp-server/README` 同序对齐;三处口径统一。

## 2026-07-06 · 免费教程 + 读者视角审阅(教程「做实」)

**决策:出一篇免费全栈教程(中/英 md + 双语交互 HTML),并保留「教程」定位、把它做实——而非降格为「架构解读」。**
- 产出:`docs/tutorial-build-hspace.{zh,en}.md` + `tutorial-build-hspace.html`(双语切换、默认中文、动画 SVG 架构 + 卡片技术栈、密码门彩蛋/可勾选清单/一键复制,全自包含)。用 `/share` dogfood 发成合集(混排 md+html;匿名合集上限 3 篇,故双语压进一篇 HTML)。
- 派子代理做**读者视角审阅**,发现要害:标题喊「教程/一个下午复刻」却没代码/仓库链接;`schema.sql` 被引用未给;route+通配 DNS 与 OAuth 回调没讲清;缺「验证成功」与故障排查;术语无定义;HTML 无障碍缺失。
- **做实**(而非改名):补真实仓库链接 + 克隆步骤 + 最小 `wrangler.toml` 骨架;讲清 **route + 代理通配 DNS 两者都要**、**OAuth 回调精确 URL + `/console`**;加 `curl /health` 验证 + 故障排查 + 术语速查 + 成本/前置;章节重排(从零搭建置于 CI/CD 前)。
- **准确性修正**:匿名 TTL 统一为 **3 天**(与 `wrangler.toml ANON_DEFAULT_TTL=259200` 一致)——同步改掉 `index.ts` 注释与 AGENTS.md 里陈旧的「7 天」。澄清 D1 无 receipts 表(回执派生自 hits)。
- **HTML 无障碍**:清单→`role=checkbox`+`aria-checked`+键盘;锁彩蛋→`role=button`+键盘;复制按钮 `aria-label`+focus 可见;`<noscript>` 兜底(JS 关时内容不隐形)。
- 暂缓:真实产品截图(需可驱动浏览器截图的环境)。
- **教程 md 做成深度手把手版**(与 HTML 速览差异化):md 承载真实代码(Worker 按 host 分流骨架、PBKDF2/signCookie)、数据模型(pages/grants DDL)、防滥用阈值表、密码门 curl 走查、本地开发闭环(`/p/<slug>` 无需通配域名)、如何扩展;HTML 保持一页速览并加「详细版看 md」引导。
- **落地页 demo 换成本教程合集**:用 founder key 经 API 发布为 `omcenj1`(密码 1024),直接改库 `expires_at=NULL` 置顶;中英 `trySlug` 均指向它,文案改「3 篇搭建教程合集」,`'try'` 埋点同步。旧 promo 册子 q0i7otn/aqm3anv 未删,仅不再被落地页引用(见 [operations.md](operations.md) 第一方置顶内容)。

## 2026-07-26 · 定位修订(⏳ 待评审):私密 Markdown 分享 + 阅读体验主打,HTML 副位

**提案:定位重心从「AI demo 的定向分享」转向「私密 Markdown 分享 + 阅读体验」,HTML 降为"同样原样能跑"的副位能力。** 修订稿已写入 positioning.md(头部带待评审标注),要点:

1. **主角换位**:叙事主角 demo → 稿(md 方案/报告/深度调研);时代论据 = AI 产出重心正从可跑 demo 移向长文档。「稿」从比喻变字面,是本次转向最大的既有资产。
2. **对照面换位**:反面从 Netlify Drop / tiiny.host(公开托管)换为 Notion 分享链接 / HackMD / Gist(默认公开的分享方式);品类占位词改「私密 Markdown 分享(private Markdown sharing)」,「定向分享」保留为机制叙事(不推翻 07-04 决议 3)。
3. **三支柱 → 四支柱**:新增 📖「点开即读」(md 精排阅读页、左栏 TOC/篇目导航、合集、亮暗主题、对方零安装),列第二位;与主 slogan 三拍对位(🔁 为底座)。**slogan 中英均不动**——中文第二拍早已埋好这一拍。
4. **用语表新增两行**:①「发布成阅读页/私密发布」替代「托管/hosting」(营销语境禁用,避免与"没有永久链接""不做站点托管"红线相撞);② 隐私主张白名单(密码门/不收录/会过期/无广告无第三方脚本/开源可自建)vs 黑名单(加密存储/端到端/"安全无忧")——明文存 R2 的事实约束。
5. **语序规则**:凡并列一律「Markdown/HTML」「.md(或 HTML)」,md 领衔;不贬低 HTML。
6. **场景重排**(§7):AI 报告直接发出去 ①、方案圈阅 ②、demo 发客户 ③;外扩顺序中咨询/交付型顾问前移至设计师之前(交付物即文档)。主画像与外扩闸门(周活>200 且留存>25%)不变。
7. **到期叙事前置**(§8):md 优先后"文档被期待永久存放"的张力更大,「读完了就该过期」要主动讲、走在质疑前面。
8. **边界承诺全部不变**;boilerplate(Marketplace/GitHub About)已按新口径重写待启用。
9. **开源从加分项提为「隐私主张的兑付凭证」,但明确定调"适度强调、不作宣传主线"**(新增 §4 信任底座):不设第五根支柱——四支柱讲"你得到什么",开源讲"凭什么信",并列会稀释。**投放密度有上限**:定位声明、GitHub About、FAQ、自建相关文案各提一次即可;写作规则定为"隐私主张要有出口,但不必句句带开源"(讲不可验证的承诺时跟一句"可自查/可自建"作担保,已在讲具体机制处不再补)——提得太密会像在辩解。不打抵制闭源的旗、不做道德优越,只陈述"可查、可搬走"。
   - **§4 附事实边界表(可说/不可说),防过度承诺**。均已对代码核验:`sendBeacon` 仅存在于 landing.ts(阅读页无客户端埋点),回执来自 `UPDATE pages/grants SET hits=hits+1` + `last_seen_at`,根 LICENSE 与插件/MCP 的 package.json 均为 MIT。
   - **核验中拦下一处拟写的过度承诺**:阅读页并非"不设 Cookie"——密码通过后会写 `hs_<slug>` 门禁票据(HttpOnly/Secure/SameSite=Lax/24h,见 index.ts:745)。已改为如实披露(单页作用域、不跨站),并把「不设 Cookie / 零 Cookie」写进用语表禁用项。
   - 用语表另补两行:禁「开源版 / 社区版 / core 开源」(暗示存在更好的闭源版,与"自建 = 完整能力"相悖);禁孤立的"我们不会看你的内容"(不可验证)。

**评审通过后的同步顺序**:positioning.md 去掉待评审标注 → 落地页(hero 语序与 .md 视觉 mock、「不是又一个 HTML 托管」章节重写、阅读体验功能曝光)→ Marketplace/GitHub About/bio → social-media-strategy.md(内容支柱重排 + 阅读体验 before/after 素材)。

### 2026-07-26 · Codex 对抗式评审 → 文案先下修,实现分阶段补(新增 positioning §9)

对修订稿跑了一轮 Codex 对抗式评审(working tree diff),报 3 high + 2 medium。逐条对代码复核后的处置:

| 评审发现 | 复核结论 | 处置 |
|---|---|---|
| 裸 API 可发无密码公开页 | 属实(index.ts 密码为空存 NULL;openapi 明确写"省略则公开")。但 VS Code 插件 / MCP / Claude Code 插件**一律自动生成 4 位密码** | **不改实现**——定为刻意保留的自由度(自建者、agent 集成、公开教程)。文案改口径:"默认带密码 / 推荐带密码",禁"所有页面都有密码 / 必须设密码";写进 §8 边界承诺 |
| "改密码即撤回"不成立 | **部分属实,评审判断需修正**:每人一链的 grant 每次访问都校验 `revoked`(index.ts:768),踢人**是**即时的;不即时的只有共享密码路径(`gid===""` 直接放行,Cookie 无密码版本号,最长 24h) | 文案下修为"踢掉某个访问人即时生效 / 改密码挡住后续访问";禁无限定的 instant revoke。实现列 §9 第 1 项(加 password revision),优先级高 |
| "无第三方脚本/无客户端埋点"边界错 | 属实。render.ts 不净化用户 md 里的原始 HTML,CSP 只有 `frame-ancestors 'none'`;外链脚本与远程图片会照常加载,可泄露接收方 IP/UA | 所有相关表述加"**HSpace 自身**"限定(自包含外壳属实、`sendBeacon` 只在落地页)。实现列 §9 第 2 项(净化 + 真 CSP),优先级高——这是"私密"叙事的软肋 |
| 匿名看不到"谁看了" | 属实。匿名 stats 只返回总 hits,逐人回执依赖 grants(登录专属) | 纯文案分档问题,已改完:匿名语境说"被打开几次","谁看了"仅限登录 + 每人一链语境。主判断(中/英)、10/30 秒稿、slogan 备选表同步下修 |
| operations.md 匿名 TTL 仍写 3 天 | 属实,上一轮漏改 | 已改为 7 天(与 `ANON_DEFAULT_TTL=604800` 一致) |

**新增 positioning §9「口径与实现的差距」**记录上述四项的现状/当前口径/收敛动作/优先级,并定下规则:**补一项放宽一项,放宽动作是改事实边界表 + §9,不许在某处文案里悄悄说回去**。同时把 §4 的事实边界表从开源小节里独立出来,升为写任何对外文案前必对的硬约束表。

**同步闸门**:§9 第 1、2 项收敛前,落地页/Marketplace/GitHub About 同步可照常推进(取用的已是下修后的口径),但不得出现 instant revoke、"无任何第三方请求"这类表述。

**实现排期决定(2026-07-26)**:两项**暂不实现,只登记 issue**——[#18](https://github.com/agentx1boss/hspace/issues/18)(password revision / 撤回语义)、[#19](https://github.com/agentx1boss/hspace/issues/19)(md 净化 + 真 CSP)。经确认后按「公开 issue + 完整技术细节」披露(权衡过:公开仓库 + 线上服务,#19 属未修复弱点,公开描述会给出滥用线索;选择开源透明优先)。文案侧的下修已完成,因此定位修订不被这两项阻塞。

## 2026-07-28 · CLI 客户端评估(⏳ 已决方向,未排期实现)

**结论:做,但作为现有 `hspace-mcp` npm 包上的一个 `bin`(命令名 `hspace`),不新增第五个「产品面」。**

判断依据(对照 §7 主画像与四支柱):

1. **CLI 是 agent 集成的最小公分母**。MCP 要配置、插件只有 Claude Code 有,但任何 agent 都能跑 bash——`npx hspace publish report.md` 一行即用于 Aider / Codex CLI / Cline / 自研 agent / Makefile / 脚本,杠杆高于再写一个 host 专属插件。
2. **终端画像目前是空白**。VS Code/Cursor 插件有全生命周期(14 命令),MCP 只有 `publish`/`publish_collection`;grants、撤回、stats、版本、续期在终端**没有出口**,只能开 web console——缺口正压在 🎯「收得回」与 🔁「链接是活的」两根支柱上。
3. **匿名 `editToken` 现在是丢的**。匿名发布返回的 editToken 是后续查回执/改内容的唯一凭据([index.ts:301](../backend/src/index.ts) / `authorize()`),插件存进 `hspace.recent`,MCP 只打印一行就没了。CLI 存一份 `~/.config/hspace/pages.json`,匿名不登录也能 `hspace stats <slug>`——纯增量能力。

成本:复用 `hspace-mcp` 已有的包与 `mcp-v*` 发版流水线,**不新增市场上架、不新增 CI workflow、不新增品牌面**;顺带把散在 `mcp-server/src/index.ts` 与 `vscode-extension/src/api.ts` 的两份 API client 收成一份。

**三条必须钉住的约束(实现时逐条对照)**:

- **不给 CI 自动发布留示范**。有了 CLI,「每次 push 发一版文档」是最自然的用法,而链接 7/30 天就过期——既撞 §8「不做站点托管 / 没有永久链接」,又制造垃圾页。口径一律是"从终端递一稿",迭代走 `hspace update <slug>`(链接不变)。
- **密码不进 argv/日志**。shell history 与 CI log 都留痕:密码默认自动生成、只写 stdout(或 `--json`),不接受明文位置参数。
- **继承一等公民客户端的不变量**:一律自动生成 4 位密码,**不提供 `--public` 快捷入口**(§8:裸 API 的自由度留给 API,不留给客户端)。

**排期**:不插到 [#19](https://github.com/agentx1boss/hspace/issues/19)(md 净化 + 真 CSP)前面——那是"私密"叙事的软肋,CLI 只是给已有能力多开一个入口。串行顺序 **#19 → CLI → [#18](https://github.com/agentx1boss/hspace/issues/18)**。

## 2026-07-28 · #19 收敛:md 净化 + 阅读页真 CSP(已实现)

positioning §9 第 2 项落地。两个显式决策先行(#19 原文要求「远程 `<img>` 与 HTML 稿档位必须是明确决策」):

| 决策点 | 选择 | 理由 |
|---|---|---|
| md 里的外链图片 | **允许 https 外链**(`img-src 'self' https: data:`) | 不破坏已发布的老稿(badge/图床截图);代价是接收方 IP/UA 仍会泄给图片主机,因此"无任何第三方请求"永久禁用 |
| HTML 稿(.html)的 CSP | **这轮不动**(仍只有 `frame-ancestors 'none'`) | 卖点是「原样能跑」,收紧会当场打断用 CDN 的 AI demo。分档写进代码注释与 §4,不是默认全开的疏漏 |

实现(全在 `backend/`):

- **`src/sanitize.ts`(新)**:白名单净化 + URL 协议闸门。输出是「重建」出来的 —— 未命中白名单的 `<` 一律转义,`<scr<script>ipt>` 这类嵌套截断拼不回标签;`script/style/iframe/svg/math/object/textarea/…` 连内容一起吃掉(只丢标签会把脚本正文当正文显示);`on*` 与 `style` 属性一律剥掉;`href/src/cite` 过协议闸门(挡 `javascript:`/`vbscript:`/`data:text/html`,含大小写、空白、`&#106;`/`&Tab;` 实体变形;`data:` 只放行 base64 位图,svg+xml 不放行);`target=_blank` 一律补 `rel=noopener noreferrer`;`id` 不许用 `hspace-` 前缀(防 DOM clobbering 把悬浮导航的宿主抢走)。
- **`src/render.ts`**:覆写 marked 的 `html`(块级与行内原始 HTML 都路由到这里,一处封住整条注入路径)、`link`、`image` —— marked 的 `cleanUrl` 只做 `encodeURI`,**不看协议**,`javascript:` 链接必须自己挡。
- **`src/headers.ts`(新,从 index.ts 抽出以便测试)**:`rawHtmlHeaders()` = HTML 稿档(不变);`shellHeaders(nonce)` = 第一方外壳档(`default-src 'none'`、`script-src 'nonce-…'`、`connect-src 'none'`、`base-uri 'none'`、`form-action 'self'`、`img-src 'self' https: data:`);`withNonce()` 给外壳自己的内联 `<script>` 打 nonce。**`style-src` 保留 `'unsafe-inline'`**:悬浮导航把 `<style>` 塞进 Shadow DOM(innerHTML),拿不到 nonce;而净化后的 md 既无 `<style>` 也无 style 属性,且 CSS 能引的远程资源(背景图)本就在 `img-src` 放行范围内,不构成新增出口。脚本侧保持严格 nonce。
- **测试**:`test/sanitize.test.ts`(22)+ `test/headers.test.ts`(17,含整页级对抗测试)+ `test/render.test.ts` 补 4 例;全仓 61 例绿,`tsc --noEmit` 干净。整页断言"每个 `<script>` 都带 nonce"= 没有裸脚本能被 CSP 放过。
- **本地冒烟**(`wrangler dev` + 恶意稿):脚本/iframe/onerror/`javascript:` 全部消失,外链图片按决策保留;任务框、表格、hljs、左栏 TOC、代码块复制、Shadow DOM 悬浮导航全部照常工作,浏览器控制台零 CSP 报错;HTML 稿响应头仍是 `frame-ancestors 'none';`,自带脚本照跑。

### 同日 · Codex 对抗式评审 → 两处净化器边界缺陷(已修)

实现完成后跑了一轮 Codex 对抗式评审(working tree diff),报 2 medium,复核**两条都属实**、都是净化器自身的边界问题(不是 CSP 侧):

| 评审发现 | 复核 | 处置 |
|---|---|---|
| **空元素把后文吃光**:`source`/`meta`/`link`/`base`/`embed` 是空元素,永远等不到 `</x>`,却被放进"连内容一起吃"的表里 → 游标直接推到结尾。`<div><picture><source><img></picture><p>AFTER</p></div>` 只剩 `<div>`。因为内容是**存原文动态渲染**,这等于一部署就悄悄截断已发布的老稿 | 属实,且比报告更普遍 —— 任何**缺闭合标签**的容器(`<option>甲<option>乙`、未闭合的 `<noscript>`)都会触发同一截断 | 不只修空元素:① 空元素从表里移出(落到"未命中白名单 → 只丢标签"的兜底);② 缺闭合时的规则改为**只丢标签、内容照常净化**,仅 `RAW_TEXT_TAGS`(script/style/textarea/title/xmp/plaintext/listing)例外才吃到结尾(避免把 JS/CSS 源码当正文倒出来)。整类"静默截断"从此不可能发生 |
| **正文自带 class 可劫持外壳**:正文与阅读页共用全局 CSS,`<a class="lb open">` 直接套上图片 lightbox 的 `position:fixed;inset:0;z-index:2147483646`,变成盖满全屏的可点击外链;CSP 不拦导航,可用于钓鱼或挡读 | 属实([html.ts:214](../backend/src/html.ts) 的 `.lb` / `.lb.open` 正是该样式) | `class` 从全局属性白名单里删除 —— 用户内容里的 `<style>` 与 style 属性早已被剥掉,class 对作者没有任何用处,纯粹是撞外壳样式的口子。同时补**整页级**回归测试(不只是净化器字符串测试):断言正文零 `class=`、`.lb/.side/.progress/.pill` 在整页里各不超过一份、`hspace-nav-host` 只有一个 |

复核后测试 61 例绿;本地 `wrangler dev` 用「对抗稿」实跑复验:伪装链接退化成普通行内链接(`main` 内零 `position:fixed`、零高 z-index 元素)、`AFTER-PICTURE`/`AFTER-META`/`甲乙` 全部保留、外链图片仍在、控制台零报错。

**口径放宽(按 §9 规则:补一项放宽一项,只改事实边界表 + §9)**:可以说「md 阅读页不执行第三方脚本」;仍不可说「无任何第三方请求」(外链图片);讲 HTML 稿时不套用这句。同步闸门现在只余 §9 第 1 项([#18](https://github.com/agentx1boss/hspace/issues/18) instant revoke)。

## 度量前置(已就绪)

第一方埋点已接:落地页 `/e` beacon → D1 `metrics`(pv/install/try/gh/vsx,按天+语言)。查询见 [operations.md](operations.md)。用于验证"英文默认"假设(pv 中英占比)与安装转化。
