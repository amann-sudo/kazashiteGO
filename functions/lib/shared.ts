export type Env = {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
  SCREEN_HUB?: DurableObjectNamespace;
};

export type VisitorIdentity = {
  visitorHash: string;
  setCookie: string;
};

export type AppUser = {
  id: string;
  anonymous_id_hash: string;
  display_name: string | null;
  linked_at: string | null;
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

export async function requireAdmin(request: Request, env: Env) {
  const password = env.ADMIN_PASSWORD;

  if (!password) {
    return json(
      { error: "ADMIN_PASSWORDが未設定のため管理画面を利用できません。" },
      { status: 503 },
    );
  }

  const credentials = parseBasicAuth(request.headers.get("Authorization"));

  if (
    credentials?.username === "admin" &&
    (await timingSafeEqual(credentials.password, password))
  ) {
    return null;
  }

  const headers = new Headers({
    "WWW-Authenticate": 'Basic realm="kazashiteGO Admin", charset="UTF-8"',
  });

  return json(
    { error: "管理画面の認証が必要です。" },
    { status: 401, headers },
  );
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

export function getNextJapanDayStartUtc(day: string) {
  // 日本時間の翌日0時は、UTCでは同じ日付の15時になります。
  return `${day} 15:00:00`;
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

export async function getVisitorIdentity(request: Request): Promise<VisitorIdentity> {
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

export function getAnonymousUserId(visitorHash: string) {
  return `anon_${visitorHash.slice(0, 24)}`;
}

export async function getOrCreateUser(env: Env, request: Request) {
  const visitor = await getVisitorIdentity(request);
  const userId = getAnonymousUserId(visitor.visitorHash);

  // ログインなしでもポイントを保存できるよう、端末Cookie由来の匿名ユーザーをD1に作ります。
  await env.DB.prepare(
    `
      INSERT INTO users (
        id,
        anonymous_id_hash,
        created_at,
        last_seen_at
      )
      VALUES (?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(anonymous_id_hash)
      DO UPDATE SET last_seen_at = datetime('now')
    `,
  )
    .bind(userId, visitor.visitorHash)
    .run();

  await env.DB.prepare(
    `
      INSERT INTO user_point_balances (
        user_id,
        balance,
        lifetime_points,
        updated_at
      )
      VALUES (?, 0, 0, datetime('now'))
      ON CONFLICT(user_id)
      DO NOTHING
    `,
  )
    .bind(userId)
    .run();

  const user = await env.DB.prepare(
    `
      SELECT id, anonymous_id_hash, display_name, linked_at
      FROM users
      WHERE anonymous_id_hash = ?
      LIMIT 1
    `,
  )
    .bind(visitor.visitorHash)
    .first<AppUser>();

  if (!user) {
    throw new Error("匿名ユーザーの作成に失敗しました。");
  }

  return { user, visitor };
}

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

async function timingSafeEqual(actual: string, expected: string) {
  // パスワードの比較時間から値を推測されにくくするため、ハッシュ化してから固定長で比較します。
  const [actualDigest, expectedDigest] = await Promise.all([
    sha256(actual),
    sha256(expected),
  ]);

  let diff = 0;
  const actualBytes = new Uint8Array(actualDigest);
  const expectedBytes = new Uint8Array(expectedDigest);

  for (let index = 0; index < expectedBytes.length; index += 1) {
    diff |= actualBytes[index] ^ expectedBytes[index];
  }

  return diff === 0;
}

function sha256(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
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
