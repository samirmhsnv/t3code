import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import type { ConnectionCatalogEntry } from "./catalog.ts";
import { applyEnvironmentNames } from "./environmentNames.ts";
import { RelayConnectionTarget } from "./model.ts";

const DEVBOX = EnvironmentId.make("devbox");
const OTHER = EnvironmentId.make("other");

function entry(environmentId: EnvironmentId, label: string): ConnectionCatalogEntry {
  return {
    target: new RelayConnectionTarget({ environmentId, label }),
    profile: Option.none(),
    enabled: true,
  };
}

describe("applyEnvironmentNames", () => {
  it("shows this device's names without touching the saved entries", () => {
    const devbox = entry(DEVBOX, "devbox-samirmhsnv");
    const other = entry(OTHER, "Other");
    const entries = new Map([
      [DEVBOX, devbox],
      [OTHER, other],
    ]);

    expect(applyEnvironmentNames(entries, new Map())).toBe(entries);
    expect(applyEnvironmentNames(entries, new Map([[DEVBOX, "  "]]))).toBe(entries);

    const names = new Map([[DEVBOX, " devbox "]]);
    const named = applyEnvironmentNames(entries, names);
    const renamed = named.get(DEVBOX)!;
    expect(renamed.target.label).toBe("devbox");
    expect(renamed.target).toBeInstanceOf(RelayConnectionTarget);
    expect(renamed.enabled).toBe(true);
    expect(named.get(OTHER)).toBe(other);
    expect(devbox.target.label).toBe("devbox-samirmhsnv");
    // Unchanged inputs keep the renamed entry's identity, so presentations do not recompute.
    expect(applyEnvironmentNames(new Map(entries), names).get(DEVBOX)).toBe(renamed);
    expect(
      applyEnvironmentNames(entries, new Map([[DEVBOX, "box"]])).get(DEVBOX)?.target.label,
    ).toBe("box");
  });
});
