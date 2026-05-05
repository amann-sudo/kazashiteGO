-- 匿名ユーザー、ポイント残高、ポイント取引、24時間ロックを追加します。
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  anonymous_id_hash TEXT NOT NULL UNIQUE,
  display_name TEXT,
  linked_provider TEXT,
  linked_subject TEXT,
  linked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_point_balances (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS point_transactions (
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

CREATE TABLE IF NOT EXISTS reward_locks (
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

-- 既存のscan_eventsにuser_id列がない環境へ追加します。すでにある場合は本番では手動適用時にスキップします。
ALTER TABLE scan_events ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_scan_events_user_time ON scan_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user_time ON point_transactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_locks_until ON reward_locks(locked_until);

-- 既存の匿名訪問者からユーザーを復元します。
INSERT OR IGNORE INTO users (
  id,
  anonymous_id_hash,
  created_at,
  last_seen_at
)
SELECT
  'anon_' || substr(visitor_id_hash, 1, 24),
  visitor_id_hash,
  MIN(occurred_at),
  MAX(occurred_at)
FROM scan_events
WHERE visitor_id_hash IS NOT NULL AND visitor_id_hash != ''
GROUP BY visitor_id_hash;

UPDATE scan_events
SET user_id = 'anon_' || substr(visitor_id_hash, 1, 24)
WHERE user_id IS NULL AND visitor_id_hash IS NOT NULL AND visitor_id_hash != '';

-- 旧ポイント履歴をポイント取引へ補完し、ユーザー別残高を作ります。
INSERT OR IGNORE INTO point_transactions (
  id,
  user_id,
  tag_id,
  campaign_id,
  points,
  reason,
  occurred_at
)
SELECT
  'legacy-' || day || '-' || tag_id || '-' || substr(visitor_id_hash, 1, 16),
  'anon_' || substr(visitor_id_hash, 1, 24),
  tag_id,
  campaign_id,
  points,
  'legacy_daily_claim',
  claimed_at
FROM point_claims;

INSERT OR IGNORE INTO user_point_balances (
  user_id,
  balance,
  lifetime_points,
  updated_at
)
SELECT
  user_id,
  SUM(points),
  SUM(points),
  MAX(occurred_at)
FROM point_transactions
GROUP BY user_id;

-- 既存の付与済み広告は、最後の付与から24時間ロック済みとして扱います。
INSERT OR REPLACE INTO reward_locks (
  user_id,
  campaign_id,
  tag_id,
  locked_until,
  updated_at
)
SELECT
  user_id,
  campaign_id,
  tag_id,
  datetime(MAX(occurred_at), '+1 day'),
  datetime('now')
FROM point_transactions
GROUP BY user_id, campaign_id;

INSERT OR REPLACE INTO campaigns (
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
