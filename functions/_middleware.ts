import { requireAdmin, type Env } from "./lib/shared";

export const onRequest: PagesFunction<Env> = async (context) => {
  const pathname = new URL(context.request.url).pathname;

  // 管理画面と管理APIは、静的HTMLより前段のミドルウェアで必ず認証します。
  if (isAdminPath(pathname)) {
    const denied = await requireAdmin(context.request, context.env);

    if (denied) {
      return denied;
    }
  }

  return context.next();
};

function isAdminPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin/")
  );
}
