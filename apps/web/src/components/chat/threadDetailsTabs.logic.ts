import type { OrchestrationV2PlanArtifact } from "@t3tools/contracts";
import type { TurnDiffSummary as ThreadCheckpointSummary } from "../../types";

export interface ThreadNowNext {
  readonly now: string | null;
  readonly next: string | null;
  /** The agent waits on the user rather than working. */
  readonly waitingOnYou: boolean;
}

/**
 * What the agent is doing and will do next: a pending request outranks the plan,
 * then the newest checklist's running step (or its first pending one) and the step after it.
 */
export function threadNowNext(input: {
  readonly plans: ReadonlyArray<OrchestrationV2PlanArtifact>;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly working: boolean;
}): ThreadNowNext {
  const checklist = input.plans.findLast(
    (plan) => plan.kind === "todo_list" && plan.status !== "superseded",
  );
  const steps = checklist?.kind === "todo_list" ? checklist.steps : [];
  const runningIndex = steps.findIndex((step) => step.status === "running");
  const currentIndex =
    runningIndex !== -1 ? runningIndex : steps.findIndex((step) => step.status === "pending");
  const current = currentIndex === -1 ? null : steps[currentIndex]!;
  const next =
    currentIndex === -1
      ? null
      : (steps.slice(currentIndex + 1).find((step) => step.status === "pending")?.text ?? null);
  if (input.hasPendingApprovals || input.hasPendingUserInput) {
    return {
      now: input.hasPendingApprovals ? "Waiting for your approval" : "Waiting for your answer",
      next: current?.text ?? next,
      waitingOnYou: true,
    };
  }
  if (current === null) {
    return { now: input.working ? "Working" : null, next: null, waitingOnYou: false };
  }
  return {
    now: input.working || current.status === "running" ? current.text : null,
    next: input.working || current.status === "running" ? next : current.text,
    waitingOnYou: false,
  };
}

export interface ThreadChangedFile {
  readonly path: string;
  readonly kind: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface ThreadChangedDirectory {
  readonly directory: string;
  readonly files: ReadonlyArray<ThreadChangedFile & { readonly name: string }>;
}

export interface ThreadTurnChange {
  readonly turn: number;
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
}

export interface ThreadChanges {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
  readonly directories: ReadonlyArray<ThreadChangedDirectory>;
  /** Newest turn first. */
  readonly turns: ReadonlyArray<ThreadTurnChange>;
  /** Some checkpoints listed only a prefix of their files. */
  readonly partial: boolean;
}

function splitPath(path: string): { directory: string; name: string } {
  const slash = path.lastIndexOf("/");
  return slash === -1
    ? { directory: "", name: path }
    : { directory: path.slice(0, slash + 1), name: path.slice(slash + 1) };
}

/** Every file the thread's turns changed, summed per path across turns, grouped by folder. */
export function summarizeThreadChanges(
  checkpoints: ReadonlyArray<ThreadCheckpointSummary>,
): ThreadChanges {
  const byPath = new Map<string, ThreadChangedFile>();
  const turns: ThreadTurnChange[] = [];
  let partial = false;
  for (const checkpoint of checkpoints) {
    if (checkpoint.status !== "ready") continue;
    let additions = 0;
    let deletions = 0;
    for (const file of checkpoint.files) {
      additions += file.additions;
      deletions += file.deletions;
      const previous = byPath.get(file.path);
      byPath.set(file.path, {
        path: file.path,
        // The newest turn's kind describes the file now.
        kind: file.kind,
        additions: (previous?.additions ?? 0) + file.additions,
        deletions: (previous?.deletions ?? 0) + file.deletions,
      });
    }
    const totals = checkpoint.filesTotal;
    if (totals !== undefined) partial = true;
    if ((totals?.count ?? checkpoint.files.length) === 0) continue;
    turns.push({
      turn: checkpoint.checkpointTurnCount,
      files: totals?.count ?? checkpoint.files.length,
      additions: totals?.additions ?? additions,
      deletions: totals?.deletions ?? deletions,
    });
  }
  const directories = new Map<string, Array<ThreadChangedFile & { name: string }>>();
  let additions = 0;
  let deletions = 0;
  for (const file of [...byPath.values()].toSorted((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    additions += file.additions;
    deletions += file.deletions;
    const { directory, name } = splitPath(file.path);
    const list = directories.get(directory) ?? [];
    list.push({ ...file, name });
    directories.set(directory, list);
  }
  return {
    files: byPath.size,
    additions,
    deletions,
    directories: [...directories].map(([directory, files]) => ({ directory, files })),
    turns: turns.toReversed(),
    partial,
  };
}

/** A file's share of the largest change, in quarters, so tiny edits still show a sliver. */
export function changeBarQuarters(lines: number, largest: number): number {
  if (lines <= 0 || largest <= 0) return 0;
  return Math.max(1, Math.round((lines / largest) * 4));
}
