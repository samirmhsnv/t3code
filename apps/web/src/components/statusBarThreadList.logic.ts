import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";

import type { SidebarThreadSummary } from "../types";

export type StatusBarThreadBucket = "needs-you" | "working" | "unread";

export const STATUS_BAR_THREAD_LIST_LIMIT = 15;

export function threadNeedsYou(
  thread: Pick<
    SidebarThreadSummary,
    | "hasPendingApprovals"
    | "hasPendingUserInput"
    | "pendingSubagentRequest"
    | "pendingGuestMessageCount"
  >,
): boolean {
  return (
    thread.hasPendingApprovals ||
    thread.hasPendingUserInput ||
    thread.pendingSubagentRequest != null ||
    (thread.pendingGuestMessageCount ?? 0) > 0
  );
}

export interface StatusBarThreadListRow {
  readonly thread: SidebarThreadSummary;
  /** When it started waiting, started working, or finished. */
  readonly at: string | null;
}

function waitingSince(thread: SidebarThreadSummary): string | null {
  return (
    thread.pendingUserInputAt ??
    thread.latestRun?.completedAt ??
    thread.latestRun?.startedAt ??
    thread.updatedAt
  );
}

function workingSince(thread: SidebarThreadSummary): string | null {
  return thread.runtime?.activityStartedAt ?? thread.latestRun?.startedAt ?? null;
}

const ascending = (left: StatusBarThreadListRow, right: StatusBarThreadListRow) =>
  (left.at ?? "").localeCompare(right.at ?? "");

/**
 * The threads behind one status bar count. Needs-you puts the longest wait first and working
 * the earliest start first; unread keeps the newest-first order it is given.
 */
export function statusBarThreadList(
  bucket: StatusBarThreadBucket,
  shells: ReadonlyArray<SidebarThreadSummary>,
  unreadKeys: ReadonlyArray<string>,
  keyOf: (thread: SidebarThreadSummary) => string,
): ReadonlyArray<StatusBarThreadListRow> {
  switch (bucket) {
    case "needs-you":
      return shells
        .filter(threadNeedsYou)
        .map((thread) => ({ thread, at: waitingSince(thread) }))
        .toSorted(ascending);
    case "working":
      return shells
        .filter((thread) => !threadNeedsYou(thread) && isThreadWorking(thread))
        .map((thread) => ({ thread, at: workingSince(thread) }))
        .toSorted(ascending);
    case "unread": {
      const byKey = new Map(shells.map((thread) => [keyOf(thread), thread] as const));
      return unreadKeys.flatMap((key) => {
        const thread = byKey.get(key);
        return thread === undefined ? [] : [{ thread, at: thread.latestRun?.completedAt ?? null }];
      });
    }
  }
}
