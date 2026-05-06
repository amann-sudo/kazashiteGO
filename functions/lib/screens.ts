import {
  type CampaignForTag,
  type Env,
} from "./shared";

type ScreenRow = {
  id: string;
  name: string;
  store_name: string;
  shelf_name: string;
  idle_title: string;
  idle_message: string;
  idle_media_path: string;
  idle_media_type: string;
};

type ScreenRouteRow = {
  screen_id: string;
  screen_name: string;
  screen_store_name: string;
  screen_shelf_name: string;
  display_seconds: number;
  cooldown_seconds: number;
};

type ScreenEventRow = {
  id: string;
  occurred_at: string;
  display_seconds: number;
  tag_id: string;
  tag_label: string;
  campaign_id: string;
  title: string;
  description: string;
  media_path: string;
  media_type: string;
  store_name: string;
  shelf_name: string;
};

type ScreenRouteSummaryRow = {
  tag_id: string;
  tag_label: string;
  campaign_title: string;
  display_seconds: number;
  cooldown_seconds: number;
};

export type ScreenPayload = {
  campaignId: string | null;
  description: string;
  displaySeconds: number;
  eventId: string | null;
  expiresAt: string | null;
  kind: "campaign" | "idle";
  mediaPath: string;
  mediaType: string;
  screenId: string;
  shelfName: string;
  storeName: string;
  tagId: string | null;
  tagLabel: string | null;
  title: string;
  triggeredAt: string | null;
};

export type ScreenState = {
  current: ScreenPayload;
  routes: Array<{
    campaignTitle: string;
    cooldownSeconds: number;
    displaySeconds: number;
    tagId: string;
    tagLabel: string;
  }>;
  screen: {
    id: string;
    name: string;
    shelfName: string;
    storeName: string;
  };
};

export async function getScreenState(env: Env, screenId: string) {
  const screen = await getScreen(env, screenId);

  if (!screen) {
    return null;
  }

  const [latest, routes] = await Promise.all([
    env.DB.prepare(
      `
        SELECT
          se.id,
          se.occurred_at,
          se.display_seconds,
          se.tag_id,
          t.label AS tag_label,
          se.campaign_id,
          c.title,
          c.description,
          c.media_path,
          c.media_type,
          t.store_name,
          t.shelf_name
        FROM screen_events se
        INNER JOIN tags t ON t.id = se.tag_id
        INNER JOIN campaigns c ON c.id = se.campaign_id
        WHERE
          se.screen_id = ?
          AND se.event_type = 'nfc_switch'
        ORDER BY se.occurred_at DESC
        LIMIT 1
      `,
    )
      .bind(screenId)
      .first<ScreenEventRow>(),
    env.DB.prepare(
      `
        SELECT
          str.tag_id,
          t.label AS tag_label,
          c.title AS campaign_title,
          str.display_seconds,
          str.cooldown_seconds
        FROM screen_tag_routes str
        INNER JOIN tags t ON t.id = str.tag_id
        INNER JOIN campaigns c ON c.id = t.active_campaign_id
        WHERE str.screen_id = ? AND str.enabled = 1
        ORDER BY str.tag_id ASC
      `,
    )
      .bind(screenId)
      .all<ScreenRouteSummaryRow>(),
  ]);

  return {
    current: latest && isEventActive(latest)
      ? buildCampaignPayload(screen.id, latest)
      : buildIdlePayload(screen),
    routes: (routes.results ?? []).map((route) => ({
      campaignTitle: route.campaign_title,
      cooldownSeconds: Number(route.cooldown_seconds ?? 0),
      displaySeconds: Number(route.display_seconds ?? 0),
      tagId: route.tag_id,
      tagLabel: route.tag_label,
    })),
    screen: {
      id: screen.id,
      name: screen.name,
      shelfName: screen.shelf_name,
      storeName: screen.store_name,
    },
  } satisfies ScreenState;
}

