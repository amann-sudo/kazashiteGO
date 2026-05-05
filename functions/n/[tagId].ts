import {
  escapeHtml,
  getCampaignForTag,
  getJapanDay,
  getNextJapanDayStartUtc,
  getOrCreateUser,
  type AppUser,
  type CampaignForTag,
  type Env,
  scalarParam,
} from "../lib/shared";

type PointBalance = {
  balance: number;
  lifetime_points: number;
};

type ActiveLock = {
  locked_until: string;
};

type RewardResult = {
  awarded: boolean;
  balance: number;
  lifetimePoints: number;
  points: number;
  lockedUntil: string | null;
};

export const onRequest: PagesFunction<Env, "tagId"> = async (context) => {
  if (context.request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const tagId = scalarParam(context.params.tagId);
  const campaign = await getCampaignForTag(context.env, tagId);

  if (!campaign) {
    return renderNotFound(tagId);
  }

  const day = getJapanDay();
  const { user, visitor } = await getOrCreateUser(context.env, context.request);
  const userAgent = (context.request.headers.get("User-Agent") ?? "").slice(0, 240);

  // 読み取り回数とユーザー別ポイントは分けて保存し、広告閲覧自体は毎回分析できるようにします。
  await context.env.DB.prepare(
    `
      INSERT INTO scan_events (
        id,
        occurred_at,
        day,
        user_id,
        tag_id,
        campaign_id,
        visitor_id_hash,
        user_agent
      )
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      crypto.randomUUID(),
      day,
      user.id,
      campaign.tag_id,
      campaign.campaign_id,
      visitor.visitorHash,
      userAgent,
    )
    .run();

  await context.env.DB.prepare(
    `
      INSERT INTO scan_counts_daily (day, tag_id, campaign_id, count, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT(day, tag_id, campaign_id)
      DO UPDATE SET
        count = count + 1,
        updated_at = datetime('now')
    `,
  )
    .bind(day, campaign.tag_id, campaign.campaign_id)
    .run();

  const reward = await awardPointsIfUnlocked(
    context.env,
    campaign,
    user.id,
    visitor.visitorHash,
    day,
  );

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  });

  if (visitor.setCookie) {
    headers.append("Set-Cookie", visitor.setCookie);
  }

  return new Response(renderAdPage(campaign, user, reward), { headers });
};

async function awardPointsIfUnlocked(
  env: Env,
  campaign: CampaignForTag,
  userId: string,
  visitorHash: string,
  day: string,
): Promise<RewardResult> {
  const activeLock = await env.DB.prepare(
    `
      SELECT locked_until
      FROM reward_locks
      WHERE
        user_id = ?
        AND campaign_id = ?
        AND locked_until > datetime('now')
      LIMIT 1
    `,
  )
    .bind(userId, campaign.campaign_id)
    .first<ActiveLock>();

  if (activeLock) {
    const balance = await getPointBalance(env, userId);

    return {
      awarded: false,
      balance: balance.balance,
      lifetimePoints: balance.lifetime_points,
      lockedUntil: activeLock.locked_until,
      points: 0,
    };
  }

  const transactionId = crypto.randomUUID();
  const lockedUntil = getNextJapanDayStartUtc(day);

  // 日付が変わるまでのロックを広告キャンペーン単位で持ち、同じ広告からの重複付与を防ぎます。
  await env.DB.batch([
    env.DB.prepare(
      `
        INSERT INTO point_transactions (
          id,
          user_id,
          tag_id,
          campaign_id,
          points,
          reason,
          occurred_at
        )
        VALUES (?, ?, ?, ?, ?, 'nfc_ad_reward', datetime('now'))
      `,
    ).bind(
      transactionId,
      userId,
      campaign.tag_id,
      campaign.campaign_id,
      campaign.point_value,
    ),
    env.DB.prepare(
      `
        INSERT INTO user_point_balances (
          user_id,
          balance,
          lifetime_points,
          updated_at
        )
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id)
        DO UPDATE SET
          balance = balance + excluded.balance,
          lifetime_points = lifetime_points + excluded.lifetime_points,
          updated_at = datetime('now')
      `,
    ).bind(userId, campaign.point_value, campaign.point_value),
    env.DB.prepare(
      `
        INSERT INTO reward_locks (
          user_id,
          campaign_id,
          tag_id,
          locked_until,
          updated_at
        )
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, campaign_id)
        DO UPDATE SET
          tag_id = excluded.tag_id,
          locked_until = excluded.locked_until,
          updated_at = datetime('now')
      `,
    ).bind(userId, campaign.campaign_id, campaign.tag_id, lockedUntil),
    env.DB.prepare(
      `
        INSERT OR IGNORE INTO point_claims (
          day,
          visitor_id_hash,
          tag_id,
          campaign_id,
          points
        )
        VALUES (?, ?, ?, ?, ?)
      `,
    ).bind(
      day,
      visitorHash,
      campaign.tag_id,
      campaign.campaign_id,
      campaign.point_value,
    ),
  ]);

  const balance = await getPointBalance(env, userId);
  const awardedLock = await env.DB.prepare(
    `
      SELECT locked_until
      FROM reward_locks
      WHERE user_id = ? AND campaign_id = ?
      LIMIT 1
    `,
  )
    .bind(userId, campaign.campaign_id)
    .first<ActiveLock>();

  return {
    awarded: true,
    balance: balance.balance,
    lifetimePoints: balance.lifetime_points,
    lockedUntil: awardedLock?.locked_until ?? null,
    points: campaign.point_value,
  };
}

async function getPointBalance(env: Env, userId: string) {
  const balance = await env.DB.prepare(
    `
      SELECT balance, lifetime_points
      FROM user_point_balances
      WHERE user_id = ?
      LIMIT 1
    `,
  )
    .bind(userId)
    .first<PointBalance>();

  return {
    balance: Number(balance?.balance ?? 0),
    lifetime_points: Number(balance?.lifetime_points ?? 0),
  };
}

function renderNotFound(tagId: string) {
  return new Response(
    `<!doctype html><html lang="ja"><body><h1>NFCタグが見つかりません</h1><p>${escapeHtml(
      tagId,
    )}</p></body></html>`,
    {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

function renderAdPage(
  campaign: CampaignForTag,
  user: AppUser,
  reward: RewardResult,
) {
  const pointHeadline = reward.awarded
    ? `${reward.points}pt 獲得`
    : "本日分は付与済み";
  const pointMessage = reward.awarded
    ? "この広告のポイントを付与しました。"
    : `${formatLockTime(reward.lockedUntil)} にリセットされます。`;

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="format-detection" content="telephone=no" />
    <title>${escapeHtml(campaign.title)} | kazashiteGO</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7ef;
        --ink: #162018;
        --muted: #5c665d;
        --line: #dbe1d6;
        --accent: #176d43;
        --accent-2: #d9272e;
        --gold: #f2b21f;
        --cream: #fff8e4;
      }

      * { box-sizing: border-box; }

      body {
        min-height: 100vh;
        margin: 0;
        color: var(--ink);
        background:
          radial-gradient(circle at 12% 4%, #fff5c8 0, transparent 32%),
          linear-gradient(180deg, #f7f8ef 0%, #edf2ea 100%);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        width: min(520px, 100%);
        min-height: 100vh;
        margin: 0 auto;
        display: grid;
        align-content: start;
        gap: 12px;
        padding: 12px 12px 22px;
      }

      .creative {
        position: relative;
        min-height: 560px;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 22px 60px rgba(17, 32, 21, 0.14);
      }

      .creative img,
      .creative video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform: scale(1.035);
        animation: slowZoom 9s ease-in-out infinite alternate;
      }

      .creative::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.12) 32%, rgba(9,22,12,0.08) 68%, rgba(9,22,12,0.66) 100%),
          radial-gradient(circle at 22% 24%, rgba(255, 210, 49, 0.55), transparent 28%);
        z-index: 1;
      }

      .creative::after {
        content: "";
        position: absolute;
        left: -25%;
        top: 42%;
        width: 150%;
        height: 54px;
        transform: rotate(-8deg);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.72), transparent);
        z-index: 2;
        animation: shine 3.6s ease-in-out infinite;
      }

      .ad-copy {
        position: relative;
        z-index: 3;
        display: grid;
        gap: 10px;
        padding: 18px;
      }

      .badge {
        width: fit-content;
        border-radius: 999px;
        padding: 7px 12px;
        color: #ffffff;
        background: var(--accent-2);
        font-size: 0.82rem;
        font-weight: 900;
        letter-spacing: 0;
        box-shadow: 0 8px 18px rgba(217, 39, 46, 0.3);
        animation: pop 1.8s ease-in-out infinite;
      }

      h1 {
        width: min(360px, 84%);
        margin: 0;
        font-size: clamp(2.1rem, 10vw, 4.2rem);
        line-height: 0.98;
        letter-spacing: 0;
        text-shadow: 0 2px 0 #ffffff;
      }

      .description {
        width: min(340px, 86%);
        margin: 0;
        color: #314036;
        font-size: 0.96rem;
        font-weight: 700;
        line-height: 1.65;
      }

      .point-card {
        position: relative;
        z-index: 4;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: center;
        margin: -74px 12px 0;
        border: 1px solid rgba(255,255,255,0.8);
        border-radius: 8px;
        padding: 14px;
        color: #211905;
        background: linear-gradient(135deg, #fff3bc, #ffc94d);
        box-shadow: 0 16px 34px rgba(41, 33, 6, 0.2);
      }

      .point-card strong {
        display: block;
        font-size: 1.55rem;
        line-height: 1.05;
      }

      .point-card span,
      .point-card p {
        margin: 0;
      }

      .point-card p {
        grid-column: 1 / -1;
        color: #4a3b0a;
        font-size: 0.88rem;
        font-weight: 700;
        line-height: 1.5;
      }

      .balance {
        display: grid;
        min-width: 96px;
        justify-items: end;
        color: #1d2a20;
        font-weight: 900;
      }

      .balance b {
        font-size: 1.9rem;
        line-height: 1;
      }

      .app-card {
        display: grid;
        gap: 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
        background: #ffffff;
      }

      .app-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }

      .app-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .app-actions a {
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

      .app-actions a.secondary {
        color: var(--accent);
        background: #edf6ef;
      }

      .user-id {
        overflow-wrap: anywhere;
        color: #6b746d;
        font-size: 0.78rem;
      }

      @keyframes slowZoom {
        from { transform: scale(1.02) translateY(0); }
        to { transform: scale(1.08) translateY(-8px); }
      }

      @keyframes shine {
        0%, 42% { transform: translateX(-30%) rotate(-8deg); opacity: 0; }
        58% { opacity: 1; }
        100% { transform: translateX(35%) rotate(-8deg); opacity: 0; }
      }

      @keyframes pop {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }

      @media (max-width: 420px) {
        .creative { min-height: 500px; }
        .app-actions { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="creative">
        ${renderMedia(campaign)}
        <div class="ad-copy">
          <span class="badge">売り場おすすめ</span>
          <h1>${escapeHtml(campaign.title)}</h1>
          <p class="description">${escapeHtml(campaign.description)}</p>
        </div>
      </section>

      <section class="point-card">
        <div>
          <span>${escapeHtml(pointMessage)}</span>
          <strong>${escapeHtml(pointHeadline)}</strong>
        </div>
        <div class="balance">
          <span>保有</span>
          <b>${escapeHtml(reward.balance)}pt</b>
        </div>
        <p>${escapeHtml(campaign.store_name)} / ${escapeHtml(
          campaign.shelf_name,
        )}</p>
      </section>

      <section class="app-card">
        <p>ログインなしでポイントを仮保存しています。あとでログイン連携を追加すると、この匿名ポイントを会員アカウントへ引き継げる設計です。</p>
        <div class="app-actions">
          <a href="/app">ポイントを見る</a>
          ${renderCta(campaign)}
        </div>
        <span class="user-id">匿名ユーザー: ${escapeHtml(user.id)}</span>
      </section>
    </main>
  </body>
</html>`;
}

function renderMedia(campaign: CampaignForTag) {
  const src = escapeHtml(campaign.media_path);

  if (campaign.media_type === "video") {
    return `<video src="${src}" autoplay muted playsinline loop></video>`;
  }

  return `<img src="${src}" alt="${escapeHtml(campaign.title)}" />`;
}

function renderCta(campaign: CampaignForTag) {
  if (!campaign.cta_label || !campaign.cta_url || campaign.cta_url === "#") {
    return `<a class="secondary" href="/app">あとで使う</a>`;
  }

  return `<a class="secondary" href="${escapeHtml(campaign.cta_url)}">${escapeHtml(
    campaign.cta_label,
  )}</a>`;
}

function formatLockTime(value: string | null) {
  if (!value) {
    return "明日";
  }

  const date = new Date(`${value.replace(" ", "T")}Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(date);
}
