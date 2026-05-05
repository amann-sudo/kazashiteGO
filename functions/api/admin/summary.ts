import {
  getJapanDay,
  json,
  methodNotAllowed,
  type Env,
} from "../../lib/shared";

type RangeMode = "daily" | "weekly" | "monthly";

const periodSql: Record<RangeMode, string> = {
  daily: "sc.day",
  weekly: "strftime('%Y-W%W', sc.day)",
  monthly: "substr(sc.day, 1, 7)",
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== "GET") {
    return methodNotAllowed();
  }

  const url = new URL(context.request.url);
  const range = parseRange(url.searchParams.get("range"));
  const day = getJapanDay();

  const [tags, campaigns, analytics] = await Promise.all([
    context.env.DB.prepare(
      `
        SELECT
          t.id,
          t.label,
          t.store_name,
          t.shelf_name,
          t.point_value,
          t.enabled,
          c.id AS campaign_id,
          c.title AS campaign_title,
          c.media_path,
          COALESCE(SUM(CASE WHEN sc.day = ? THEN sc.count ELSE 0 END), 0) AS today_count,
          COALESCE(SUM(sc.count), 0) AS total_count
        FROM tags t
        LEFT JOIN campaigns c ON c.id = t.active_campaign_id
        LEFT JOIN scan_counts_daily sc ON sc.tag_id = t.id
        GROUP BY
          t.id,
          t.label,
          t.store_name,
          t.shelf_name,
          t.point_value,
          t.enabled,
          c.id,
          c.title,
          c.media_path
        ORDER BY total_count DESC, t.id ASC
      `,
    )
      .bind(day)
      .all(),
    context.env.DB.prepare(
      `
        SELECT id, title, description, media_path, media_type, enabled
        FROM campaigns
        WHERE enabled = 1
        ORDER BY title ASC
      `,
    ).all(),
    context.env.DB.prepare(
      `
        SELECT
          ${periodSql[range]} AS period,
          sc.tag_id,
          t.label AS tag_label,
          c.title AS campaign_title,
          SUM(sc.count) AS count
        FROM scan_counts_daily sc
        INNER JOIN tags t ON t.id = sc.tag_id
        INNER JOIN campaigns c ON c.id = sc.campaign_id
        GROUP BY period, sc.tag_id, t.label, c.title
        ORDER BY period DESC, count DESC
        LIMIT 90
      `,
    ).all(),
  ]);

  return json({
    day,
    range,
    tags: tags.results,
    campaigns: campaigns.results,
    analytics: analytics.results,
  });
};

function parseRange(value: string | null): RangeMode {
  if (value === "weekly" || value === "monthly") {
    return value;
  }

  return "daily";
}
