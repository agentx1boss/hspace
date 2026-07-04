# 设计:内容版本化

> 状态:✅ 已交付(v0.4.0)· 本文为设计记录
> 一句话:链接不变,内容随迭代更新;保留历史,可回滚。

## 目标

AI 产物是被反复改的。"发一版 → 要改 → 再发一版"不应该产生一堆新链接。版本化让**同一个链接、同一个密码**承载不断迭代的内容,并保留历史、可回滚——把一次性分享变成"活的链接"。

## 关键决策:更新对所有人可用(放开匿名限制)

此前"匿名不可覆盖内容"是防钓鱼的纵深措施。版本化 MVP 放开它:

- 每次更新都重新跑内容扫描(isSuspicious / isPhishy),这才是真正的防线;
- 页面本就密码门 + noindex,钓鱼分发向量很弱;
- 把核心价值锁给登录用户会架空这个功能(产品是匿名优先的)。

匿名凭 editToken 即可更新自己的页面。README 的匿名/登录能力表相应更新。

## 数据模型

pages 增列(新装在 CREATE 中;线上一次性 ALTER):
- `version INTEGER NOT NULL DEFAULT 1` —— 当前版本号
- `updated_at INTEGER` —— 最近更新 epoch 秒(初始 = created_at)

新增 versions 表(保留每版内容指针):
```sql
CREATE TABLE versions (
  slug        TEXT NOT NULL,
  version     INTEGER NOT NULL,
  object_key  TEXT NOT NULL,   -- 该版本内容在 R2 的 key(合集为 index.json)
  size_bytes  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (slug, version)
);
```

## 存储布局(不破坏现有页面)

- 当前内容始终由 `pages.object_key` 指向。
- v1 沿用现有 key:单页 `pages/<slug>.<ext>`,合集 `pages/<slug>/index.json`(+ 同目录篇目)。
- v2+ 写到带版本的 key:单页 `pages/<slug>.v<n>.<ext>`;合集 `pages/<slug>/v<n>/index.json`(+ 同目录篇目)。
- 合集服务改为**按 index.json 所在目录**取篇目(v1 与 vN 通用),不再硬编码 `pages/<slug>/`。

## 语义

- **发布**:version=1,写 versions 行。
- **更新内容**(PATCH 带 html/markdown/files):版本 = 当前+1,写新版对象,repoint object_key、version、updated_at、size,写 versions 行;旧版对象保留。合集更新 = 整组替换(即"篇目增删改")。
- **回滚**(POST /pages/:slug/versions/:v/restore):把 object_key 指回该版对象,version 递增一格并写 versions 行(复用旧对象,不复制)。历史保持线性,"当前 = 最大版本"。
- **删除**:按前缀清 `pages/<slug>/`(合集各版)与 `pages/<slug>.`(单页各版)。

## API(owner Bearer 或 X-Edit-Token)

| 方法 | 路径 | 说明 |
|---|---|---|
| PATCH | `/pages/:slug` | 带 html/markdown/files 即更新内容并升版(类型需一致) |
| GET | `/pages/:slug/versions` | 列版本 `{version,createdAt,sizeBytes}` |
| POST | `/pages/:slug/versions/:v/restore` | 回滚到某版(升为新版) |

`/stats` 响应加 `version`、`updatedAt`,插件面板一次刷新即得。

## 接收方可见

Markdown 阅读页与合集目录页:当 version>1 时,页脚/元信息显示"更新于 <日期>",让读者知道内容是新的。HTML 篇目不改(不篡改用户内容)。

## 插件 UX

- 页面节点 →「更新内容」:单页用当前编辑器文件(类型需匹配)PATCH;合集重新选文件夹整组替换。
- 节点 tooltip 显示 `v{n} · 更新于 …`。
- 「版本历史」→ 列表 → 回滚到某版(二次确认)。

## 里程碑

**MVP(v0.4.0)**:版本表、单页+合集更新升版、列表、回滚、接收方"更新于"、插件更新/历史/回滚。
**后续**:版本命名/备注、查看任意旧版内容、diff。
