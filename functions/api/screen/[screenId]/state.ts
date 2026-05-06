import {
  json,
  methodNotAllowed,
  scalarParam,
  type Env,
} from "../../../lib/shared";
import { getScreenState } from "../../../lib/screens";

export const onRequest: PagesFunction<Env, "screenId"> = async (context) => {
  if (context.request.method !== "GET") {
    return methodNotAllowed();
  }

  const screenId = scalarParam(context.params.screenId);
  const state = await getScreenState(context.env, screenId);

  if (!state) {
    return json({ error: "棚前ディスプレイが見つかりません。" }, { status: 404 });
  }

  return json(state);
};
