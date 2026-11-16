import type {
  IssuePriority,
  IssueReference,
  IssueSource,
  IssueStatus,
  IssueStatusCategory,
  IssueSummary,
} from "@t3tools/contracts";

export type IssueSourceFilter = "all" | IssueSource;

export interface IssueStatusGroup {
  readonly key: string;
  readonly status: IssueStatus;
  readonly issues: ReadonlyArray<IssueSummary>;
}

// Work in flight first, as Linear's own list reads.
const CATEGORY_ORDER: Record<IssueStatusCategory, number> = {
  started: 0,
  unstarted: 1,
  backlog: 2,
  triage: 3,
  completed: 4,
  canceled: 5,
};

export const PRIORITY_ORDER: ReadonlyArray<IssuePriority> = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

export const issueKey = (issue: IssueReference) => `${issue.source}:${issue.id}`;

export function filterIssues(
  issues: ReadonlyArray<IssueSummary>,
  source: IssueSourceFilter,
  query: string,
): ReadonlyArray<IssueSummary> {
  const needle = query.trim().toLowerCase();
  return issues.filter(
    (issue) =>
      (source === "all" || issue.source === source) &&
      (needle === "" ||
        issue.identifier.toLowerCase().includes(needle) ||
        issue.title.toLowerCase().includes(needle) ||
        issue.container?.name.toLowerCase().includes(needle) === true ||
        issue.labels.some((label) => label.name.toLowerCase().includes(needle))),
  );
}

/**
 * Groups by status name within a category, so the same column from two teams or trackers reads as
 * one group. Groups follow the category order, then the tracker's board position.
 */
export function groupIssuesByStatus(
  issues: ReadonlyArray<IssueSummary>,
): ReadonlyArray<IssueStatusGroup> {
  const groups = new Map<string, { status: IssueStatus; issues: Array<IssueSummary> }>();
  for (const issue of issues) {
    const key = `${issue.status.category}:${issue.status.name.toLowerCase()}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { status: issue.status, issues: [issue] });
    else group.issues.push(issue);
  }
  const rank = (issue: IssueSummary) => PRIORITY_ORDER.indexOf(issue.priority);
  const time = (issue: IssueSummary) => Date.parse(issue.updatedAt) || 0;
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      status: group.status,
      issues: group.issues.toSorted((a, b) => rank(a) - rank(b) || time(b) - time(a)),
    }))
    .toSorted(
      (a, b) =>
        CATEGORY_ORDER[a.status.category] - CATEGORY_ORDER[b.status.category] ||
        (a.status.position ?? 0) - (b.status.position ?? 0) ||
        a.status.name.localeCompare(b.status.name),
    );
}
