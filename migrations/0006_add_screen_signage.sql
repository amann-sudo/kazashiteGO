-- 棚前ディスプレイとNFC連動の動画切り替え履歴を追加します。
CREATE TABLE IF NOT EXISTS screens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  shelf_name TEXT NOT NULL,
  idle_title TEXT NOT NULL,
  idle_message TEXT NOT NULL,
  idle_media_path TEXT NOT NULL,
  idle_media_type TEXT NOT NULL DEFAULT 'image',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS screen_tag_routes (
  tag_id TEXT PRIMARY KEY,
  screen_id TEXT NOT NULL,
  display_seconds INTEGER NOT NULL DEFAULT 20,
  cooldown_seconds INTEGER NOT NULL DEFAULT 4,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tag_id) REFERENCES tags(id),
  FOREIGN KEY (screen_id) REFERENCES screens(id)
);

CREATE TABLE IF NOT EXISTS screen_events (
  id TEXT PRIMARY KEY,
  screen_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  user_id TEXT,
  display_seconds INTEGER NOT NULL DEFAULT 20,
  event_type TEXT NOT NULL DEFAULT 'nfc_switch',
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (screen_id) REFERENCES screens(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_screen_events_screen_time
  ON screen_events(screen_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_screen_events_tag_time
  ON screen_events(tag_id, occurred_at DESC);

INSERT INTO screens (
  id,
  name,
  store_name,
  shelf_name,
  idle_title,
  idle_message,
  idle_media_path,
  idle_media_type,
  enabled
) VALUES (
  'onion-shelf',
  '玉ねぎ棚サイネージ',
  'サンプルスーパー',
  '青果 / 玉ねぎ棚',
  '玉ねぎ棚のおすすめ',
  '棚のNFCにスマホをかざすと、近くの画面が関連広告に切り替わります。',
  '/ads/onion-curry.png',
  'image',
  1
)
ON CONFLICT(id)
DO UPDATE SET
  name = excluded.name,
  store_name = excluded.store_name,
  shelf_name = excluded.shelf_name,
  idle_title = excluded.idle_title,
  idle_message = excluded.idle_message,
  idle_media_path = excluded.idle_media_path,
  idle_media_type = excluded.idle_media_type,
  enabled = excluded.enabled,
  updated_at = datetime('now');

INSERT INTO screen_tag_routes (
  tag_id,
  screen_id,
  display_seconds,
  cooldown_seconds,
  enabled
) VALUES
  ('kg-0001', 'onion-shelf', 20, 4, 1),
  ('kg-0002', 'onion-shelf', 20, 4, 1),
  ('kg-0003', 'onion-shelf', 20, 4, 1)
ON CONFLICT(tag_id)
DO UPDATE SET
  screen_id = excluded.screen_id,
  display_seconds = excluded.display_seconds,
  cooldown_seconds = excluded.cooldown_seconds,
  enabled = excluded.enabled,
  updated_at = datetime('now');
