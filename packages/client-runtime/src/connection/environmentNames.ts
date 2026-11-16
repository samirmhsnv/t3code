import type { EnvironmentId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type { ConnectionCatalogEntry } from "./catalog.ts";
import {
  BearerConnectionTarget,
  ConnectionBlockedError,
  PrimaryConnectionTarget,
  RelayConnectionTarget,
  SshConnectionTarget,
  type ConnectionAttemptError,
  type ConnectionTarget,
} from "./model.ts";

type EnvironmentNameMap = ReadonlyMap<EnvironmentId, string>;

/**
 * Names this device gives environments. They live beside the catalog, not in it, so a rename
 * survives re-pairing and platform reconciles and never restarts a connection.
 */
export class EnvironmentNames extends Context.Reference<{
  readonly changes: Stream.Stream<EnvironmentNameMap>;
  /** An empty or null name restores the environment's own name. */
  readonly set: (
    environmentId: EnvironmentId,
    name: string | null,
  ) => Effect.Effect<void, ConnectionAttemptError>;
}>("@t3tools/client-runtime/connection/EnvironmentNames", {
  defaultValue: () => ({
    changes: Stream.succeed(new Map()),
    set: () =>
      Effect.fail(
        new ConnectionBlockedError({
          reason: "unsupported",
          detail: "Renaming environments is unavailable on this client.",
        }),
      ),
  }),
}) {}

function withTargetLabel(target: ConnectionTarget, label: string): ConnectionTarget {
  switch (target._tag) {
    case "PrimaryConnectionTarget":
      return new PrimaryConnectionTarget({ ...target, label });
    case "BearerConnectionTarget":
      return new BearerConnectionTarget({ ...target, label });
    case "RelayConnectionTarget":
      return new RelayConnectionTarget({ ...target, label });
    case "SshConnectionTarget":
      return new SshConnectionTarget({ ...target, label });
  }
}

// Keeps a renamed entry's identity stable while its source entry and name are unchanged.
const namedEntries = new WeakMap<ConnectionCatalogEntry, ConnectionCatalogEntry>();

export function applyEnvironmentNames(
  entries: ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>,
  names: EnvironmentNameMap,
): ReadonlyMap<EnvironmentId, ConnectionCatalogEntry> {
  if (names.size === 0) return entries;
  let next: Map<EnvironmentId, ConnectionCatalogEntry> | null = null;
  for (const [environmentId, entry] of entries) {
    const name = names.get(environmentId)?.trim();
    if (!name || name === entry.target.label) continue;
    let named = namedEntries.get(entry);
    if (named?.target.label !== name) {
      named = { ...entry, target: withTargetLabel(entry.target, name) };
      namedEntries.set(entry, named);
    }
    next ??= new Map(entries);
    next.set(environmentId, named);
  }
  return next ?? entries;
}
