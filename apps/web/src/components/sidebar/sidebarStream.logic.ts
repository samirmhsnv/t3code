import type { SidebarThreadStatus } from "../Sidebar.logic";

/** Where an in-play thread sits in the one-stream sidebar. */
export type SidebarStreamLane = "needs-you" | "working" | "unread";

export const SIDEBAR_RECENT_COUNT = 5;
const SIDEBAR_RECENT_EXPANDED_COUNT = 25;
const SIDEBAR_ACTIVITY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

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
        : "unread";
  }
}

/**
 * Splits threads into the stream's sections. In-play threads become Needs you,
 * Working, or the unread head of Recent; the rest fill Recent by latest activity.
 */
export function buildSidebarStream<T>(input: {
  readonly inPlay: readonly T[];
  readonly rest: readonly T[];
  readonly laneOf: (thread: T) => SidebarStreamLane;
  readonly activityMsOf: (thread: T) => number;
  readonly recentExpanded: boolean;
}) {
  const needsYou: T[] = [];
  const working: T[] = [];
  const unread: T[] = [];
  for (const thread of input.inPlay) {
    const lane = input.laneOf(thread);
    (lane === "needs-you" ? needsYou : lane === "working" ? working : unread).push(thread);
  }
  const byActivity = (left: T, right: T) => input.activityMsOf(right) - input.activityMsOf(left);
  const older = input.rest.toSorted(byActivity);
  const limit = input.recentExpanded ? SIDEBAR_RECENT_EXPANDED_COUNT : SIDEBAR_RECENT_COUNT;
  return {
    needsYou,
    working,
    recent: [...unread.toSorted(byActivity), ...older.slice(0, limit)],
    hasOlderRecent: older.length > SIDEBAR_RECENT_COUNT,
  };
}

/** Orders folders by their latest thread activity; pinned folders lead and archived ones trail. */
export function orderSidebarProjectFolders<F>(
  folders: readonly F[],
  input: {
    readonly lastActivityMsOf: (folder: F) => number;
    readonly isPinned: (folder: F) => boolean;
    readonly isArchived: (folder: F) => boolean;
  },
): F[] {
  const rank = (folder: F) => (input.isPinned(folder) ? 0 : input.isArchived(folder) ? 2 : 1);
  return folders.toSorted(
    (left, right) =>
      rank(left) - rank(right) || input.lastActivityMsOf(right) - input.lastActivityMsOf(left),
  );
}

/**
 * Counts activity per rolling 24-hour window, oldest first, ending at `nowMs`.
 * Returns null when nothing landed in the range, so callers can skip the strip.
 */
export function sidebarActivityDayBuckets(
  timestampsMs: Iterable<number>,
  nowMs: number,
  days = SIDEBAR_ACTIVITY_DAYS,
): number[] | null {
  const buckets = Array.from({ length: days }, () => 0);
  let any = false;
  for (const timestamp of timestampsMs) {
    const age = nowMs - timestamp;
    if (!Number.isFinite(age) || age < 0 || age >= days * DAY_MS) continue;
    buckets[days - 1 - Math.floor(age / DAY_MS)]! += 1;
    any = true;
  }
  return any ? buckets : null;
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
