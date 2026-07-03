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
