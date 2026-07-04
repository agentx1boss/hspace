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

## 定位 / slogan 变更时的同步清单

改了 [positioning.md](positioning.md) 的定位或 slogan 后,以下触点要一并更新(否则会"门面挂旧招牌"):

- [ ] 落地页 `backend/src/landing.ts`(`L.en` / `L.zh`)+ OG 卡(`assets/og-card-1200x630.png` → 传 R2)
- [ ] 插件 `vscode-extension/`:README(中英)、package.json description(发新版)
- [ ] GitHub About(`gh repo edit --description`)
- [ ] **推广册子** `assets/promo/`:改完走 PATCH 升版(见该目录 README),线上 q0i7otn 链接/密码不变

## 第一方置顶内容(常驻,不过期)

**没有永久链接是产品级不变量**——API 与插件都产生不了永久页(`expiresIn:null` 只当"续到档内上限":匿名 7 天 / 登录 30 天)。唯一例外是我们自己的营销物料(promo 册子 q0i7otn / aqm3anv、落地演示):它们是**第一方置顶内容**,靠直接改库把 `expires_at` 置 NULL 常驻(servePage 把 NULL 当"无到期")。

```bash
cd backend
# 查看置顶状态(NULL = 常驻)
npx wrangler d1 execute html-share --remote --command \
  "SELECT slug, expires_at FROM pages WHERE slug IN ('q0i7otn','aqm3anv')"
# 置顶(仅限第一方营销物料;别拿它给用户页开后门)
npx wrangler d1 execute html-share --remote --command \
  "UPDATE pages SET expires_at = NULL WHERE slug = '<slug>'"
```

注意:promo 走**内容 PATCH**(只传 files,不带 expiresIn)升版时,`expires_at` 保持 NULL,不会被重置为 30 天;只有显式传 `expiresIn` 才会。要新发一本册子并常驻,发布后补一条上面的 UPDATE 即可。

## 待办

- 联系/举报邮箱:`mengmajiang@gmail.com`(直接可收信)。举报仍需人工到 `reports` 表查看。
- [ ] (可选)举报到达时自动通知:Worker 里 `ctx.waitUntil(fetch(webhook))` 推到邮箱/Slack,免去手动查表。
- [ ] (上量后)把规则式 `isSuspicious`/`isPhishy` 升级为 Google Safe Browsing 等专业扫描。
