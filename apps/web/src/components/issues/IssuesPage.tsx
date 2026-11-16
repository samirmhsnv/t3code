import {
  ISSUE_SOURCE_LABELS,
  IssueSource,
  type IssueListResult,
  type IssueListScope,
  type IssueReference,
  type IssueSummary,
} from "@t3tools/contracts";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { isElectron } from "../../env";
import { cn } from "~/lib/utils";
import { useIssueList } from "../../state/issues";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { RefreshIcon } from "../ui/refresh-icon";
import { SidebarInset } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { IssueDetailPanel } from "./IssueDetailPanel";
import { IssueList } from "./IssueList";
import {
  filterIssues,
  groupIssuesByStatus,
  issueKey,
  type IssueSourceFilter,
} from "./issueList.logic";
import { NewIssueDialog } from "./NewIssueDialog";

export interface IssuesSearch {
  readonly source?: IssueSource;
  readonly issue?: string;
}

const SETTINGS_PATH = "/settings/source-control";

function SourceNotices({ result }: { readonly result: IssueListResult }) {
  const notices = IssueSource.literals.flatMap((source) => {
    const status = result.sources[source];
    const label = ISSUE_SOURCE_LABELS[source];
    if (status._tag === "Error")
      return [
        <p key={source} className="text-sm">
          <span className="text-destructive">{status.message}</span>{" "}
          <Link to={SETTINGS_PATH} className="text-foreground underline underline-offset-4">
            Check the {label} key in Settings
          </Link>
        </p>,
      ];
    return [];
  });
  return notices.length === 0 ? null : (
    <div className="flex flex-col gap-1 border-b border-border px-4 py-2">{notices}</div>
  );
}

function IssueListBody({
  result,
  issues,
  selectedKey,
  onOpen,
}: {
  readonly result: IssueListResult;
  readonly issues: ReadonlyArray<IssueSummary>;
  readonly selectedKey: string | null;
  readonly onOpen: (issue: IssueSummary) => void;
}) {
  const configured = IssueSource.literals.some(
    (source) => result.sources[source]._tag !== "NotConfigured",
  );
  if (!configured)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Connect an issue tracker</EmptyTitle>
          <EmptyDescription>
            Add your Linear or Deckbell API key in{" "}
            <Link to={SETTINGS_PATH} className="text-foreground underline underline-offset-4">
              Settings
            </Link>{" "}
            to see your issues here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  if (issues.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No open issues</EmptyTitle>
          <EmptyDescription>Nothing matches these filters.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <IssueList groups={groupIssuesByStatus(issues)} selectedKey={selectedKey} onOpen={onOpen} />
  );
}

export function IssuesPage() {
  const search = useSearch({ from: "/_chat/issues" });
  const navigate = useNavigate();
  const [scope, setScope] = useState<IssueListScope>("assigned");
  const [sourceFilter, setSourceFilter] = useState<IssueSourceFilter>("all");
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const query = useIssueList(scope);
  const result = query.data;
  const selected: IssueReference | null =
    search.source !== undefined && search.issue !== undefined
      ? { source: search.source, id: search.issue }
      : null;
  const selectedKey = selected === null ? null : issueKey(selected);
  const configuredSources = IssueSource.literals.filter(
    (source) => result !== null && result.sources[source]._tag !== "NotConfigured",
  );

  const open = (issue: IssueReference | null) =>
    void navigate({
      to: "/issues",
      search: issue === null ? {} : { source: issue.source, issue: issue.id },
    });

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
            size="xs"
            variant="ghost"
            disabled={configuredSources.length === 0}
            onClick={() => setCreating(true)}
          >
            <PlusIcon />
            New issue
          </Button>
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
        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              selected !== null && "max-lg:hidden",
            )}
          >
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
              <ToggleGroup
                aria-label="Whose issues"
                value={[scope]}
                onValueChange={(next) => {
                  if (next[0] === "assigned" || next[0] === "all") setScope(next[0]);
                }}
              >
                <Toggle value="assigned">Assigned to me</Toggle>
                <Toggle value="all">All open</Toggle>
              </ToggleGroup>
              <ToggleGroup
                aria-label="Tracker"
                value={[sourceFilter]}
                onValueChange={(next) => {
                  const value = next[0];
                  if (value === "all" || value === "linear" || value === "deckbell")
                    setSourceFilter(value);
                }}
              >
                <Toggle value="all">All</Toggle>
                {IssueSource.literals.map((source) => (
                  <Toggle key={source} value={source}>
                    {ISSUE_SOURCE_LABELS[source]}
                  </Toggle>
                ))}
              </ToggleGroup>
              <div className="min-w-40 flex-1">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon aria-hidden />
                  </InputGroupAddon>
                  <InputGroupInput
                    size="sm"
                    type="search"
                    aria-label="Filter issues"
                    placeholder="Filter by title, ID, team or label"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                </InputGroup>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {result ? (
                <>
                  <SourceNotices result={result} />
                  <IssueListBody
                    result={result}
                    issues={filterIssues(result.issues, sourceFilter, text)}
                    selectedKey={selectedKey}
                    onOpen={open}
                  />
                </>
              ) : query.error ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>Issues could not load</EmptyTitle>
                    <EmptyDescription>{query.error}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              )}
            </div>
          </div>
          {selected !== null ? (
            <aside
              aria-label="Issue"
              className="flex min-h-0 w-full flex-col border-border lg:w-1/2 lg:max-w-3xl lg:border-l"
              onKeyDown={(event) => {
                if (event.key === "Escape" && event.target === event.currentTarget) open(null);
              }}
            >
              <IssueDetailPanel key={selectedKey} reference={selected} onClose={() => open(null)} />
            </aside>
          ) : null}
        </div>
      </div>
      {creating ? (
        <NewIssueDialog
          sources={configuredSources}
          onClose={() => setCreating(false)}
          onCreated={(issue) => {
            setCreating(false);
            open(issue);
          }}
        />
      ) : null}
    </SidebarInset>
  );
}
