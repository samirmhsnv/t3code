import { describe, expect, it } from "vite-plus/test";

import {
  buildSidebarStream,
  sidebarStreamActivity,
  sidebarStreamLane,
} from "./sidebarStream.logic";

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
    ["ready", "done"],
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
  it("splits threads into sections and orders Done newest first", () => {
    const stream = buildSidebarStream({
      threads: [
        { id: "approve", lane: "needs-you" as const, at: 1 },
        { id: "run", lane: "working" as const, at: 2 },
        { id: "done-old", lane: "done" as const, at: 3 },
        { id: "idle", lane: null, at: 4 },
        { id: "done-new", lane: "done" as const, at: 9 },
      ],
      laneOf: (thread) => thread.lane,
      activityMsOf: (thread) => thread.at,
    });
    expect(stream.needsYou.map((thread) => thread.id)).toEqual(["approve"]);
    expect(stream.working.map((thread) => thread.id)).toEqual(["run"]);
    expect(stream.done.map((thread) => thread.id)).toEqual(["done-new", "done-old"]);
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
