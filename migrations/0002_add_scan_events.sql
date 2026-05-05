-- 読み取りの秒単位履歴を保存するため、日次集計とは別にイベントテーブルを追加します。
CREATE TABLE IF NOT EXISTS scan_events (
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

CREATE INDEX IF NOT EXISTS idx_scan_events_day_time ON scan_events(day, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_tag_time ON scan_events(tag_id, occurred_at DESC);

-- 既存の付与履歴から、取得できる範囲の時刻だけを秒単位履歴へ補完します。
INSERT OR IGNORE INTO scan_events (
  id,
  occurred_at,
  day,
  tag_id,
  campaign_id,
  visitor_id_hash,
  user_agent
)
SELECT
  'claim-' || day || '-' || tag_id || '-' || visitor_id_hash,
  claimed_at,
  day,
  tag_id,
  campaign_id,
  visitor_id_hash,
  'backfilled-from-point-claims'
FROM point_claims;
