import type { OrchestrationV2PlanArtifact } from "@t3tools/contracts";

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

export interface UncommittedFile {
  readonly path: string;
  readonly name: string;
  readonly additions: number;
  readonly deletions: number;
}

function splitPath(path: string): { directory: string; name: string } {
  const slash = path.lastIndexOf("/");
  return slash === -1
    ? { directory: "", name: path }
    : { directory: path.slice(0, slash + 1), name: path.slice(slash + 1) };
}

/** The working tree's uncommitted files, grouped by folder in path order. */
export function groupUncommittedFiles(
  files: ReadonlyArray<{
    readonly path: string;
    readonly insertions: number;
    readonly deletions: number;
  }>,
) {
  const directories = new Map<string, UncommittedFile[]>();
  for (const file of files.toSorted((left, right) => left.path.localeCompare(right.path))) {
    const { directory, name } = splitPath(file.path);
    const list = directories.get(directory) ?? [];
    list.push({ path: file.path, name, additions: file.insertions, deletions: file.deletions });
    directories.set(directory, list);
  }
  return [...directories].map(([directory, list]) => ({ directory, files: list }));
}
