import type { OrchestrationV2PlanArtifact } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { TurnDiffSummary } from "../../types";
import {
  changeBarQuarters,
  summarizeThreadChanges,
  threadNowNext,
} from "./threadDetailsTabs.logic";

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

function checkpoint(
  turn: number,
  files: TurnDiffSummary["files"],
  extra: Partial<TurnDiffSummary> = {},
): TurnDiffSummary {
  return {
    checkpointTurnCount: turn,
    status: "ready",
    files,
    ...extra,
  } as unknown as TurnDiffSummary;
}

describe("summarizeThreadChanges", () => {
  it("sums each path across turns, groups by folder and lists turns newest first", () => {
    const changes = summarizeThreadChanges([
      checkpoint(1, [
        { path: "src/a.ts", kind: "added", additions: 10, deletions: 0 },
        { path: "README.md", kind: "modified", additions: 1, deletions: 1 },
      ]),
      checkpoint(2, [{ path: "src/a.ts", kind: "modified", additions: 2, deletions: 3 }]),
      checkpoint(3, [{ path: "src/b.ts", kind: "added", additions: 5, deletions: 0 }], {
        status: "missing",
      }),
    ]);
    expect(changes).toEqual({
      files: 2,
      additions: 13,
      deletions: 4,
      directories: [
        {
          directory: "",
          files: [
            { path: "README.md", name: "README.md", kind: "modified", additions: 1, deletions: 1 },
          ],
        },
        {
          directory: "src/",
          files: [
            { path: "src/a.ts", name: "a.ts", kind: "modified", additions: 12, deletions: 3 },
          ],
        },
      ],
      turns: [
        { turn: 2, files: 1, additions: 2, deletions: 3 },
        { turn: 1, files: 2, additions: 11, deletions: 1 },
      ],
      partial: false,
    });
  });

  it("takes a turn's totals from filesTotal when only a prefix of files was sent", () => {
    const changes = summarizeThreadChanges([
      checkpoint(1, [{ path: "a.ts", kind: "added", additions: 1, deletions: 0 }], {
        filesTotal: { count: 40, additions: 900, deletions: 12 },
      }),
    ]);
    expect(changes.turns).toEqual([{ turn: 1, files: 40, additions: 900, deletions: 12 }]);
    expect(changes.partial).toBe(true);
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
