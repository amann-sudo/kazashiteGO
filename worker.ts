import { onRequest as handleAdminSummary } from "./functions/api/admin/summary";
import { onRequest as handleAdminTag } from "./functions/api/admin/tags/[tagId]";
import { onRequest as handleUserMe } from "./functions/api/user/me";
import { onRequest as handleApp } from "./functions/app";
import {
  json,
  requireAdmin,
  type Env,
} from "./functions/lib/shared";
import { onRequest as handleNfc } from "./functions/n/[tagId]";

type WorkerEnv = Env & {
  ASSETS: Fetcher;
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
