-- 広告キャンペーン3本に合わせて、検証用NFC IDも3本に増やします。
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
    '玉ねぎ棚 NFC 01',
    'サンプルスーパー',
    '青果 / 玉ねぎ / カレー提案',
    'curry-night',
    5,
    1
  ),
  (
    'kg-0002',
    '玉ねぎ棚 NFC 02',
    'サンプルスーパー',
    '青果 / 玉ねぎ / スープ提案',
    'onion-soup',
    4,
    1
  ),
  (
    'kg-0003',
    '玉ねぎ棚 NFC 03',
    'サンプルスーパー',
    '青果 / 玉ねぎ / ハンバーグ提案',
    'onion-steak',
    6,
    1
  )
ON CONFLICT(id)
DO UPDATE SET
  label = excluded.label,
  store_name = excluded.store_name,
  shelf_name = excluded.shelf_name,
  active_campaign_id = excluded.active_campaign_id,
  point_value = excluded.point_value,
  enabled = excluded.enabled,
  updated_at = datetime('now');
