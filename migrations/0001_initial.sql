-- kazashiteGOの初期スキーマです。NFCタグ、広告、日次集計、ポイント履歴をD1に保存します。
DROP TABLE IF EXISTS point_claims;
DROP TABLE IF EXISTS reward_locks;
DROP TABLE IF EXISTS point_transactions;
DROP TABLE IF EXISTS user_point_balances;
DROP TABLE IF EXISTS scan_events;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS scan_counts_daily;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS campaigns;

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  media_path TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  cta_label TEXT,
  cta_url TEXT,
  starts_at TEXT,
  ends_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  store_name TEXT NOT NULL,
  shelf_name TEXT NOT NULL,
  active_campaign_id TEXT NOT NULL,
  point_value INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (active_campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE scan_counts_daily (
  day TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, tag_id, campaign_id),
  FOREIGN KEY (tag_id) REFERENCES tags(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE scan_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  day TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  visitor_id_hash TEXT NOT NULL,
  user_agent TEXT,
  FOREIGN KEY (tag_id) REFERENCES tags(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  anonymous_id_hash TEXT NOT NULL UNIQUE,
  display_name TEXT,
  linked_provider TEXT,
  linked_subject TEXT,
  linked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_point_balances (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE point_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE reward_locks (
  user_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  locked_until TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, campaign_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE point_claims (
  day TEXT NOT NULL,
  visitor_id_hash TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, visitor_id_hash, tag_id),
  FOREIGN KEY (tag_id) REFERENCES tags(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE INDEX idx_scan_counts_day ON scan_counts_daily(day);
CREATE INDEX idx_scan_counts_tag ON scan_counts_daily(tag_id);
CREATE INDEX idx_scan_events_day_time ON scan_events(day, occurred_at DESC);
CREATE INDEX idx_scan_events_tag_time ON scan_events(tag_id, occurred_at DESC);
CREATE INDEX idx_point_transactions_user_time ON point_transactions(user_id, occurred_at DESC);
CREATE INDEX idx_reward_locks_until ON reward_locks(locked_until);
CREATE INDEX idx_point_claims_tag_day ON point_claims(tag_id, day);

INSERT INTO campaigns (
  id,
  title,
  description,
  media_path,
  media_type,
  cta_label,
  cta_url,
  enabled
) VALUES
  (
    'curry-night',
    '香り立つカレーで、今夜を決める。',
    '玉ねぎ、じゃがいも、にんじんを一緒に買いたくなる、青果売り場向けのカレー広告です。',
    '/ads/onion-curry.png',
    'image',
    '売り場で確認',
    '#',
    1
  ),
  (
    'onion-soup',
    '甘い玉ねぎで、朝のスープ支度。',
    '玉ねぎとパンの買い合わせを促す、温かいオニオンスープ広告です。',
    '/ads/onion-soup.png',
    'image',
    'レシピを見る',
    '#',
    1
  ),
  (
    'onion-steak',
    '玉ねぎソースで、ごちそうハンバーグ。',
    '夕食の主菜と青果の買い合わせを促す、玉ねぎソースのハンバーグ広告です。',
    '/ads/onion-steak.png',
    'image',
    '材料を見る',
    '#',
    1
  );

INSERT INTO tags (
  id,
  label,
  store_name,
  shelf_name,
  active_campaign_id,
  point_value,
  enabled
) VALUES
  (
    'kg-0001',
    '玉ねぎ棚 NFC',
    'サンプルスーパー',
    '青果 / 玉ねぎ',
    'curry-night',
    5,
    1
  );
