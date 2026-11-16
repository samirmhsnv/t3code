import {
  ISSUE_SOURCE_LABELS,
  IssueSource,
  type IssuePriority,
  type IssueSourceStatus,
  type IssueSummary,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";

import { isElectron } from "../../env";
import { useIssueList } from "../../state/issues";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { RefreshIcon } from "../ui/refresh-icon";
import { SidebarInset } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";

const SETTINGS_PATH = "/settings/source-control";

const PRIORITY_LABELS: Record<IssuePriority, string | null> = {
  none: null,
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function IssueRow({ issue }: { readonly issue: IssueSummary }) {
  const priority = PRIORITY_LABELS[issue.priority];
  return (
    <li>
      <a
        href={issue.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex min-w-0 items-center gap-3 px-4 py-2 text-sm outline-none hover:bg-accent focus-visible:bg-accent"
      >
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
          style={issue.status.color ? { backgroundColor: issue.status.color } : undefined}
        />
        <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">
          {issue.identifier}
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground">{issue.title}</span>
        <span className="sr-only">{issue.status.name}</span>
        {priority ? (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {priority}
          </span>
        ) : null}
        {issue.projectKey ? (
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
            {issue.projectKey}
          </span>
        ) : null}
        <time
          dateTime={issue.updatedAt}
          className="w-16 shrink-0 text-right text-xs text-muted-foreground"
        >
          {formatRelativeTimeLabel(issue.updatedAt)}
        </time>
      </a>
    </li>
  );
}

function SourceNotice({ children }: { readonly children: React.ReactNode }) {
  return <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}

function IssueSourceSection({
  source,
  status,
  issues,
}: {
  readonly source: IssueSource;
  readonly status: IssueSourceStatus;
  readonly issues: ReadonlyArray<IssueSummary>;
}) {
  const label = ISSUE_SOURCE_LABELS[source];
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-baseline gap-2 px-1 text-sm font-semibold text-foreground">
        {label}
        {status._tag === "Ok" ? (
          <span className="text-xs font-normal text-muted-foreground">{issues.length}</span>
        ) : null}
      </h2>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {status._tag === "NotConfigured" ? (
          <SourceNotice>
            Add your {label} API key in{" "}
            <Link to={SETTINGS_PATH} className="text-foreground underline underline-offset-4">
              Settings
            </Link>{" "}
            to see issues assigned to you.
          </SourceNotice>
        ) : status._tag === "Error" ? (
          <SourceNotice>
            <span className="text-destructive">{status.message}</span>{" "}
            <Link to={SETTINGS_PATH} className="text-foreground underline underline-offset-4">
              Check the key in Settings
            </Link>
          </SourceNotice>
        ) : issues.length === 0 ? (
          <SourceNotice>No open issues assigned to you.</SourceNotice>
        ) : (
          <ul className="divide-y divide-border">
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function IssuesPage() {
  const query = useIssueList();
  const result = query.data;
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <WorkspacePageHeader electron={isElectron} className="bg-background">
          <WorkspaceBreadcrumb ariaLabel="Issues breadcrumb">
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate">Issues</h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
          <div className="min-w-0 flex-1" />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh issues"
            onClick={query.refresh}
            disabled={query.isPending}
          >
            <RefreshIcon size="md" refreshing={query.isPending} />
          </Button>
        </WorkspacePageHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <WorkspacePageContainer width="wide" className="gap-6">
            {result ? (
              IssueSource.literals.map((source) => (
                <IssueSourceSection
                  key={source}
                  source={source}
                  status={result.sources[source]}
                  issues={result.issues.filter((issue) => issue.source === source)}
                />
              ))
            ) : query.error ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Issues could not load</EmptyTitle>
                  <EmptyDescription>{query.error}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            )}
          </WorkspacePageContainer>
        </div>
      </div>
    </SidebarInset>
  );
}
