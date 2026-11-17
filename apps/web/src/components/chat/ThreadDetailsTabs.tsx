import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { resolvePullRequestDetailChecks } from "@t3tools/client-runtime/pull-request-checks";
import { selectEnvironmentQueryData } from "@t3tools/client-runtime/state/runtime";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import type { PullRequestReviewDecision, ScopedThreadRef } from "@t3tools/contracts";
import { ChevronRightIcon, ExternalLinkIcon, FolderIcon } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";

import { useOpenPrLink } from "~/lib/openPullRequestLink";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import {
  useProject,
  useQuietThreadProjection,
  useQuietThreadShell,
  useServerConfigs,
} from "~/state/entities";
import { useNestedRepoChanges } from "~/state/projectRepositories";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { vcsEnvironment } from "~/state/vcs";
import { useDiffPanelStore } from "~/diffPanelStore";
import {
  useEnvironmentQuery,
  useEnvironmentQueryIsNewer,
  useEnvironmentQuerySelector,
} from "~/state/query";

import { PipelineStageLabel } from "../pullRequest/PipelineSegments";
import { pipelineStage } from "../pullRequest/pipelineStage.logic";
import { groupPullRequestChecks } from "../pullRequest/pullRequestDetail.logic";
import {
  PullRequestActorAvatar,
  PullRequestCheckStatusIcon,
  pullRequestCheckStatusLabel,
  PullRequestReviewDecisionGlyph,
} from "../pullRequest/pullRequestPresentation";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import { changeBarQuarters, groupUncommittedFiles, threadNowNext } from "./threadDetailsTabs.logic";

function DetailsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 px-2.5 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/** Doing now and Next, from a pending request or the newest checklist. */
export function ThreadDetailsActivitySection({ threadRef }: { threadRef: ScopedThreadRef }) {
  const shell = useQuietThreadShell(threadRef);
  const plans = useQuietThreadProjection(threadRef)?.projection.plans ?? [];
  const nowNext =
    shell === null
      ? null
      : threadNowNext({
          plans,
          hasPendingApprovals: shell.hasPendingApprovals,
          hasPendingUserInput: shell.hasPendingUserInput,
          working: isThreadWorking(shell),
        });
  return (
    <ThreadDetailsSection
      headingId="thread-details-activity-heading"
      title="Activity"
      showHeading={false}
      separated={false}
    >
      <div>
        {nowNext?.now ? (
          <DetailsRow label="Doing now">
            <span className={cn(nowNext.waitingOnYou && "text-warning-foreground")}>
              {nowNext.now}
            </span>
          </DetailsRow>
        ) : null}
        {nowNext?.next ? <DetailsRow label="Next">{nowNext.next}</DetailsRow> : null}
      </div>
    </ThreadDetailsSection>
  );
}

const REVIEW_DECISION_LABELS: Record<PullRequestReviewDecision, string> = {
  approved: "Approved",
  "changes-requested": "Changes requested",
  "review-required": "Review required",
};

