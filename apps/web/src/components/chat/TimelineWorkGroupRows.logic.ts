import { toServerClock } from "@t3tools/client-runtime/clock";
import { toolGroupAction } from "@t3tools/client-runtime/work-log/presentation";
import type { EnvironmentId } from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import type { WorkLogEntry } from "../../session-logic";

export function formatWorkingTimerNow(startIso: string, environmentId: EnvironmentId): string {
  const startedAtMs = Date.parse(startIso);
  if (!Number.isFinite(startedAtMs)) {
    return "0s";
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((toServerClock(environmentId, Date.now()) - startedAtMs) / 1000),
  );
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  return formatDuration(elapsedSeconds * 1_000);
}

export interface WorkSummary {
  readonly steps: number;
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
  readonly reads: number;
}

/** Counts for a folded turn's header: tool steps, files it edited, and reads. */
export function summarizeWork(entries: Iterable<WorkLogEntry>): WorkSummary {
  let steps = 0;
  let additions = 0;
  let deletions = 0;
  let reads = 0;
  const files = new Set<string>();
  for (const entry of entries) {
    if (
      entry.tone !== "tool" ||
      entry.itemType === "approval_request" ||
      entry.itemType === "user_input_request"
    ) {
      continue;
    }
    steps += 1;
    const item = entry.structuredPayload;
    if (item?.type === "file_change") {
      files.add(item.fileName);
      additions += item.additions ?? 0;
      deletions += item.deletions ?? 0;
    }
    for (const path of entry.changedFiles ?? []) files.add(path);
    if (toolGroupAction(entry) === "read") reads += 1;
  }
  return { steps, files: files.size, additions, deletions, reads };
}

export function sameWorkSummary(left: WorkSummary, right: WorkSummary): boolean {
  return (
    left.steps === right.steps &&
    left.files === right.files &&
    left.additions === right.additions &&
    left.deletions === right.deletions &&
    left.reads === right.reads
  );
}