export async function notifyScreenSwitch(
  env: Env,
  campaign: CampaignForTag,
  userId: string,
) {
  const route = await env.DB.prepare(
    `
      SELECT
        str.screen_id,
        s.name AS screen_name,
        s.store_name AS screen_store_name,
        s.shelf_name AS screen_shelf_name,
        str.display_seconds,
        str.cooldown_seconds
      FROM screen_tag_routes str
      INNER JOIN screens s ON s.id = str.screen_id
      WHERE
        str.tag_id = ?
        AND str.enabled = 1
        AND s.enabled = 1
      LIMIT 1
    `,
  )
    .bind(campaign.tag_id)
    .first<ScreenRouteRow>();

  if (!route) {
    return { notified: false, reason: "route-not-found" };
  }

  const cooldownUntil = new Date(Date.now() - Number(route.cooldown_seconds ?? 0) * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const recent = await env.DB.prepare(
    `
      SELECT id
      FROM screen_events
      WHERE
        screen_id = ?
        AND event_type = 'nfc_switch'
        AND occurred_at > ?
      ORDER BY occurred_at DESC
      LIMIT 1
    `,
  )
    .bind(route.screen_id, cooldownUntil)
    .first<{ id: string }>();

  if (recent) {
    return { notified: false, reason: "cooldown" };
  }

  const eventId = crypto.randomUUID();
  const displaySeconds = Number(route.display_seconds ?? 20);

  await env.DB.prepare(
    `
      INSERT INTO screen_events (
        id,
        screen_id,
        tag_id,
        campaign_id,
        user_id,
        display_seconds,
        event_type,
        occurred_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'nfc_switch', datetime('now'))
    `,
  )
    .bind(
      eventId,
      route.screen_id,
      campaign.tag_id,
      campaign.campaign_id,
      userId,
      displaySeconds,
    )
    .run();

  const payload = buildCampaignPayload(route.screen_id, {
    campaign_id: campaign.campaign_id,
    description: campaign.description,
    display_seconds: displaySeconds,
    id: eventId,
    media_path: campaign.media_path,
    media_type: campaign.media_type,
    occurred_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    shelf_name: campaign.shelf_name,
    store_name: campaign.store_name,
    tag_id: campaign.tag_id,
    tag_label: campaign.tag_label,
    title: campaign.title,
  });

  await broadcastToScreen(env, route.screen_id, payload);

  return { notified: true, screenId: route.screen_id };
}

async function getScreen(env: Env, screenId: string) {
  return env.DB.prepare(
    `
      SELECT
        id,
        name,
        store_name,
        shelf_name,
        idle_title,
        idle_message,
        idle_media_path,
        idle_media_type
      FROM screens
      WHERE id = ? AND enabled = 1
      LIMIT 1
    `,
  )
    .bind(screenId)
    .first<ScreenRow>();
}

function buildIdlePayload(screen: ScreenRow): ScreenPayload {
  return {
    campaignId: null,
    description: screen.idle_message,
    displaySeconds: 0,
    eventId: null,
    expiresAt: null,
    kind: "idle",
    mediaPath: screen.idle_media_path,
    mediaType: screen.idle_media_type,
    screenId: screen.id,
    shelfName: screen.shelf_name,
    storeName: screen.store_name,
    tagId: null,
    tagLabel: null,
    title: screen.idle_title,
    triggeredAt: null,
  };
}

function buildCampaignPayload(screenId: string, event: ScreenEventRow): ScreenPayload {
  const triggeredAt = `${event.occurred_at.replace(" ", "T")}Z`;
  const expiresAt = new Date(
    new Date(triggeredAt).getTime() + Number(event.display_seconds ?? 20) * 1000,
  ).toISOString();

  return {
    campaignId: event.campaign_id,
    description: event.description,
    displaySeconds: Number(event.display_seconds ?? 20),
    eventId: event.id,
    expiresAt,
    kind: "campaign",
    mediaPath: event.media_path,
    mediaType: event.media_type,
    screenId,
    shelfName: event.shelf_name,
    storeName: event.store_name,
    tagId: event.tag_id,
    tagLabel: event.tag_label,
    title: event.title,
    triggeredAt,
  };
}

function isEventActive(event: ScreenEventRow) {
  const triggeredAt = new Date(`${event.occurred_at.replace(" ", "T")}Z`).getTime();

  return triggeredAt + Number(event.display_seconds ?? 20) * 1000 > Date.now();
}

async function broadcastToScreen(env: Env, screenId: string, payload: ScreenPayload) {
  if (!env.SCREEN_HUB) {
    return;
  }

  const id = env.SCREEN_HUB.idFromName(screenId);
  const stub = env.SCREEN_HUB.get(id);

  // 棚前画面へだけ広告切り替えを送ります。スマホへ返す画面は既存のままです。
  await stub.fetch("https://screen-hub.internal/broadcast", {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}