/** The thread's open pull request: stage, each check, and the review decision. */
export function ThreadDetailsPullRequestSection({ threadRef }: { threadRef: ScopedThreadRef }) {
  const shell = useQuietThreadShell(threadRef);
  const serverConfigs = useServerConfigs();
  const link = shell === null ? null : resolveThreadCurrentPullRequestLink(shell.pullRequests);
  const snapshot = link?.snapshot ?? null;
  const reference =
    shell === null || link === null || serverConfigs.get(threadRef.environmentId) === undefined
      ? null
      : {
          projectId: shell.projectId,
          host: link.host,
          repository: link.repository,
          number: link.number,
        };
  // The same atoms the pull request row reads and refreshes, so this adds no requests of its own.
  const detailAtom =
    reference === null
      ? null
      : pullRequestEnvironment.detail({
          environmentId: threadRef.environmentId,
          input: { ...reference, allowStale: false },
        });
  const detailData = useEnvironmentQuerySelector(detailAtom, selectEnvironmentQueryData);
  const supportsChecks =
    serverConfigs.get(threadRef.environmentId)?.environment.capabilities.pullRequestChecks === true;
  const checksAtom =
    supportsChecks && reference !== null && detailData !== null
      ? pullRequestEnvironment.checks({ environmentId: threadRef.environmentId, input: reference })
      : null;
  const checksData = useEnvironmentQuerySelector(checksAtom, selectEnvironmentQueryData);
  const checksAreNewer = useEnvironmentQueryIsNewer(checksAtom, detailAtom);
  const detail = resolvePullRequestDetailChecks(detailData, checksData, checksAreNewer);
  const [checksExpanded, setChecksExpanded] = useState(false);
  const openPrLink = useOpenPrLink(threadRef);
  if (link === null || snapshot === null) return null;
  const { attention, running, completed } = groupPullRequestChecks(detail?.checks ?? []);
  const checks = [...attention, ...running, ...completed];
  const reviewDecision = snapshot.reviewDecision ?? null;
  const reviewers = detail?.reviewers ?? [];
  const pipeline = pipelineStage({
    ...snapshot,
    ...(detail === null
      ? {}
      : { mergeability: detail.mergeability, reviewRequested: reviewers.length > 0 }),
  });
  const openInPanel = (event: MouseEvent<HTMLElement>) => openPrLink(event, link.url);
  return (
    <ThreadDetailsSection headingId="thread-details-pull-request-heading" title="Pull request">
      <div className="flex flex-col gap-0.5 px-1 text-xs">
        <div className="flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`Open #${link.number} in the right panel`}
            onClick={openInPanel}
            onAuxClick={openInPanel}
            className={cn(DETAILS_BUTTON_CLASS, "flex-1")}
          >
            <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
              #{link.number}
            </span>
            <span className="min-w-0 truncate">{snapshot.title}</span>
          </button>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Open #${link.number} on the web`}
                  onClick={() => void readLocalApi()?.shell.openExternal(link.url)}
                  className={cn(DETAILS_BUTTON_CLASS, "shrink-0 text-muted-foreground")}
                />
              }
            >
              <ExternalLinkIcon aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="top">Open on the web</TooltipPopup>
          </Tooltip>
        </div>
        <button
          type="button"
          aria-expanded={checksExpanded}
          aria-controls="thread-details-pull-request-checks"
          onClick={() => setChecksExpanded((expanded) => !expanded)}
          className={DETAILS_BUTTON_CLASS}
        >
          <PipelineStageLabel pipeline={pipeline} />
          <span className="flex-1" />
          {checks.length > 0 ? (
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {checks.length === 1 ? "1 check" : `${checks.length} checks`}
            </span>
          ) : null}
          <ChevronRightIcon
            aria-hidden
            className={cn("size-3.5 shrink-0 text-muted-foreground", checksExpanded && "rotate-90")}
          />
        </button>
        {checksExpanded ? (
          <div id="thread-details-pull-request-checks" className="flex flex-col gap-0.5 ps-1.5">
            {checks.length === 0 ? (
              <span className="px-1.5 py-1 text-muted-foreground">No checks reported.</span>
            ) : (
              <ul className="flex flex-col">
                {checks.map((check, index) => {
                  const row = (
                    <>
                      <PullRequestCheckStatusIcon status={check.status} />
                      <span className="min-w-0 flex-1 truncate">{check.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {pullRequestCheckStatusLabel(check)}
                      </span>
                    </>
                  );
                  const url = check.url;
                  return (
                    // oxlint-disable-next-line react/no-array-index-key -- Check names can repeat; rows hold no state.
                    <li key={`${index}:${check.name}`}>
                      {url === null ? (
                        <span className="flex h-6 min-w-0 items-center gap-2 px-1.5">{row}</span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`${check.name}: ${pullRequestCheckStatusLabel(check)}. Open details`}
                          onClick={() => void readLocalApi()?.shell.openExternal(url)}
                          className={cn(DETAILS_BUTTON_CLASS, "w-full")}
                        >
                          {row}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <span className="flex h-6 min-w-0 items-center gap-2 px-1.5 text-muted-foreground">
              Review
              <span className="text-foreground">
                {reviewDecision === null
                  ? reviewers.length > 0
                    ? "waiting on reviewers"
                    : "nobody asked yet"
                  : REVIEW_DECISION_LABELS[reviewDecision]}
              </span>
            </span>
          </div>
        ) : null}
        <Tooltip disabled={reviewers.length === 0}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Open #${link.number} reviews in the right panel`}
                onClick={openInPanel}
                onAuxClick={openInPanel}
                className={DETAILS_BUTTON_CLASS}
              />
            }
          >
            <span className="text-muted-foreground">Reviews</span>
            {reviewDecision === null ? (
              <span className="text-muted-foreground">none yet</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <PullRequestReviewDecisionGlyph decision={reviewDecision} />
                {REVIEW_DECISION_LABELS[reviewDecision]}
              </span>
            )}
            {reviewers.length > 0 ? (
              <span className="ml-auto flex shrink-0 items-center -space-x-1">
                {reviewers.slice(0, 5).map((reviewer) => (
                  <PullRequestActorAvatar
                    key={reviewer.login}
                    actor={reviewer}
                    className="size-4 ring-1 ring-background"
                  />
                ))}
              </span>
            ) : null}
          </TooltipTrigger>
          <TooltipPopup side="top">
            <span className="flex flex-col gap-1">
              <span className="font-medium">Requested reviewers</span>
              {reviewers.map((reviewer) => (
                <span key={reviewer.login} className="flex items-center gap-1.5">
                  <PullRequestActorAvatar actor={reviewer} />
                  <span>{reviewer.name?.trim() || reviewer.login}</span>
                  {reviewer.name?.trim() ? (
                    <span className="text-muted-foreground">{reviewer.login}</span>
                  ) : null}
                </span>
              ))}
            </span>
          </TooltipPopup>
        </Tooltip>
      </div>
    </ThreadDetailsSection>
  );
}

const DETAILS_BUTTON_CLASS =
  "flex h-6 min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function ChangeBar({
  additions,
  deletions,
  largest,
}: {
  additions: number;
  deletions: number;
  largest: number;
}) {
  const filled = changeBarQuarters(additions + deletions, largest);
  const added =
    additions + deletions === 0 ? 0 : Math.round((filled * additions) / (additions + deletions));
  return (
    <span aria-hidden className="flex shrink-0 gap-px">
      {[0, 1, 2, 3].map((cell) => (
        <span
          key={cell}
          className={cn(
            "h-1.5 w-2 rounded-xs",
            cell < added
              ? "bg-diff-addition"
              : cell < filled
                ? "bg-diff-deletion"
                : "bg-muted-foreground/20",
          )}
        />
      ))}
    </span>
  );
}

function kindLetter(kind: string): string {
  return kind.charAt(0).toUpperCase();
}

function LineCounts({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="shrink-0 font-mono tabular-nums">
      <span className="text-diff-addition-foreground">+{additions}</span>{" "}
      <span className="text-diff-deletion-foreground">−{deletions}</span>
    </span>
  );
}

type NestedRepo = NonNullable<ReturnType<typeof useNestedRepoChanges>["data"]>["repos"][number];

/**
 * A folder of repositories has no checkpoints, so show what is uncommitted in each repository
 * right now instead. Older servers lack the request and show nothing here.
 */
function NestedRepoChanges({
  repos,
  projectTitle,
}: {
  repos: ReadonlyArray<NestedRepo>;
  projectTitle: string;
}) {
  const largest = Math.max(
    ...repos.flatMap((repo) => repo.files.map((file) => file.insertions + file.deletions)),
  );
  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">Changes in repos</span>
        <span className="text-muted-foreground">
          Uncommitted changes in each repository now, not only this thread's.
        </span>
      </div>
      {repos.map((repo) => (
        <div key={repo.path} className="flex flex-col">
          <span className="flex min-w-0 items-center gap-1.5 py-0.5">
            <FolderIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono font-medium">
              {repo.path === "" ? projectTitle : repo.path}
            </span>
            {repo.branch !== null ? (
              <span className="min-w-0 truncate text-muted-foreground">{repo.branch}</span>
            ) : null}
            <span className="flex-1" />
            <LineCounts additions={repo.insertions} deletions={repo.deletions} />
          </span>
          {repo.files.map((file) => (
            <span
              key={file.path}
              aria-label={`${file.path}, ${file.insertions} added, ${file.deletions} removed`}
              className="flex h-6 min-w-0 items-center gap-2 px-1"
            >
              <span className="w-3 shrink-0 font-mono text-info-foreground">
                {kindLetter(file.kind)}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
              <ChangeBar additions={file.insertions} deletions={file.deletions} largest={largest} />
              <LineCounts additions={file.insertions} deletions={file.deletions} />
            </span>
          ))}
          {repo.fileCount > repo.files.length ? (
            <span className="px-1 text-muted-foreground">
              {repo.fileCount - repo.files.length} more files
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** The working tree's uncommitted files in their own section, absent while there are none. */
export function ThreadDetailsFilesTab(props: {
  threadRef: ScopedThreadRef;
  gitCwd: string | null;
  onOpenChanges?: (() => void) | undefined;
}) {
  const { threadRef, gitCwd } = props;
  const status = useEnvironmentQuery(
    gitCwd === null
      ? null
      : vcsEnvironment.status({ environmentId: threadRef.environmentId, input: { cwd: gitCwd } }),
  ).data;
  // A folder of repositories has no single working tree, so each repository's changes stand in.
  const thread = useQuietThreadShell(threadRef);
  const project = useProject(
    thread === null ? null : scopeProjectRef(threadRef.environmentId, thread.projectId),
  );
  const repos =
    useNestedRepoChanges(
      threadRef.environmentId,
      project === null || project.repositoryIdentity != null ? null : project.id,
    ).data?.repos ?? [];
  const usesFallback = gitCwd === null || status?.isRepo === false;
  const hasFallback = repos.length > 0;
  const tree = usesFallback ? null : (status?.workingTree ?? null);
  if (usesFallback ? !hasFallback : tree === null || tree.files.length === 0) return null;
  return (
    <ThreadDetailsSection
      headingId="thread-details-files-heading"
      title="Uncommitted changes"
      separated={false}
      showHeading={false}
    >
      {tree === null ? (
        <NestedRepoChanges repos={repos} projectTitle={project?.title ?? "Project"} />
      ) : (
        <UncommittedFiles tree={tree} threadRef={threadRef} onOpenChanges={props.onOpenChanges} />
      )}
    </ThreadDetailsSection>
  );
}

function UncommittedFiles({
  tree,
  threadRef,
  onOpenChanges,
}: {
  tree: {
    readonly files: ReadonlyArray<{
      readonly path: string;
      readonly insertions: number;
      readonly deletions: number;
    }>;
    readonly insertions: number;
    readonly deletions: number;
  };
  threadRef: ScopedThreadRef;
  onOpenChanges?: (() => void) | undefined;
}) {
  const directories = groupUncommittedFiles(tree.files);
  const largest = Math.max(...tree.files.map((file) => file.insertions + file.deletions));
  const total = tree.insertions + tree.deletions;
  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-xs">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium tabular-nums">
            {tree.files.length === 1
              ? "1 uncommitted file"
              : `${tree.files.length} uncommitted files`}
          </span>
          <LineCounts additions={tree.insertions} deletions={tree.deletions} />
        </div>
        {total > 0 ? (
          <span aria-hidden className="flex h-1 overflow-hidden rounded-full bg-muted">
            <span
              className="bg-diff-addition"
              style={{ width: `${(tree.insertions / total) * 100}%` }}
            />
            <span className="flex-1 bg-diff-deletion" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {directories.map((directory) => (
          <div key={directory.directory} className="flex flex-col">
            {directory.directory === "" ? null : (
              <span className="flex min-w-0 items-center gap-1.5 py-0.5 text-muted-foreground">
                <FolderIcon aria-hidden className="size-3 shrink-0" />
                <span className="truncate font-mono">{directory.directory}</span>
              </span>
            )}
            {directory.files.map((file) => (
              <button
                key={file.path}
                type="button"
                aria-label={`${file.path}, ${file.additions} added, ${file.deletions} removed`}
                disabled={onOpenChanges === undefined}
                onClick={() => {
                  onOpenChanges?.();
                  // Opening the panel selects the branch range; these files are the working tree.
                  useDiffPanelStore.getState().selectGitScope(threadRef, "unstaged");
                }}
                className="flex h-6 min-w-0 items-center gap-2 rounded-md px-1 text-left outline-none enabled:hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 truncate font-mono">{file.name}</span>
                <ChangeBar
                  additions={file.additions}
                  deletions={file.deletions}
                  largest={largest}
                />
                <LineCounts additions={file.additions} deletions={file.deletions} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
