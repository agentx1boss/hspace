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

## 待办

- [ ] 把 `abuse@zhanjian.space` 接到实际收件箱(Cloudflare Email Routing),或改 `backend/src/pages.ts` 里的 `CONTACT` 为你监控的邮箱。
- [ ] (可选)给举报到达发通知:Worker 里 `ctx.waitUntil(fetch(webhook))` 推到邮箱/Slack。
- [ ] (上量后)把规则式 `isSuspicious`/`isPhishy` 升级为 Google Safe Browsing 等专业扫描。
