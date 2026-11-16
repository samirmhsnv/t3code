import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { MAX_RECENT_MODELS, pushRecentModel } from "./modelPickerRecents";

const claude = ProviderInstanceId.make("claude");
const codex = ProviderInstanceId.make("codex");

describe("pushRecentModel", () => {
  it("moves a repeated pick to the front without duplicating it", () => {
    const recents = [
      { instanceId: claude, model: "opus" },
      { instanceId: codex, model: "gpt" },
    ];
    expect(pushRecentModel(recents, { instanceId: codex, model: "gpt" })).toEqual([
      { instanceId: codex, model: "gpt" },
      { instanceId: claude, model: "opus" },
    ]);
  });

  it("keeps the same slug on another instance apart and caps the list", () => {
    let recents = pushRecentModel([], { instanceId: claude, model: "m" });
    recents = pushRecentModel(recents, { instanceId: codex, model: "m" });
    expect(recents).toHaveLength(2);
    for (let index = 0; index < 10; index++) {
      recents = pushRecentModel(recents, { instanceId: claude, model: `m${index}` });
    }
    expect(recents).toHaveLength(MAX_RECENT_MODELS);
    expect(recents[0]).toEqual({ instanceId: claude, model: "m9" });
  });
});
