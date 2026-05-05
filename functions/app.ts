import {
  escapeHtml,
  getOrCreateUser,
  type Env,
} from "./lib/shared";

type BalanceRow = {
  balance: number;
  lifetime_points: number;
};

type RewardRow = {
  id: string;
  points: number;
  occurred_at_jst: string;
  tag_label: string;
  campaign_title: string;
};

type LockRow = {
  locked_until_jst: string;
  campaign_title: string;
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { user, visitor } = await getOrCreateUser(context.env, context.request);
  const [balance, rewards, locks] = await Promise.all([
    context.env.DB.prepare(
      `
        SELECT balance, lifetime_points
        FROM user_point_balances
        WHERE user_id = ?
        LIMIT 1
      `,
    )
      .bind(user.id)
      .first<BalanceRow>(),
    context.env.DB.prepare(
      `
        SELECT
          pt.id,
          pt.points,
          datetime(pt.occurred_at, '+9 hours') AS occurred_at_jst,
          t.label AS tag_label,
          c.title AS campaign_title
        FROM point_transactions pt
        INNER JOIN tags t ON t.id = pt.tag_id
        INNER JOIN campaigns c ON c.id = pt.campaign_id
        WHERE pt.user_id = ?
        ORDER BY pt.occurred_at DESC
        LIMIT 12
      `,
    )
      .bind(user.id)
      .all<RewardRow>(),
    context.env.DB.prepare(
      `
        SELECT
          datetime(rl.locked_until, '+9 hours') AS locked_until_jst,
          c.title AS campaign_title
        FROM reward_locks rl
        INNER JOIN campaigns c ON c.id = rl.campaign_id
        WHERE rl.user_id = ? AND rl.locked_until > datetime('now')
        ORDER BY rl.locked_until ASC
        LIMIT 12
      `,
    )
      .bind(user.id)
      .all<LockRow>(),
  ]);

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  });

  if (visitor.setCookie) {
    headers.append("Set-Cookie", visitor.setCookie);
  }

  return new Response(
    renderAppPage(user.id, balance ?? { balance: 0, lifetime_points: 0 }, rewards.results, locks.results),
    { headers },
  );
};

function renderAppPage(
  userId: string,
  balance: BalanceRow,
  rewards: RewardRow[],
  locks: LockRow[],
) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ポイント | kazashiteGO</title>
    <style>
      :root {
        --bg: #f4f7ef;
        --ink: #172019;
        --muted: #657068;
        --line: #dce3d8;
        --panel: #ffffff;
        --accent: #177245;
        --gold: #f0b323;
      }

      * { box-sizing: border-box; }

      body {
        min-height: 100vh;
        margin: 0;
        color: var(--ink);
        background:
          radial-gradient(circle at 18% 0%, #fff1bd 0, transparent 30%),
          var(--bg);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        width: min(520px, calc(100% - 24px));
        margin: 0 auto;
        display: grid;
        gap: 12px;
        padding: 22px 0 32px;
      }

      h1, h2, p { margin: 0; }

      .hero,
      .panel {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .hero {
        display: grid;
        gap: 14px;
        padding: 20px;
        background: linear-gradient(135deg, #ffffff 0%, #fff2bd 100%);
      }

      .eyebrow {
        color: var(--accent);
        font-size: 0.82rem;
        font-weight: 900;
      }

      h1 {
        font-size: clamp(2.2rem, 15vw, 4.8rem);
        line-height: 0.95;
      }

      .point {
        display: flex;
        align-items: end;
        gap: 8px;
      }

      .point strong {
        font-size: clamp(3.6rem, 18vw, 6.4rem);
        line-height: 0.9;
      }

      .point span {
        padding-bottom: 8px;
        font-size: 1.2rem;
        font-weight: 900;
      }

      .hero p,
      .panel p,
      .row span {
        color: var(--muted);
        line-height: 1.6;
      }

      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      a {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        color: #ffffff;
        background: var(--accent);
        font-weight: 900;
        text-decoration: none;
      }

      a.secondary {
        color: var(--accent);
        background: #edf6ef;
      }

      .panel {
        display: grid;
        gap: 10px;
        padding: 16px;
      }

      .row {
        display: grid;
        gap: 3px;
        padding: 10px 0;
        border-bottom: 1px solid var(--line);
      }

      .row:last-child {
        border-bottom: 0;
      }

      .row strong {
        font-size: 0.98rem;
      }

      .user-id {
        overflow-wrap: anywhere;
        color: var(--muted);
        font-size: 0.78rem;
      }

      @media (max-width: 420px) {
        .actions { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="eyebrow">kazashiteGO POINT</span>
        <h1>ポイント</h1>
        <div class="point">
          <strong>${escapeHtml(balance.balance)}</strong>
          <span>pt</span>
        </div>
        <p>ログインなしで仮保存中です。あとでログイン連携を追加すると、このポイントを会員アカウントに引き継げます。</p>
        <div class="actions">
          <a href="/t/kg-0001">NFC 01</a>
          <a href="/t/kg-0002">NFC 02</a>
          <a href="/t/kg-0003">NFC 03</a>
          <a class="secondary" href="/admin">管理画面</a>
        </div>
        <span class="user-id">匿名ユーザー: ${escapeHtml(userId)}</span>
      </section>

      <section class="panel">
        <h2>24時間ロック中の広告</h2>
        ${renderLocks(locks)}
      </section>

      <section class="panel">
        <h2>ポイント履歴</h2>
        ${renderRewards(rewards)}
      </section>
    </main>
  </body>
</html>`;
}

function renderRewards(rows: RewardRow[]) {
  if (rows.length === 0) {
    return `<p>まだポイント履歴がありません。</p>`;
  }

  return rows
    .map(
      (row) => `
        <div class="row">
          <strong>${escapeHtml(row.campaign_title)} / +${escapeHtml(row.points)}pt</strong>
          <span>${escapeHtml(row.tag_label)} / ${escapeHtml(row.occurred_at_jst)}</span>
        </div>
      `,
    )
    .join("");
}

function renderLocks(rows: LockRow[]) {
  if (rows.length === 0) {
    return `<p>現在ロック中の広告はありません。</p>`;
  }

  return rows
    .map(
      (row) => `
        <div class="row">
          <strong>${escapeHtml(row.campaign_title)}</strong>
          <span>${escapeHtml(row.locked_until_jst)} まで追加ポイントなし</span>
        </div>
      `,
    )
    .join("");
}
