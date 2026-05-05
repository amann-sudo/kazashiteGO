import { json, type Env } from "../lib/shared";

export const onRequest: PagesFunction<Env> = async (context) => {
  const result = await context.env.DB.prepare("SELECT 1 AS ok").first<{
    ok: number;
  }>();

  return json({ ok: result?.ok === 1 });
};
