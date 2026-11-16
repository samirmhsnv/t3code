import { describe, expect, it } from "vite-plus/test";

import type { SidebarThreadSummary } from "../types";
import { statusBarThreadList } from "./statusBarThreadList.logic";

function shell(id: string, fields: Partial<SidebarThreadSummary>): SidebarThreadSummary {
  return {
    id,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    latestRun: null,
    runtime: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  } as unknown as SidebarThreadSummary;
}

const keyOf = (thread: SidebarThreadSummary) => thread.id;

describe("statusBarThreadList", () => {
  it("lists threads that need you, longest wait first", () => {
    const shells = [
      shell("late", { hasPendingApprovals: true, updatedAt: "2026-01-01T00:05:00.000Z" }),
      shell("idle", {}),
      shell("early", { hasPendingUserInput: true, pendingUserInputAt: "2026-01-01T00:01:00.000Z" }),
    ];
    expect(
      statusBarThreadList("needs-you", shells, [], keyOf).map((row) => [row.thread.id, row.at]),
    ).toEqual([
      ["early", "2026-01-01T00:01:00.000Z"],
      ["late", "2026-01-01T00:05:00.000Z"],
    ]);
  });

  it("keeps the given unread order and drops threads no longer present", () => {
    const shells = [shell("a", {}), shell("b", {})];
    expect(
      statusBarThreadList("unread", shells, ["b", "gone", "a"], keyOf).map((row) => row.thread.id),
    ).toEqual(["b", "a"]);
  });
});
