import {
  escapeHtml,
  getCampaignForTag,
  getJapanDay,
  getVisitorIdentity,
  type CampaignForTag,
  type Env,
  scalarParam,
} from "../lib/shared";

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
  const visitor = await getVisitorIdentity(context.request);

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

  const pointResult = await context.env.DB.prepare(
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
  )
    .bind(
      day,
      visitor.visitorHash,
      campaign.tag_id,
      campaign.campaign_id,
      campaign.point_value,
    )
    .run();

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  });

  if (visitor.setCookie) {
    headers.append("Set-Cookie", visitor.setCookie);
  }

  const awarded = (pointResult.meta.changes ?? 0) > 0;

  return new Response(renderAdPage(campaign, awarded), { headers });
};

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

function renderAdPage(campaign: CampaignForTag, awarded: boolean) {
  const media = renderMedia(campaign);
  const pointText = awarded
    ? `${campaign.point_value}ポイントを付与しました`
    : `本日は付与済みです`;

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(campaign.title)} | kazashiteGO</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f6ee;
        --ink: #17201a;
        --muted: #5f6b62;
        --line: #d9dfd4;
        --accent: #177245;
        --gold: #e7a622;
      }

      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 18px;
        color: var(--ink);
        background: var(--bg);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        width: min(480px, 100%);
        display: grid;
        gap: 14px;
      }

      .media {
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #ffffff;
      }

      img, video {
        display: block;
        width: 100%;
        aspect-ratio: 4 / 5;
        object-fit: cover;
      }

      .copy {
        display: grid;
        gap: 10px;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #ffffff;
      }

      .shelf {
        color: var(--accent);
        font-size: 0.84rem;
        font-weight: 800;
      }

      h1 {
        margin: 0;
        font-size: clamp(1.75rem, 8vw, 3.15rem);
        line-height: 1.03;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }

      .point {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        padding: 0 14px;
        border-radius: 8px;
        color: #2a2103;
        background: #ffe7a4;
        font-weight: 800;
      }

      .cta {
        display: inline-flex;
        min-height: 46px;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        color: #ffffff;
        background: var(--accent);
        font-weight: 800;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="media">${media}</section>
      <section class="copy">
        <span class="shelf">${escapeHtml(campaign.shelf_name)}</span>
        <h1>${escapeHtml(campaign.title)}</h1>
        <p>${escapeHtml(campaign.description)}</p>
        <div class="point"><span>${escapeHtml(pointText)}</span><span>${escapeHtml(
          campaign.store_name,
        )}</span></div>
        ${renderCta(campaign)}
      </section>
    </main>
  </body>
</html>`;
}

function renderMedia(campaign: CampaignForTag) {
  const src = escapeHtml(campaign.media_path);

  if (campaign.media_type === "video") {
    return `<video src="${src}" autoplay muted playsinline controls></video>`;
  }

  return `<img src="${src}" alt="${escapeHtml(campaign.title)}" />`;
}

function renderCta(campaign: CampaignForTag) {
  if (!campaign.cta_label || !campaign.cta_url || campaign.cta_url === "#") {
    return "";
  }

  return `<a class="cta" href="${escapeHtml(campaign.cta_url)}">${escapeHtml(
    campaign.cta_label,
  )}</a>`;
}
