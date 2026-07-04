# 设计:每人一链 / 多口令 + 撤回

> 状态:✅ 已交付(v0.3.0)· 本文为设计记录
> 一句话:同一个链接,给每个人一个独立密码——谁看了你清楚,踢一个人不用换所有人的密码。

## 模型选择:一链多口令(而非一人一 URL)

选 **同一个链接 + 每人一个密码**,不是每人一个不同 URL。理由:

- **最贴产品身份。** "链接 + 密码"已是 HSpace 的仪式,这只是把"一个密码"变成"每人一个密码",概念零负担。
- **踢人不换全员密码**(路线图原话):撤销某个密码,其他人无感。
- **按人归因访问回执**:某个密码被用来看了几次、最近何时看——直接升级 v0 的总量统计。

一人一 URL 的方案(token in URL、免密)留到以后有"免密分享"需求时再说。

## 概念:访问人(Grant)

一个页面/合集可以有多个 **访问人(grant)**,每个:
- 有标签(如"张三""客户 A")、独立密码(默认随机 4 位)
- 独立的访问计数与最近访问时间
- 可单独撤销(软删,保留统计)

页面原有的单一 `password_hash` 仍然保留,作为"共享密码"与访问人并存:输入的密码命中共享密码或任一未撤销的访问人即放行。

## 数据模型(新增表,不改 pages)

```sql
CREATE TABLE grants (
  id            TEXT PRIMARY KEY,      -- 随机 id
  slug          TEXT NOT NULL,         -- 所属页面
  label         TEXT,                  -- 访问人标签
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  revoked       INTEGER NOT NULL DEFAULT 0,
  hits          INTEGER NOT NULL DEFAULT 0,   -- 该访问人的浏览次数
  last_seen_at  INTEGER                        -- 最近访问 epoch 秒
);
CREATE INDEX idx_grants_slug ON grants(slug);
```

## 边缘密码门的变化

Cookie 里编码 grantId,用于按人归因:
- 签名 Cookie 载荷 `<slug>.<grantId>.<exp>`(旧的 `<slug>.<exp>` 三段格式兼容解析为 grantId="")。
- POST 密码:先比对页面共享密码(命中 → grantId="");否则逐个比对未撤销 grant 的密码(命中 → grantId=该 id)。全不中才计入防爆破失败。
- 每次成功服务的浏览:page.hits +1;若 Cookie 带 grantId,则该 grant.hits +1、last_seen 更新。

## API(owner Bearer 或 X-Edit-Token 鉴权)

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/pages/:slug/grants` | 创建访问人 `{label?}` → 返回 `{id, label, password, url}`(密码仅此一次返回) |
| GET | `/pages/:slug/grants` | 列出访问人(不含密码):`{id,label,createdAt,revoked,hits,lastSeenAt}` |
| DELETE | `/pages/:slug/grants/:id` | 撤销(软删,该密码立即失效,统计保留) |

密码只在创建时返回一次(只存哈希);之后不可再取,想给新密码就撤销后重建。

## 插件 UX

页面节点右键「管理访问人」→ QuickPick:
- `➕ 添加访问人` → 输标签 → 创建 → **链接 + 该人密码**进剪贴板 + 提示
- 每个访问人一行:`标签 · 👁 N · 最近 …`,选中 → `撤销访问`(二次确认)

密码遵循既有模式:创建时即复制,不事后回看。

## 边界与取舍

- 密码只存哈希,创建后不可回看——与"发布即复制"一致。
- 撤销是软删:密码失效,但历史访问统计保留(私域回执的价值)。
- 合集同样适用(grant 作用于整个合集,与共享密码一致)。
- 匿名发布者用 editToken 也能管理访问人(与改密码/删除同权)。

## 里程碑

**MVP(v0.3.0)**:grants 表、三个 API、边缘门按人归因、插件「管理访问人」。
**后续**:每人独立有效期/次数上限;访问回执时间线;导出。
