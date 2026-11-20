import type { SidebarThreadStatus } from "../Sidebar.logic";

/** Where a thread sits in the stream above the project folders. */
export type SidebarStreamLane = "needs-you" | "working" | "done";

interface StreamLaneInput {
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly pendingSubagentRequest?: unknown;
}

export function sidebarStreamLane(
  thread: StreamLaneInput,
  status: SidebarThreadStatus,
): SidebarStreamLane {
  switch (status) {
    case "approval":
    case "input":
    case "request":
    case "limited":
    case "failed":
      return "needs-you";
    case "preparing":
    case "working":
    case "waiting":
      return "working";
    case "ready":
      return thread.hasPendingApprovals ||
        thread.hasPendingUserInput ||
        thread.pendingSubagentRequest != null
        ? "needs-you"
        : "done";
  }
}

/** Splits threads into the Needs you, Working and Done sections; Done is newest first. */
export function buildSidebarStream<T>(input: {
  readonly threads: readonly T[];
  readonly laneOf: (thread: T) => SidebarStreamLane | null;
  readonly activityMsOf: (thread: T) => number;
}) {
  const needsYou: T[] = [];
  const working: T[] = [];
  const done: T[] = [];
  for (const thread of input.threads) {
    const lane = input.laneOf(thread);
    if (lane === "needs-you") needsYou.push(thread);
    else if (lane === "working") working.push(thread);
    else if (lane === "done") done.push(thread);
  }
  return {
    needsYou,
    working,
    done: done.toSorted((left, right) => input.activityMsOf(right) - input.activityMsOf(left)),
  };
}

interface StreamActivityInput extends StreamLaneInput {
  readonly pendingSubagentRequest?: "approval" | "user_input" | null;
  readonly pendingGuestMessageCount?: number;
  readonly blockedOnThreadWait?: boolean;
  readonly pendingBackgroundTasks: readonly unknown[];
  readonly goal: { readonly status: string } | null;
  readonly runtime: { readonly lastError: string | null } | null;
}

/** The card's second line: what the agent is doing or what it needs, from shell data. */
export function sidebarStreamActivity(
  thread: StreamActivityInput,
  status: SidebarThreadStatus,
): string {
  const backgroundCount = thread.pendingBackgroundTasks.length;
  switch (status) {
    case "approval":
      return thread.pendingSubagentRequest === "approval"
        ? "Subagent needs approval"
        : "Approval needed";
    case "input":
      return thread.pendingSubagentRequest === "user_input"
        ? "Subagent has a question"
        : "Waiting for your answer";
    case "request": {
      const count = thread.pendingGuestMessageCount ?? 0;
      return count === 1 ? "1 guest message" : `${count} guest messages`;
    }
    case "limited":
      return "Usage limit reached";
    case "failed":
      return thread.runtime?.lastError?.split("\n", 1)[0]?.trim() || "Run failed";
    case "preparing":
      return "Setting up";
    case "waiting":
      return backgroundCount > 0 ? backgroundTaskLabel(backgroundCount) : "Waiting";
    case "working":
      if (thread.blockedOnThreadWait) return "Waiting on another thread";
      if (thread.goal?.status === "active") return "Working on goal";
      return backgroundCount > 0 ? `Working · ${backgroundTaskLabel(backgroundCount)}` : "Working";
    case "ready":
      return sidebarStreamLane(thread, status) === "needs-you" ? "Needs you" : "Done";
  }
}

function backgroundTaskLabel(count: number): string {
  return count === 1 ? "1 background task" : `${count} background tasks`;
}
