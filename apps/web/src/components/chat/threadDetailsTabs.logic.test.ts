import type { OrchestrationV2PlanArtifact } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { changeBarQuarters, groupUncommittedFiles, threadNowNext } from "./threadDetailsTabs.logic";

function checklist(
  steps: ReadonlyArray<{ text: string; status: "pending" | "running" | "completed" }>,
  status: "active" | "superseded" = "active",
): OrchestrationV2PlanArtifact {
  return {
    kind: "todo_list",
    status,
    steps: steps.map((step, index) => ({ id: `s${index}`, ...step })),
  } as unknown as OrchestrationV2PlanArtifact;
}

const plan = checklist([
  { text: "Write logic", status: "completed" },
  { text: "Wire the row", status: "running" },
  { text: "Run tests", status: "pending" },
]);
const idle = { hasPendingApprovals: false, hasPendingUserInput: false, working: true };

describe("threadNowNext", () => {
  it("reads the running step and the pending step after it", () => {
    expect(threadNowNext({ plans: [plan], ...idle })).toEqual({
      now: "Wire the row",
      next: "Run tests",
      waitingOnYou: false,
    });
  });

  it("puts a pending approval ahead of the plan", () => {
    expect(threadNowNext({ plans: [plan], ...idle, hasPendingApprovals: true })).toEqual({
      now: "Waiting for your approval",
      next: "Wire the row",
      waitingOnYou: true,
    });
  });

  it("ignores superseded checklists and offers the first pending step when idle", () => {
    const stale = checklist([{ text: "Old", status: "running" }], "superseded");
    const fresh = checklist([
      { text: "Done", status: "completed" },
      { text: "Later", status: "pending" },
    ]);
    expect(threadNowNext({ plans: [fresh, stale], ...idle, working: false })).toEqual({
      now: null,
      next: "Later",
      waitingOnYou: false,
    });
  });

  it("says only Working without a plan", () => {
    expect(threadNowNext({ plans: [], ...idle })).toEqual({
      now: "Working",
      next: null,
      waitingOnYou: false,
    });
  });
});

describe("groupUncommittedFiles", () => {
  it("groups files by folder in path order", () => {
    expect(
      groupUncommittedFiles([
        { path: "src/b.ts", insertions: 5, deletions: 0 },
        { path: "README.md", insertions: 1, deletions: 1 },
        { path: "src/a.ts", insertions: 2, deletions: 3 },
      ]),
    ).toEqual([
      {
        directory: "",
        files: [{ path: "README.md", name: "README.md", additions: 1, deletions: 1 }],
      },
      {
        directory: "src/",
        files: [
          { path: "src/a.ts", name: "a.ts", additions: 2, deletions: 3 },
          { path: "src/b.ts", name: "b.ts", additions: 5, deletions: 0 },
        ],
      },
    ]);
  });
});

describe("changeBarQuarters", () => {
  it.each([
    [0, 100, 0],
    [1, 100, 1],
    [50, 100, 2],
    [100, 100, 4],
  ])("%i of %i lines fills %i quarters", (lines, largest, quarters) => {
    expect(changeBarQuarters(lines, largest)).toBe(quarters);
  });
});
