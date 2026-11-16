import { useAtomValue } from "@effect/atom-react";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import { Atom } from "effect/reactivity";

import type { SidebarThreadSummary } from "../../types";
import { environmentThreadShells } from "../../state/threads";
import { PipelineSegments } from "../pullRequest/PipelineSegments";
import { pipelineStage } from "../pullRequest/pipelineStage.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  launchingThreadKeys,
  threadRole,
  THREAD_ROLE_DESCRIPTIONS,
  THREAD_ROLE_LABELS,
  type ThreadRoleInput,
} from "./threadRole.logic";

function roleInput(thread: SidebarThreadSummary): ThreadRoleInput {
  return {
    environmentId: thread.environmentId,
    id: thread.id,
    title: thread.title,
    lineage: thread.lineage,
    delegatedFrom: thread.delegatedFrom,
    creationSource: thread.source.creationSource,
  };
}

// Rows re-render only when the set of coordinating threads changes, not on every shell update.
const launchingKeysAtom = Atom.make((get) =>
  launchingThreadKeys(get(environmentThreadShells.quietThreadShellsAtom).map(roleInput)),
).pipe(
  Atom.withEquality(
    (previous: ReadonlySet<string>, next: ReadonlySet<string>) =>
      previous.size === next.size && [...next].every((key) => previous.has(key)),
  ),
);

export function SidebarThreadRoleTag({ thread }: { thread: SidebarThreadSummary }) {
  const launchingKeys = useAtomValue(launchingKeysAtom);
  const role = threadRole(roleInput(thread), launchingKeys);
  if (role === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex h-4 shrink-0 items-center rounded-sm border border-border px-1 font-mono text-3xs font-semibold tracking-wide text-muted-foreground" />
        }
      >
        {THREAD_ROLE_LABELS[role]}
      </TooltipTrigger>
      <TooltipPopup side="top">{THREAD_ROLE_DESCRIPTIONS[role]}</TooltipPopup>
    </Tooltip>
  );
}

/** Pipeline bars for the thread's open pull request, from the snapshot its link carries. */
export function SidebarThreadPipeline({ thread }: { thread: SidebarThreadSummary }) {
  const snapshot = resolveThreadCurrentPullRequestLink(thread.pullRequests)?.snapshot ?? null;
  if (snapshot === null || snapshot.state !== "open") return null;
  return <PipelineSegments pipeline={pipelineStage(snapshot)} size="compact" />;
}
