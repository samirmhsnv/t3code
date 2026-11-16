import type { IssueSummary } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import { useState, type CSSProperties, type KeyboardEvent } from "react";

import { cn } from "~/lib/utils";
import { formatRelativeTime } from "../../timestampFormat";
import { Badge } from "../ui/badge";
import { IssueAvatar, IssuePriorityIcon, IssueStatusIcon, PRIORITY_LABELS } from "./IssueIcons";
import { issueKey, type IssueStatusGroup } from "./issueList.logic";

const MAX_ROW_LABELS = 2;

function IssueRow({
  issue,
  selected,
  onOpen,
}: {
  readonly issue: IssueSummary;
  readonly selected: boolean;
  readonly onOpen: (issue: IssueSummary) => void;
}) {
  const labels = issue.labels.slice(0, MAX_ROW_LABELS);
  return (
    <li>
      <button
        type="button"
        data-issue-row
        aria-current={selected ? "true" : undefined}
        onClick={() => onOpen(issue)}
        className={cn(
          "flex h-9 w-full min-w-0 cursor-pointer items-center gap-2.5 px-4 text-left text-sm outline-none hover:bg-accent/60 focus-visible:bg-accent",
          selected && "bg-accent",
        )}
      >
        <IssuePriorityIcon priority={issue.priority} />
        <span className="sr-only">{PRIORITY_LABELS[issue.priority]}</span>
        <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
          {issue.identifier}
        </span>
        <IssueStatusIcon status={issue.status} />
        <span className="sr-only">{issue.status.name}</span>
        <span className="min-w-0 flex-1 truncate text-foreground">{issue.title}</span>
        {labels.length > 0 ? (
          <span className="hidden min-w-0 shrink items-center gap-1 md:flex">
            {labels.map((label) => (
              <Badge
                key={label.id}
                size="sm"
                variant={label.color ? "label" : "secondary"}
                className="max-w-28 min-w-0"
                {...(label.color ? { style: { "--label": label.color } as CSSProperties } : {})}
              >
                <span className="truncate">{label.name}</span>
              </Badge>
            ))}
            {issue.labels.length > labels.length ? (
              <span className="text-xs text-muted-foreground">
                +{issue.labels.length - labels.length}
              </span>
            ) : null}
          </span>
        ) : null}
        {issue.container ? (
          <span className="hidden w-12 shrink-0 truncate text-right font-mono text-xs text-muted-foreground sm:inline">
            {issue.container.key}
          </span>
        ) : null}
        <IssueAvatar person={issue.assignee} />
        <span className="sr-only">
          {issue.assignee ? `Assigned to ${issue.assignee.name}` : "Unassigned"}
        </span>
        <time
          dateTime={issue.updatedAt}
          className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
        >
          {formatRelativeTime(issue.updatedAt)?.value}
        </time>
      </button>
    </li>
  );
}

function moveRowFocus(event: KeyboardEvent<HTMLDivElement>) {
  const step =
    event.key === "ArrowDown" || event.key === "j"
      ? 1
      : event.key === "ArrowUp" || event.key === "k"
        ? -1
        : 0;
  if (step === 0 || event.metaKey || event.ctrlKey || event.altKey) return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-issue-row]")];
  if (rows.length === 0) return;
  event.preventDefault();
  const current = rows.indexOf(document.activeElement as HTMLElement);
  const next =
    current === -1
      ? step > 0
        ? 0
        : rows.length - 1
      : Math.min(Math.max(current + step, 0), rows.length - 1);
  rows[next]?.focus();
}

/** Status groups in Linear's list style; arrows or j/k move between rows and Enter opens one. */
export function IssueList({
  groups,
  selectedKey,
  onOpen,
}: {
  readonly groups: ReadonlyArray<IssueStatusGroup>;
  readonly selectedKey: string | null;
  readonly onOpen: (issue: IssueSummary) => void;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <div onKeyDown={moveRowFocus}>
      {groups.map((group) => {
        const open = !collapsed.has(group.key);
        return (
          <section key={group.key} aria-label={group.status.name}>
            <h2 className="sticky top-0 z-10">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(group.key)}
                className="flex h-9 w-full cursor-pointer items-center gap-2 border-y border-border/60 bg-muted/60 px-4 text-left text-sm font-medium text-foreground outline-none backdrop-blur-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ChevronRightIcon
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-90",
                  )}
                />
                <IssueStatusIcon status={group.status} />
                <span className="truncate">{group.status.name}</span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {group.issues.length}
                </span>
              </button>
            </h2>
            {open ? (
              <ul>
                {group.issues.map((issue) => (
                  <IssueRow
                    key={issueKey(issue)}
                    issue={issue}
                    selected={issueKey(issue) === selectedKey}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
