# 运营手册:举报处理与下架

举报入口:`https://hspace.zhanjian.space/report`(落地页/法务页页脚也有链接)。举报写入 D1 `reports` 表,人工处理。

## 查看待处理举报

```bash
cd backend
npx wrangler d1 execute html-share --remote --command \
  "SELECT id, slug, reason, detail, reporter, datetime(created_at,'unixepoch') AS at FROM reports WHERE status='open' ORDER BY created_at DESC LIMIT 50"
```

## 核实内容

被举报的 slug 内容在:`https://<slug>.zhanjian.space`(可能有密码)。也可直接查元数据:

```bash
npx wrangler d1 execute html-share --remote --command \
  "SELECT slug, filename, owner_id, created_at, hits, status FROM pages WHERE slug='<slug>'"
```

## 下架(封禁)一个页面

把 `status` 置为 `blocked`,该页面(及其合集所有篇目)立即返回 404;数据保留以便追溯。

```bash
npx wrangler d1 execute html-share --remote --command \
  "UPDATE pages SET status='blocked' WHERE slug='<slug>'"
```

彻底删除内容对象(可选,不可逆):

```bash
# 单页
npx wrangler r2 object delete html-share-pages/pages/<slug>.html --remote
# 合集/多版本:按前缀逐个删(先 list 再 delete)
npx wrangler r2 object get ... # 视情况
```

## 关闭举报

```bash
# 已处理
npx wrangler d1 execute html-share --remote --command \
  "UPDATE reports SET status='actioned' WHERE id='<report-id>'"
# 不成立
npx wrangler d1 execute html-share --remote --command \
  "UPDATE reports SET status='dismissed' WHERE id='<report-id>'"
```

## 落地页埋点(第一方,无 Cookie/PII)

事件写入 D1 `metrics` 表(`pv` 浏览 / `install` 装插件点击 / `try` 体验入口 / `gh` GitHub / `vsx` Open VSX),按天、按语言聚合。尊重 DNT。

```bash
cd backend
# 近 7 天各事件汇总
npx wrangler d1 execute html-share --remote --command \
  "SELECT day, name, lang, count FROM metrics WHERE day >= date('now','-7 day') ORDER BY day DESC, name"
# 验证'英文默认'假设:pv 的中英占比
npx wrangler d1 execute html-share --remote --command \
  "SELECT lang, SUM(count) FROM metrics WHERE name='pv' GROUP BY lang"
# 转化:安装点击 / 浏览
npx wrangler d1 execute html-share --remote --command \
  "SELECT name, SUM(count) FROM metrics GROUP BY name"
```

## 待办

- 联系/举报邮箱:`mengmajiang@gmail.com`(直接可收信)。举报仍需人工到 `reports` 表查看。
- [ ] (可选)举报到达时自动通知:Worker 里 `ctx.waitUntil(fetch(webhook))` 推到邮箱/Slack,免去手动查表。
- [ ] (上量后)把规则式 `isSuspicious`/`isPhishy` 升级为 Google Safe Browsing 等专业扫描。
