import {
  getJapanDay,
  json,
  methodNotAllowed,
  requireAdmin,
  type Env,
} from "../../lib/shared";

type RangeMode = "daily" | "weekly" | "monthly";

type DailyTotalRow = {
  day: string;
  count: number;
};

type RawAnalyticsRow = {
  day: string;
  tag_id: string;
  tag_label: string;
  campaign_title: string;
  count: number;
};

type AnalyticsAccumulator = {
  count: number;
  campaign_title: string;
  period: string;
  tag_id: string;
  tag_label: string;
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
  const oldestDay = addDays(day, -370);

  const [
    tags,
    campaigns,
    dailyTotals,
    rawAnalytics,
    events,
    users,
    pointStats,
  ] = await Promise.all([
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
        SELECT day, SUM(count) AS count
        FROM scan_counts_daily
        WHERE day >= ?
        GROUP BY day
        ORDER BY day ASC
      `,
    )
      .bind(oldestDay)
      .all<DailyTotalRow>(),
    context.env.DB.prepare(
      `
        SELECT
          sc.day,
          sc.tag_id,
          t.label AS tag_label,
          c.title AS campaign_title,
          SUM(sc.count) AS count
        FROM scan_counts_daily sc
        INNER JOIN tags t ON t.id = sc.tag_id
        INNER JOIN campaigns c ON c.id = sc.campaign_id
        WHERE sc.day >= ?
        GROUP BY sc.day, sc.tag_id, t.label, c.title
        ORDER BY sc.day DESC, count DESC
      `,
    )
      .bind(oldestDay)
      .all<RawAnalyticsRow>(),
    context.env.DB.prepare(
      `
        SELECT
          se.id,
          se.occurred_at,
          datetime(se.occurred_at, '+9 hours') AS occurred_at_jst,
          strftime('%H:%M:%S', datetime(se.occurred_at, '+9 hours')) AS time_jst,
          se.user_id,
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
    context.env.DB.prepare(
      `
        SELECT
          u.id,
          COALESCE(u.display_name, '匿名ユーザー') AS display_name,
          u.linked_at,
          u.created_at,
          u.last_seen_at,
          COALESCE(b.balance, 0) AS balance,
          COALESCE(b.lifetime_points, 0) AS lifetime_points,
          COUNT(pt.id) AS reward_count,
          MAX(pt.occurred_at) AS latest_reward_at
        FROM users u
        LEFT JOIN user_point_balances b ON b.user_id = u.id
        LEFT JOIN point_transactions pt ON pt.user_id = u.id
        GROUP BY
          u.id,
          u.display_name,
          u.linked_at,
          u.created_at,
          u.last_seen_at,
          b.balance,
          b.lifetime_points
        ORDER BY u.last_seen_at DESC
        LIMIT 50
      `,
    ).all(),
    context.env.DB.prepare(
      `
        SELECT
          (
            SELECT COALESCE(SUM(points), 0)
            FROM point_transactions
            WHERE date(occurred_at, '+9 hours') = ?
          ) AS awarded_today,
          (
            SELECT COALESCE(SUM(balance), 0)
            FROM user_point_balances
          ) AS outstanding_points,
          (
            SELECT COUNT(*)
            FROM users
          ) AS user_count
      `,
    )
      .bind(day)
      .first(),
  ]);

  const chartSource = normalizeDailyTotals(dailyTotals.results);
  const analyticsSource = normalizeRawAnalytics(rawAnalytics.results);

  return json({
    day,
    range,
    tags: tags.results,
    campaigns: campaigns.results,
    analytics: buildAnalytics(analyticsSource, range).slice(0, 90),
    charts: {
      daily: buildDailyChart(chartSource, day),
      weekly: buildWeeklyChart(chartSource, day),
      monthly: buildMonthlyChart(chartSource, day),
    },
    events: events.results,
    users: users.results,
    pointStats: pointStats ?? {
      awarded_today: 0,
      outstanding_points: 0,
      user_count: 0,
    },
  });
};

function parseRange(value: string | null): RangeMode {
  if (value === "weekly" || value === "monthly") {
    return value;
  }

  return "daily";
}

function normalizeDailyTotals(rows: DailyTotalRow[] | undefined) {
  return (rows ?? []).map((row) => ({
    count: Number(row.count ?? 0),
    day: row.day,
  }));
}

function normalizeRawAnalytics(rows: RawAnalyticsRow[] | undefined) {
  return (rows ?? []).map((row) => ({
    campaign_title: row.campaign_title,
    count: Number(row.count ?? 0),
    day: row.day,
    tag_id: row.tag_id,
    tag_label: row.tag_label,
  }));
}

function buildDailyChart(rows: DailyTotalRow[], today: string) {
  const counts = new Map(rows.map((row) => [row.day, Number(row.count ?? 0)]));

  // 横軸が飛ばないよう、直近14日を0件の日も含めて固定表示します。
  return Array.from({ length: 14 }, (_, index) => {
    const day = addDays(today, index - 13);

    return {
      count: counts.get(day) ?? 0,
      label: formatDayLabel(day),
      period: day,
    };
  });
}

function buildWeeklyChart(rows: DailyTotalRow[], today: string) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const week = startOfWeek(row.day);
    counts.set(week, (counts.get(week) ?? 0) + Number(row.count ?? 0));
  }

  const currentWeek = startOfWeek(today);

  return Array.from({ length: 12 }, (_, index) => {
    const week = addDays(currentWeek, (index - 11) * 7);

    return {
      count: counts.get(week) ?? 0,
      label: `${formatDayLabel(week)}週`,
      period: week,
    };
  });
}

function buildMonthlyChart(rows: DailyTotalRow[], today: string) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const month = row.day.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + Number(row.count ?? 0));
  }

  return Array.from({ length: 12 }, (_, index) => {
    const month = addMonths(today.slice(0, 7), index - 11);

    return {
      count: counts.get(month) ?? 0,
      label: formatMonthLabel(month),
      period: month,
    };
  });
}

function buildAnalytics(rows: RawAnalyticsRow[], range: RangeMode) {
  const grouped = new Map<string, AnalyticsAccumulator>();

  for (const row of rows) {
    const period = getPeriod(row.day, range);
    const key = `${period.key}-${row.tag_id}-${row.campaign_title}`;
    const current = grouped.get(key);

    if (current) {
      current.count += Number(row.count ?? 0);
      continue;
    }

    grouped.set(key, {
      campaign_title: row.campaign_title,
      count: Number(row.count ?? 0),
      period: period.label,
      tag_id: row.tag_id,
      tag_label: row.tag_label,
    });
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.period === right.period) {
      return right.count - left.count;
    }

    return left.period < right.period ? 1 : -1;
  });
}

function getPeriod(day: string, range: RangeMode) {
  if (range === "weekly") {
    const week = startOfWeek(day);

    return { key: week, label: `${formatDayLabel(week)}週` };
  }

  if (range === "monthly") {
    const month = day.slice(0, 7);

    return { key: month, label: formatMonthLabel(month) };
  }

  return { key: day, label: day };
}

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);

  return date.toISOString().slice(0, 10);
}

function addMonths(month: string, amount: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);

  return date.toISOString().slice(0, 7);
}

function startOfWeek(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);

  return date.toISOString().slice(0, 10);
}

function formatDayLabel(day: string) {
  const [, month, date] = day.split("-");

  return `${Number(month)}/${Number(date)}`;
}

function formatMonthLabel(month: string) {
  const [year, monthValue] = month.split("-");

  return `${year}/${Number(monthValue)}`;
}
