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

## 度量前置(已就绪)

第一方埋点已接:落地页 `/e` beacon → D1 `metrics`(pv/install/try/gh/vsx,按天+语言)。查询见 [operations.md](operations.md)。用于验证"英文默认"假设(pv 中英占比)与安装转化。
