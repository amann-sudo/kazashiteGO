import {
  getOrCreateUser,
  json,
  methodNotAllowed,
  type Env,
} from "../../lib/shared";

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== "GET") {
    return methodNotAllowed();
  }

  const { user, visitor } = await getOrCreateUser(context.env, context.request);
  const [balance, recentRewards, activeLocks] = await Promise.all([
    context.env.DB.prepare(
      `
        SELECT balance, lifetime_points, updated_at
        FROM user_point_balances
        WHERE user_id = ?
        LIMIT 1
      `,
    )
      .bind(user.id)
      .first(),
    context.env.DB.prepare(
      `
        SELECT
          pt.id,
          pt.points,
          pt.reason,
          pt.occurred_at,
          datetime(pt.occurred_at, '+9 hours') AS occurred_at_jst,
          t.label AS tag_label,
          c.title AS campaign_title
        FROM point_transactions pt
        INNER JOIN tags t ON t.id = pt.tag_id
        INNER JOIN campaigns c ON c.id = pt.campaign_id
        WHERE pt.user_id = ?
        ORDER BY pt.occurred_at DESC
        LIMIT 20
      `,
    )
      .bind(user.id)
      .all(),
    context.env.DB.prepare(
      `
        SELECT
          rl.campaign_id,
          rl.tag_id,
          rl.locked_until,
          datetime(rl.locked_until, '+9 hours') AS locked_until_jst,
          c.title AS campaign_title
        FROM reward_locks rl
        INNER JOIN campaigns c ON c.id = rl.campaign_id
        WHERE rl.user_id = ? AND rl.locked_until > datetime('now')
        ORDER BY rl.locked_until ASC
      `,
    )
      .bind(user.id)
      .all(),
  ]);

  const headers = new Headers();

  if (visitor.setCookie) {
    headers.append("Set-Cookie", visitor.setCookie);
  }

  return json(
    {
      user,
      balance: balance ?? { balance: 0, lifetime_points: 0 },
      recentRewards: recentRewards.results,
      activeLocks: activeLocks.results,
    },
    { headers },
  );
};
