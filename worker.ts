import { DurableObject } from "cloudflare:workers";
import { onRequest as handleAdminSummary } from "./functions/api/admin/summary";
import { onRequest as handleAdminTag } from "./functions/api/admin/tags/[tagId]";
import { onRequest as handleScreenState } from "./functions/api/screen/[screenId]/state";
import { onRequest as handleUserMe } from "./functions/api/user/me";
import { onRequest as handleApp } from "./functions/app";
import {
  json,
  requireAdmin,
  type Env,
} from "./functions/lib/shared";
import { onRequest as handleNfc } from "./functions/n/[tagId]";
import { onRequest as handleScreen } from "./functions/screen/[screenId]";

type WorkerEnv = Env & {
  ASSETS: Fetcher;
  SCREEN_HUB: DurableObjectNamespace;
};

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

type PageHandler = (context: {
  data: Record<string, unknown>;
  env: WorkerEnv;
  functionPath: string;
  next: () => Promise<Response>;
  params: Record<string, string>;
  passThroughOnException: () => void;
  request: Request;
  waitUntil: (promise: Promise<unknown>) => void;
}) => Response | Promise<Response>;

const worker: ExportedHandler<WorkerEnv> = {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContextLike) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === "/api/health") {
      const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

      return json({ ok: result?.ok === 1 });
    }

    if (pathname === "/api/user/me") {
      return runPageHandler(handleUserMe, request, env, ctx);
    }

    const screenStateMatch = pathname.match(/^\/api\/screen\/([^/]+)\/state$/);

    if (screenStateMatch) {
      return runPageHandler(handleScreenState, request, env, ctx, {
        screenId: decodeURIComponent(screenStateMatch[1]),
      });
    }

    const screenSocketMatch = pathname.match(/^\/api\/screen\/([^/]+)\/socket$/);

    if (screenSocketMatch) {
      const screenId = decodeURIComponent(screenSocketMatch[1]);
      const objectId = env.SCREEN_HUB.idFromName(screenId);

      return env.SCREEN_HUB.get(objectId).fetch(request);
    }

    if (pathname === "/api/admin/summary") {
      return runPageHandler(handleAdminSummary, request, env, ctx);
    }

    const adminTagMatch = pathname.match(/^\/api\/admin\/tags\/([^/]+)$/);

    if (adminTagMatch) {
      return runPageHandler(handleAdminTag, request, env, ctx, {
        tagId: decodeURIComponent(adminTagMatch[1]),
      });
    }

    if (pathname === "/app") {
      return runPageHandler(handleApp, request, env, ctx);
    }

    const screenMatch = pathname.match(/^\/screen\/([^/]+)$/);

    if (screenMatch) {
      return runPageHandler(handleScreen, request, env, ctx, {
        screenId: decodeURIComponent(screenMatch[1]),
      });
    }

    if (pathname === "/n/onion-shelf") {
      const redirectUrl = new URL("/t/kg-0001", request.url);

      return Response.redirect(redirectUrl, 302);
    }

    const tagMatch = pathname.match(/^\/(?:t|n)\/([^/]+)$/);

    if (tagMatch) {
      return runPageHandler(handleNfc, request, env, ctx, {
        tagId: decodeURIComponent(tagMatch[1]),
      });
    }

    // 管理画面HTMLだけは静的アセット配信の前にBasic認証を通します。
    if (pathname === "/" || pathname === "/admin" || pathname === "/admin/") {
      const denied = await requireAdmin(request, env);

      if (denied) {
        return denied;
      }
    }

    return env.ASSETS.fetch(rewriteStaticHtmlRequest(request));
  },
};

export default worker;

export class ScreenHub extends DurableObject<WorkerEnv> {
  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    // 画面側の疎通確認は自動応答にして、接続維持だけでWorkerを起こし続けないようにします。
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request) {
    if (request.headers.get("Upgrade") === "websocket") {
      if (request.method !== "GET") {
        return new Response("WebSocket requires GET", { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ connectedAt: new Date().toISOString() });

      const latest = await this.ctx.storage.get("latest");

      if (latest) {
        server.send(JSON.stringify({ payload: latest, type: "screen:state" }));
      }

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    if (request.method === "POST") {
      const payload = await request.json();
      await this.ctx.storage.put("latest", payload);

      const message = JSON.stringify({ payload, type: "screen:switch" });

      for (const socket of this.ctx.getWebSockets()) {
        socket.send(message);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }

  webSocketError(ws: WebSocket) {
    ws.close(1011, "screen socket error");
  }
}

function runPageHandler(
  handler: unknown,
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContextLike,
  params: Record<string, string> = {},
) {
  const pageHandler = handler as PageHandler;

  return pageHandler({
    data: {},
    env,
    functionPath: new URL(request.url).pathname,
    next: () => env.ASSETS.fetch(request),
    params,
    passThroughOnException: () => undefined,
    request,
    waitUntil: (promise) => ctx.waitUntil(promise),
  });
}

function rewriteStaticHtmlRequest(request: Request) {
  const url = new URL(request.url);

  if (url.pathname === "/") {
    url.pathname = "/index.html";
  }

  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    url.pathname = "/admin.html";
  }

  return new Request(url, request);
}
