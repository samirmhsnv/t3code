import { type EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

const RecentModel = Schema.Struct({ instanceId: ProviderInstanceId, model: Schema.String });
type RecentModel = typeof RecentModel.Type;
const RecentModels = Schema.Array(RecentModel);

export const MAX_RECENT_MODELS = 5;
const EMPTY: ReadonlyArray<RecentModel> = [];

/** Puts a pick first, drops its older copy and keeps the newest few. */
export function pushRecentModel(
  recents: ReadonlyArray<RecentModel>,
  pick: RecentModel,
): ReadonlyArray<RecentModel> {
  return [
    pick,
    ...recents.filter(
      (recent) => recent.instanceId !== pick.instanceId || recent.model !== pick.model,
    ),
  ].slice(0, MAX_RECENT_MODELS);
}

/** This browser's recent model picks for one environment. */
export function useRecentModels(environmentId: EnvironmentId | null) {
  const [recents, setRecents] = useLocalStorage(
    `t3code:model-picker-recents:${environmentId ?? "none"}`,
    EMPTY,
    RecentModels,
  );
  const recordRecentModel = (pick: RecentModel) => {
    setRecents((current) => pushRecentModel(current, pick));
  };
  return { recents, recordRecentModel };
}
