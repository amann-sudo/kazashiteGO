-- kazashiteGOの初期スキーマです。NFCタグ、広告、日次集計、ポイント履歴をD1に保存します。
DROP TABLE IF EXISTS point_claims;
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
    '今夜は、香り立つカレー。',
    '玉ねぎ棚にタッチした買い物客へ、カレールーとの買い合わせを促す広告です。',
    '/ads/onion-curry.png',
    'image',
    '売り場で確認',
    '#',
    1
  ),
  (
    'onion-soup',
    '甘みを引き出すオニオンスープ。',
    '玉ねぎを使った温かいメニュー提案に切り替えるためのサンプル広告です。',
    '/ads/onion-curry.png',
    'image',
    'レシピを見る',
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
