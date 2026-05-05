import {
  json,
  methodNotAllowed,
  type Env,
  scalarParam,
} from "../../../lib/shared";

type UpdateTagRequest = {
  campaignId?: unknown;
  pointValue?: unknown;
  enabled?: unknown;
};

export const onRequest: PagesFunction<Env, "tagId"> = async (context) => {
  if (context.request.method !== "PATCH") {
    return methodNotAllowed();
  }

  const tagId = scalarParam(context.params.tagId);
  const body = (await context.request.json()) as UpdateTagRequest;
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const pointValue =
    typeof body.pointValue === "number" && Number.isInteger(body.pointValue)
      ? body.pointValue
      : null;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : null;

  if (!campaignId || pointValue === null || pointValue < 0 || pointValue > 9999 || enabled === null) {
    return json({ error: "更新内容が不正です。" }, { status: 400 });
  }

  const campaign = await context.env.DB.prepare(
    "SELECT id FROM campaigns WHERE id = ? AND enabled = 1 LIMIT 1",
  )
    .bind(campaignId)
    .first<{ id: string }>();

  if (!campaign) {
    return json({ error: "指定された広告が見つかりません。" }, { status: 404 });
  }

  const result = await context.env.DB.prepare(
    `
      UPDATE tags
      SET
        active_campaign_id = ?,
        point_value = ?,
        enabled = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `,
  )
    .bind(campaignId, pointValue, enabled ? 1 : 0, tagId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return json({ error: "NFCタグが見つかりません。" }, { status: 404 });
  }

  return json({ ok: true, tagId, campaignId, pointValue, enabled });
};
