import { describe, expect, it } from "vite-plus/test";

import {
  buildSidebarStream,
  orderSidebarProjectFolders,
  sidebarActivityDayBuckets,
  sidebarStreamActivity,
  sidebarStreamLane,
} from "./sidebarStream.logic";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-17T12:00:00.000Z");

const idle = {
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  pendingSubagentRequest: null,
  pendingBackgroundTasks: [],
  goal: null,
  runtime: null,
};

describe("sidebarStreamLane", () => {
  it.each([
    ["approval", "needs-you"],
    ["input", "needs-you"],
    ["request", "needs-you"],
    ["limited", "needs-you"],
    ["failed", "needs-you"],
    ["preparing", "working"],
    ["working", "working"],
    ["waiting", "working"],
    ["ready", "unread"],
  ] as const)("puts %s threads in %s", (status, lane) => {
    expect(sidebarStreamLane(idle, status)).toBe(lane);
  });

  it("keeps a ready thread with a pending subagent request in Needs you", () => {
    expect(sidebarStreamLane({ ...idle, pendingSubagentRequest: "approval" }, "ready")).toBe(
      "needs-you",
    );
  });
});

describe("buildSidebarStream", () => {
  it("splits in-play threads into cards and leaves unread ones out", () => {
    const stream = buildSidebarStream({
      inPlay: [
        { id: "approve", lane: "needs-you" as const },
        { id: "run", lane: "working" as const },
        { id: "done", lane: "unread" as const },
      ],
      laneOf: (thread) => thread.lane,
    });
    expect(stream.needsYou.map((thread) => thread.id)).toEqual(["approve"]);
    expect(stream.working.map((thread) => thread.id)).toEqual(["run"]);
  });
});

describe("orderSidebarProjectFolders", () => {
  type F = { id: string; at: number; pinned?: boolean; archived?: boolean };
  it("orders by activity with pinned first and archived last, keeping every folder", () => {
    const result = orderSidebarProjectFolders(
      [
        { id: "archived", at: NOW - HOUR, archived: true },
        { id: "old", at: NOW - 3 * DAY },
        { id: "pinned-stale", at: NOW - 30 * DAY, pinned: true },
        { id: "fresh", at: NOW - HOUR },
        { id: "stale", at: NOW - 8 * DAY },
        { id: "empty", at: 0 },
      ] satisfies F[],
      {
        lastActivityMsOf: (folder) => folder.at,
        isPinned: (folder) => folder.pinned === true,
        isArchived: (folder) => folder.archived === true,
      },
    );
    expect(result.map((folder) => folder.id)).toEqual([
      "pinned-stale",
      "fresh",
      "old",
      "stale",
      "empty",
      "archived",
    ]);
  });
});

describe("sidebarActivityDayBuckets", () => {
  it("counts activity per day, oldest first, ignoring out-of-range timestamps", () => {
    expect(
      sidebarActivityDayBuckets(
        [NOW, NOW - HOUR, NOW - DAY - HOUR, NOW - 6 * DAY - HOUR, NOW - 7 * DAY, NOW + HOUR, NaN],
        NOW,
      ),
    ).toEqual([1, 0, 0, 0, 0, 1, 2]);
  });

  it("returns null when nothing happened in the window", () => {
    expect(sidebarActivityDayBuckets([NOW - 8 * DAY], NOW)).toBeNull();
  });
});

describe("sidebarStreamActivity", () => {
  it.each([
    [{}, "approval", "Approval needed"],
    [{ pendingSubagentRequest: "approval" }, "approval", "Subagent needs approval"],
    [{ pendingSubagentRequest: "user_input" }, "input", "Subagent has a question"],
    [{ pendingGuestMessageCount: 2 }, "request", "2 guest messages"],
    [{ runtime: { lastError: "Spawn failed\nstack" } }, "failed", "Spawn failed"],
    [{}, "failed", "Run failed"],
    [{ blockedOnThreadWait: true }, "working", "Waiting on another thread"],
    [{ goal: { status: "active" } }, "working", "Working on goal"],
    [{ pendingBackgroundTasks: [1, 2] }, "working", "Working · 2 background tasks"],
    [{}, "preparing", "Setting up"],
  ] as const)("describes %o while %s", (overrides, status, text) => {
    expect(sidebarStreamActivity({ ...idle, ...overrides }, status)).toBe(text);
  });
});
