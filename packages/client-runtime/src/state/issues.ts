import { type EnvironmentId, type IssueReference, WS_METHODS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { Atom, type AtomRegistry } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

export function createIssueEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  // Bumped by every write so each listed scope reads again; trackers push nothing to us.
  const listVersion = Atom.family((_environmentId: EnvironmentId) =>
    Atom.make(0).pipe(Atom.keepAlive),
  );
  // A minute keeps tab switches and remounts from calling Linear and Deckbell again.
  const list = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:list",
    tag: WS_METHODS.issuesList,
    staleTimeMs: 60_000,
    refreshTrigger: ({ environmentId }) => listVersion(environmentId),
  });
  const detail = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:detail",
    tag: WS_METHODS.issuesGet,
    staleTimeMs: 30_000,
  });
  // Statuses, members and labels change rarely; pickers reuse them across issues.
  const options = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:options",
    tag: WS_METHODS.issuesOptions,
    staleTimeMs: 5 * 60_000,
  });

  const changed = (
    registry: AtomRegistry.AtomRegistry,
    environmentId: EnvironmentId,
    issue: IssueReference | null,
  ) =>
    Effect.sync(() => {
      registry.update(listVersion(environmentId), (version) => version + 1);
      if (issue !== null)
        registry.refresh(detail({ environmentId, input: { source: issue.source, id: issue.id } }));
    });

  const scheduler = createAtomCommandScheduler();
  const serialPerIssue = {
    mode: "serial",
    key: ({
      environmentId,
      input,
    }: {
      readonly environmentId: string;
      readonly input: { readonly source: string; readonly id?: string };
    }) => JSON.stringify([environmentId, input.source, input.id ?? null]),
  } as const;

  return {
    list,
    detail,
    options,
    update: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:update",
      tag: WS_METHODS.issuesUpdate,
      scheduler,
      concurrency: serialPerIssue,
      onSuccess: ({ environmentId, input }, registry) => changed(registry, environmentId, input),
    }),
    addComment: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:add-comment",
      tag: WS_METHODS.issuesAddComment,
      scheduler,
      concurrency: serialPerIssue,
      onSuccess: ({ environmentId, input }, registry) => changed(registry, environmentId, input),
    }),
    create: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:create",
      tag: WS_METHODS.issuesCreate,
      scheduler,
      concurrency: serialPerIssue,
      onSuccess: ({ environmentId }, registry) => changed(registry, environmentId, null),
    }),
  };
}
