-- ポイント再付与のロックを、24時間経過ではなく日本時間の日付変更で解除する形に揃えます。
UPDATE reward_locks
SET
  locked_until = (
    SELECT datetime(date(MAX(pt.occurred_at), '+9 hours') || ' 15:00:00')
    FROM point_transactions pt
    WHERE
      pt.user_id = reward_locks.user_id
      AND pt.campaign_id = reward_locks.campaign_id
  ),
  updated_at = datetime('now')
WHERE EXISTS (
  SELECT 1
  FROM point_transactions pt
  WHERE
    pt.user_id = reward_locks.user_id
    AND pt.campaign_id = reward_locks.campaign_id
);
