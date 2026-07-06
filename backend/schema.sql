-- HTML Share —— D1 建表
-- 应用：wrangler d1 execute html-share --file=./schema.sql

CREATE TABLE IF NOT EXISTS pages (
  slug             TEXT PRIMARY KEY,
  owner_id         TEXT,                 -- 登录用户 id；匿名为 NULL
  edit_token_hash  TEXT,                 -- 匿名编辑/删除凭据的哈希
  object_key       TEXT NOT NULL,        -- R2 中的对象 key
  filename         TEXT,                 -- 展示用文件名/标题
  password_hash    TEXT,                 -- PBKDF2 派生（base64）；无密码为 NULL
  password_salt    TEXT,                 -- base64
  created_at       INTEGER NOT NULL,     -- epoch 秒
  expires_at       INTEGER,              -- epoch 秒；NULL=永不过期
  size_bytes       INTEGER NOT NULL,
  hits             INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active', -- active | deleted | blocked
  version          INTEGER NOT NULL DEFAULT 1,     -- 当前内容版本号
  updated_at       INTEGER                         -- 最近更新 epoch 秒；初始 = created_at
);

CREATE INDEX IF NOT EXISTS idx_pages_owner   ON pages(owner_id);
CREATE INDEX IF NOT EXISTS idx_pages_expires ON pages(expires_at);

-- 内容版本历史：每次更新写一行，object_key 指向该版内容
CREATE TABLE IF NOT EXISTS versions (
  slug        TEXT NOT NULL,
  version     INTEGER NOT NULL,
  object_key  TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (slug, version)
);

-- 第一方边缘埋点:落地页转化聚合计数(无 Cookie、不存 IP、无 PII)
CREATE TABLE IF NOT EXISTS metrics (
  day    TEXT NOT NULL,           -- YYYY-MM-DD
  name   TEXT NOT NULL,           -- pv | install | try | gh | vsx
  lang   TEXT NOT NULL DEFAULT '',-- en | zh
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name, lang)
);

-- 举报：违规内容举报,后台人工处理/下架
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  slug        TEXT,                 -- 被举报页面(可空,允许只填链接)
  reason      TEXT,                 -- 分类:phishing/malware/copyright/other
  detail      TEXT,                 -- 补充说明
  reporter    TEXT,                 -- 举报人联系方式(可选)
  ip_hash     TEXT,                 -- 举报者 IP 哈希(防刷)
  created_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open'  -- open | actioned | dismissed
);

-- 访问人（每人一链 / 多口令）：一个页面可发多个独立密码，各自计数、可单独撤销
CREATE TABLE IF NOT EXISTS grants (
  id             TEXT PRIMARY KEY,     -- 随机 id
  slug           TEXT NOT NULL,        -- 所属页面
  label          TEXT,                 -- 访问人标签（如"张三"）
  password_hash  TEXT NOT NULL,        -- PBKDF2 派生（base64）
  password_salt  TEXT NOT NULL,        -- base64
  created_at     INTEGER NOT NULL,     -- epoch 秒
  revoked        INTEGER NOT NULL DEFAULT 0,
  hits           INTEGER NOT NULL DEFAULT 0,   -- 该访问人的浏览次数
  last_seen_at   INTEGER                        -- 最近访问 epoch 秒
);
CREATE INDEX IF NOT EXISTS idx_grants_slug ON grants(slug);

-- 简单的 API Key 表（MVP：注册后在网站生成）
CREATE TABLE IF NOT EXISTS api_keys (
  key_hash    TEXT PRIMARY KEY,   -- key 的 SHA-256（base64）
  owner_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0
);

-- 登录用户(GitHub OAuth):owner_id = 'gh:<github_numeric_id>'
CREATE TABLE IF NOT EXISTS users (
  owner_id      TEXT PRIMARY KEY,
  github_login  TEXT NOT NULL,      -- 展示用,每次登录刷新
  created_at    INTEGER NOT NULL,   -- epoch 秒
  last_login_at INTEGER NOT NULL
);

-- 读者收藏(一期:引用型收藏):读者把收到的稿存进自己账号,不复制内容、不发新链接。
-- 打开时凭「钥匙引用」重验源稿当前口令是否仍有效(撤回照常生效):
--   grant_id 非空 = 保存时走的访问人口令,重验 = 该 grant 仍未撤销;
--   grant_id 空且 key_hash 非空 = 保存时走的共享密码,重验 = key_hash 仍等于源稿当前 password_hash;
--   两者皆空 = 保存时源稿无口令,打开直接跳转(源稿若后来加了口令,自动回落密码门)。
CREATE TABLE IF NOT EXISTS saves (
  owner_id    TEXT NOT NULL,        -- 收藏者(users.owner_id)
  slug        TEXT NOT NULL,        -- 源稿(天然 lineage,二期快照复用)
  grant_id    TEXT,                 -- 保存时所用访问人 id;共享密码/无口令为 NULL
  key_hash    TEXT,                 -- 共享密码保存时的 password_hash 快照;grant/无口令为 NULL
  title       TEXT,                 -- 冗余存标题,源稿失效后仍可显示
  created_at  INTEGER NOT NULL,     -- epoch 秒
  PRIMARY KEY (owner_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_saves_owner ON saves(owner_id);
