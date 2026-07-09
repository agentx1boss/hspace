# 自动挂单 / Community Maker 入门资源包

这个目录是给 X 评论区转发用的 HSpace campaign 源文件。目标是接住「全自动挂单吗」「怎么做」「稳不稳」的问题, 用资源包方式给出学习路线和风险边界。

## 文件

- `1-先读规则.md`:StandX SIP-5A、Maker Hours、DUSD/token 奖励边界。
- `2-订单簿和自动挂单基础.md`:maker/taker、post-only/ALO、bps、双边挂单。
- `3-工具和框架资源.md`:Hummingbot、CCXT、bot 模块拆分、AI 能帮什么。
- `4-风险清单.md`:库存、单边成交、杠杆、撤单、API key、AI 代码审查。
- `5-互动路线图.html`:自包含交互页面, 资源筛选、Maker Hours 概念解释、风险 checklist。

## 发布建议

标题:`自动挂单 / Community Maker 入门资源包`

密码:`1024`

当前线上链接:`https://hixg6uu.zhanjian.space`

用 HSpace collection 发布。作为第一方社媒物料时, 如需常驻, 发布后按 `docs/operations.md` 的「第一方置顶内容」流程手动置顶。公开文案不要暗示普通用户可创建永久链接。

## 本地生成 payload

```bash
cd backend
KEY=$(grep '^HSPACE_API_KEY=' ../.env | cut -d= -f2)
python3 - <<'PY'
import json
d="../assets/promo/market-maker-bot"
files=[
 {"name":"1-先读规则.md","markdown":open(d+"/1-先读规则.md").read()},
 {"name":"2-订单簿和自动挂单基础.md","markdown":open(d+"/2-订单簿和自动挂单基础.md").read()},
 {"name":"3-工具和框架资源.md","markdown":open(d+"/3-工具和框架资源.md").read()},
 {"name":"4-风险清单.md","markdown":open(d+"/4-风险清单.md").read()},
 {"name":"5-互动路线图.html","html":open(d+"/5-互动路线图.html").read()},
]
json.dump({"title":"自动挂单 / Community Maker 入门资源包","password":"1024","files":files}, open("/tmp/market-maker-bot.json","w"), ensure_ascii=False)
PY
curl -s -X POST https://html-share.kzhan.workers.dev/publish \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d @/tmp/market-maker-bot.json
```

## 评论区回复文案

```text
不是「开了就自动赚钱」那种全自动脚本，更像是程序帮你持续做双边限价挂单、撤单、更新距离。核心要先看懂 Maker Hours 怎么算、post-only/ALO 怎么避免意外吃单，以及单边成交/断线/杠杆这些风险。

我整理了一份自动挂单 / Community Maker 入门资源包：
- SIP-5A / Maker Hours 官方规则
- 订单簿、bps、双边挂单基础
- Hummingbot / CCXT 等 bot 框架参考
- 新手最容易忽略的风险清单

不是投资建议，也不是现成赚钱脚本，适合先把机制看懂。
链接: https://hixg6uu.zhanjian.space
密码: 1024
```

## 转发文案

```text
看到评论里有人问「全自动挂单吗？」

我整理了一份资源包:自动挂单不是赚钱脚本，而是订单簿学习路线图。

里面放了:
1. StandX SIP-5A / Maker Hours 规则入口
2. maker/taker、post-only/ALO、bps 基础
3. Hummingbot / CCXT 等开源框架参考
4. 库存、单边成交、断线、API key 风险清单
5. 一个交互式路线图

先看懂机制，再谈 bot。
不是投资建议，不承诺收益。

链接: https://hixg6uu.zhanjian.space
密码: 1024
```

## 发布前检查

- 所有外链可打开。
- 所有收益相关句子都有风险边界。
- 没有 API key、没有现成实盘 bot、没有具体杠杆建议。
- HTML 没有外部脚本、字体或图片。
- 移动端没有明显文本溢出。
