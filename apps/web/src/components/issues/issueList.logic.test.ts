import type { IssueSummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { filterIssues, groupIssuesByStatus } from "./issueList.logic";

const issue = (
  identifier: string,
  status: IssueSummary["status"],
  overrides: Partial<IssueSummary> = {},
): IssueSummary => ({
  source: "linear",
  id: identifier,
  identifier,
  title: `Title ${identifier}`,
  url: `https://linear.app/i/${identifier}`,
  status,
  priority: "none",
  labels: [],
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

const todo = { name: "Todo", category: "unstarted", position: 1 } as const;
const inProgress = { name: "In Progress", category: "started", position: 2 } as const;
const inReview = { name: "In Review", category: "started", position: 3 } as const;
const backlog = { name: "Backlog", category: "backlog", position: 0 } as const;

describe("groupIssuesByStatus", () => {
  it("orders groups by category then board position, and rows by priority then recency", () => {
    const groups = groupIssuesByStatus([
      issue("A-1", backlog),
      issue("A-2", todo, { priority: "low", updatedAt: "2026-11-05T00:00:00.000Z" }),
      issue("A-3", inReview),
      issue("A-4", todo, { priority: "urgent" }),
      issue("A-5", inProgress),
      // The same column from another tracker joins the group.
      issue("WEB-1", { ...todo, position: 7 }, { source: "deckbell", priority: "low" }),
    ]);
    expect(
      groups.map((group) => [group.status.name, group.issues.map((i) => i.identifier)]),
    ).toEqual([
      ["In Progress", ["A-5"]],
      ["In Review", ["A-3"]],
      ["Todo", ["A-4", "A-2", "WEB-1"]],
      ["Backlog", ["A-1"]],
    ]);
  });
});

describe("filterIssues", () => {
  it("matches the source and text in the identifier, title, team or labels", () => {
    const issues = [
      issue("ENG-1", todo, { labels: [{ id: "l", name: "Bug" }] }),
      issue("WEB-2", todo, {
        source: "deckbell",
        container: { id: "1", key: "WEB", name: "Website" },
      }),
    ];
    const ids = (list: ReadonlyArray<IssueSummary>) => list.map((i) => i.identifier);
    expect(ids(filterIssues(issues, "deckbell", ""))).toEqual(["WEB-2"]);
    expect(ids(filterIssues(issues, "all", "bug"))).toEqual(["ENG-1"]);
    expect(ids(filterIssues(issues, "all", "websi"))).toEqual(["WEB-2"]);
    expect(ids(filterIssues(issues, "linear", "web"))).toEqual([]);
  });
});
