import {
  getJapanDay,
  json,
  methodNotAllowed,
  requireAdmin,
  type Env,
} from "../../lib/shared";

type RangeMode = "daily" | "weekly" | "monthly";

const periodSql: Record<RangeMode, string> = {
  daily: "sc.day",
  weekly: "strftime('%Y-W%W', sc.day)",
  monthly: "substr(sc.day, 1, 7)",
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);

  if (denied) {
    return denied;
  }

  if (context.request.method !== "GET") {
    return methodNotAllowed();
  }

  const url = new URL(context.request.url);
  const range = parseRange(url.searchParams.get("range"));
  const day = getJapanDay();

  const [tags, campaigns, analytics, dailyChart, weeklyChart, monthlyChart, events] = await Promise.all([
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
    context.env.DB.prepare(
      `
        SELECT day AS period, SUM(count) AS count
        FROM scan_counts_daily
        GROUP BY day
        ORDER BY day DESC
        LIMIT 14
      `,
    ).all(),
    context.env.DB.prepare(
      `
        SELECT strftime('%Y-W%W', day) AS period, SUM(count) AS count
        FROM scan_counts_daily
        GROUP BY period
        ORDER BY period DESC
        LIMIT 12
      `,
    ).all(),
    context.env.DB.prepare(
      `
        SELECT substr(day, 1, 7) AS period, SUM(count) AS count
        FROM scan_counts_daily
        GROUP BY period
        ORDER BY period DESC
        LIMIT 12
      `,
    ).all(),
    context.env.DB.prepare(
      `
        SELECT
          se.id,
          se.occurred_at,
          datetime(se.occurred_at, '+9 hours') AS occurred_at_jst,
          strftime('%H:%M:%S', datetime(se.occurred_at, '+9 hours')) AS time_jst,
          se.tag_id,
          t.label AS tag_label,
          c.title AS campaign_title,
          se.user_agent
        FROM scan_events se
        INNER JOIN tags t ON t.id = se.tag_id
        INNER JOIN campaigns c ON c.id = se.campaign_id
        WHERE se.day = ?
        ORDER BY se.occurred_at DESC
        LIMIT 120
      `,
    )
      .bind(day)
      .all(),
  ]);

  return json({
    day,
    range,
    tags: tags.results,
    campaigns: campaigns.results,
    analytics: analytics.results,
    charts: {
      daily: normalizeChart(dailyChart.results).reverse(),
      weekly: normalizeChart(weeklyChart.results).reverse(),
      monthly: normalizeChart(monthlyChart.results).reverse(),
    },
    events: events.results,
  });
};

function parseRange(value: string | null): RangeMode {
  if (value === "weekly" || value === "monthly") {
    return value;
  }

  return "daily";
}

function normalizeChart(rows: unknown[] | undefined) {
  return (rows ?? []).map((row) => {
    const point = row as { period?: string; count?: number };

    return {
      period: point.period ?? "",
      count: Number(point.count ?? 0),
    };
  });
}
