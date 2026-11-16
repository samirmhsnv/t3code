import type { OrchestrationV2PlanArtifact } from "@t3tools/contracts";
import {
  parsePullRequestAnchor,
  pullRequestDiffPathMatches,
} from "@t3tools/shared/pullRequestAnchor";
import { describe, expect, it } from "vite-plus/test";

import type { TurnDiffSummary } from "../../types";
import {
  changeBarQuarters,
  parsePatchFileStats,
  pullRequestFileUrl,
  summarizeThreadChanges,
  threadNowNext,
  threadPullRequestFileGroups,
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

describe("parsePatchFileStats", () => {
  it("counts lines per file, bounded by hunk headers", () => {
    const patch = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1..2 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,3 +1,3 @@",
      " keep",
      "--- removed line that looks like a header",
      "+++ added line that looks like a header",
      " keep",
      "diff --git a/new.md b/new.md",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.md",
      "@@ -0,0 +1,2 @@",
      "+one",
      "+two",
      "diff --git a/gone.txt b/gone.txt",
      "deleted file mode 100644",
      "--- a/gone.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
      "\\ No newline at end of file",
      "diff --git a/old.ts b/moved.ts",
      "similarity index 100%",
      "rename from old.ts",
      "rename to moved.ts",
      "",
    ].join("\n");
    expect(
      parsePatchFileStats(patch, [{ path: "huge.lock", additions: 900, deletions: 4 }]),
    ).toEqual([
      { path: "src/a.ts", kind: "modified", additions: 1, deletions: 1 },
      { path: "new.md", kind: "added", additions: 2, deletions: 0 },
      { path: "gone.txt", kind: "deleted", additions: 0, deletions: 1 },
      { path: "moved.ts", kind: "renamed", additions: 0, deletions: 0 },
      { path: "huge.lock", kind: "modified", additions: 900, deletions: 4 },
    ]);
  });

  it("splits plain unified diffs without git headers", () => {
    const patch = [
      "--- a/x",
      "+++ b/x",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "--- a/y",
      "+++ b/y",
      "@@ -1 +1,2 @@",
      " a",
      "+b",
    ].join("\n");
    expect(
      parsePatchFileStats(patch).map((file) => [file.path, file.additions, file.deletions]),
    ).toEqual([
      ["x", 1, 1],
      ["y", 1, 0],
    ]);
  });
});

describe("threadPullRequestFileGroups", () => {
  const link = (
    number: number,
    state: "open" | "merged" | "closed" | null,
    updatedAt: string,
    extra: { isDraft?: boolean; source?: string } = {},
  ) => ({
    host: "github.com",
    repository: `acme/repo${number}`,
    number,
    linkedAt: "2026-01-01T00:00:00.000Z",
    source: extra.source ?? "agent",
    snapshot: state === null ? null : { state, isDraft: extra.isDraft ?? false, updatedAt },
  });

  it("orders open, draft, merged, closed, newest first, and expands only open ones", () => {
    const { groups, hidden } = threadPullRequestFileGroups(
      [
        link(1, "merged", "2026-03-01T00:00:00.000Z"),
        link(2, "open", "2026-01-02T00:00:00.000Z"),
        link(3, "closed", "2026-04-01T00:00:00.000Z"),
        link(4, "open", "2026-02-01T00:00:00.000Z", { isDraft: true }),
        link(5, "open", "2026-02-02T00:00:00.000Z"),
        link(6, "open", "2026-05-01T00:00:00.000Z", { source: "stack-dismissed" }),
      ],
      8,
    );
    expect(groups.map((group) => [group.link.number, group.expandedByDefault])).toEqual([
      [5, true],
      [2, true],
      [4, true],
      [1, false],
      [3, false],
    ]);
    expect(hidden).toBe(0);
  });

  it("caps the groups and counts the rest", () => {
    const { groups, hidden } = threadPullRequestFileGroups(
      [1, 2, 3].map((number) => link(number, "merged", `2026-0${number}-01T00:00:00.000Z`)),
      2,
    );
    expect(groups.map((group) => group.link.number)).toEqual([3, 2]);
    expect(hidden).toBe(1);
  });
});

describe("pullRequestFileUrl", () => {
  it("names the file in anchors the PR panel resolves", () => {
    for (const url of [
      "https://github.com/acme/app/pull/66",
      "https://gitlab.com/acme/app/-/merge_requests/7/",
    ]) {
      const anchor = parsePullRequestAnchor(pullRequestFileUrl(url, "src/a b.ts"));
      expect(anchor?.kind).toBe("diff");
      if (anchor?.kind !== "diff") continue;
      expect(pullRequestDiffPathMatches(anchor.digest, "src/a b.ts")).toBe(true);
      expect(pullRequestDiffPathMatches(anchor.digest, "src/other.ts")).toBe(false);
    }
    expect(pullRequestFileUrl("https://example.com/pr/3", "a.ts")).toBe("https://example.com/pr/3");
  });
});
