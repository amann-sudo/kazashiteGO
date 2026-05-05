export type Env = {
  DB: D1Database;
};

export type CampaignForTag = {
  tag_id: string;
  tag_label: string;
  store_name: string;
  shelf_name: string;
  point_value: number;
  campaign_id: string;
  title: string;
  description: string;
  media_path: string;
  media_type: string;
  cta_label: string | null;
  cta_url: string | null;
};

const visitorCookieName = "kg_visitor";

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function methodNotAllowed() {
  return json({ error: "許可されていないHTTPメソッドです。" }, { status: 405 });
}

export function scalarParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function getJapanDay(date = new Date()) {
  // 日本は夏時間がないため、UTCから9時間足して日付だけを取り出します。
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function getCampaignForTag(env: Env, tagId: string) {
  return env.DB.prepare(
    `
      SELECT
        t.id AS tag_id,
        t.label AS tag_label,
        t.store_name,
        t.shelf_name,
        t.point_value,
        c.id AS campaign_id,
        c.title,
        c.description,
        c.media_path,
        c.media_type,
        c.cta_label,
        c.cta_url
      FROM tags t
      INNER JOIN campaigns c ON c.id = t.active_campaign_id
      WHERE
        t.id = ?
        AND t.enabled = 1
        AND c.enabled = 1
        AND (c.starts_at IS NULL OR c.starts_at <= datetime('now'))
        AND (c.ends_at IS NULL OR c.ends_at >= datetime('now'))
      LIMIT 1
    `,
  )
    .bind(tagId)
    .first<CampaignForTag>();
}

export async function getVisitorIdentity(request: Request) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const visitorId = readCookie(cookieHeader, visitorCookieName) ?? crypto.randomUUID();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(visitorId),
  );

  return {
    visitorHash: toHex(digest),
    setCookie: cookieHeader.includes(`${visitorCookieName}=`) ? "" : buildCookie(request, visitorId),
  };
}

function readCookie(cookieHeader: string, name: string) {
  const target = `${name}=`;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(target));

  return cookie ? decodeURIComponent(cookie.slice(target.length)) : null;
}

function buildCookie(request: Request, value: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `${visitorCookieName}=${encodeURIComponent(
    value,
  )}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
