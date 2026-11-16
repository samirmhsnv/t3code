import { resolvePullRequestDetailChecks } from "@t3tools/client-runtime/pull-request-checks";
import { selectEnvironmentQueryData } from "@t3tools/client-runtime/state/runtime";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import type { PullRequestReviewDecision, ScopedThreadRef } from "@t3tools/contracts";
import { FolderIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import {
  useQuietThreadProjection,
  useQuietThreadShell,
  useServerConfigs,
  useThreadCheckpointSummaries,
} from "~/state/entities";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useEnvironmentQueryIsNewer, useEnvironmentQuerySelector } from "~/state/query";

import { PipelineStageLabel } from "../pullRequest/PipelineSegments";
import { pipelineStage } from "../pullRequest/pipelineStage.logic";
import { groupPullRequestChecks } from "../pullRequest/pullRequestDetail.logic";
import {
  PullRequestActorAvatar,
  PullRequestCheckStatusIcon,
  pullRequestCheckStatusLabel,
  PullRequestReviewDecisionGlyph,
} from "../pullRequest/pullRequestPresentation";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import {
  changeBarQuarters,
  summarizeThreadChanges,
  threadNowNext,
  type ThreadChangedFile,
} from "./threadDetailsTabs.logic";

export type ThreadDetailsTab = "details" | "files";

export function ThreadDetailsTabSwitcher({
  threadRef,
  tab,
  onTabChange,
}: {
  threadRef: ScopedThreadRef;
  tab: ThreadDetailsTab;
  onTabChange: (tab: ThreadDetailsTab) => void;
}) {
  const checkpoints = useThreadCheckpointSummaries(threadRef);
  const files = summarizeThreadChanges(checkpoints).files;
  return (
    <ToggleGroup
      aria-label="Thread details view"
      value={[tab]}
      onValueChange={(next) => {
        const value = next[0];
        if (value === "details" || value === "files") onTabChange(value);
      }}
    >
      <Toggle value="details">Details</Toggle>
      {/* Distinct from the right panel's "Files" browser for assistive tech. */}
      <Toggle value="files" aria-label="Changed files">
        Files
        {files > 0 ? <span className="tabular-nums text-muted-foreground">{files}</span> : null}
      </Toggle>
    </ToggleGroup>
  );
}

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
  if (link === null || snapshot === null) return null;
  const { attention, running, completed } = groupPullRequestChecks(detail?.checks ?? []);
  const checks = [...attention, ...running, ...completed];
  const reviewDecision = snapshot.reviewDecision ?? null;
  return (
    <ThreadDetailsSection headingId="thread-details-pull-request-heading" title="Pull request">
      <div className="flex flex-col gap-1.5 px-2.5 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
            #{link.number}
          </span>
          <span className="min-w-0 truncate">{snapshot.title}</span>
        </div>
        <PipelineStageLabel
          pipeline={pipelineStage({
            ...snapshot,
            ...(detail === null ? {} : { mergeability: detail.mergeability }),
          })}
        />
        {checks.length > 0 ? (
          <ul className="flex flex-col gap-1 pt-1">
            {checks.map((check, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- Check names can repeat; rows hold no state.
              <li key={`${index}:${check.name}`} className="flex min-w-0 items-center gap-2">
                <PullRequestCheckStatusIcon status={check.status} />
                <span className="min-w-0 flex-1 truncate">{check.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {pullRequestCheckStatusLabel(check)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex min-w-0 items-center gap-2 pt-1">
          <span className="text-muted-foreground">Reviews</span>
          {reviewDecision === null ? (
            <span className="text-muted-foreground">none yet</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <PullRequestReviewDecisionGlyph decision={reviewDecision} />
              {REVIEW_DECISION_LABELS[reviewDecision]}
            </span>
          )}
          {detail !== null && detail.reviewers.length > 0 ? (
            <span className="ml-auto flex shrink-0 items-center -space-x-1">
              {detail.reviewers.slice(0, 5).map((reviewer) => (
                <PullRequestActorAvatar
                  key={reviewer.login}
                  actor={reviewer}
                  className="size-4 ring-1 ring-background"
                />
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </ThreadDetailsSection>
  );
}

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
            cell < added ? "bg-success" : cell < filled ? "bg-error" : "bg-muted-foreground/20",
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
      <span className="text-success-foreground">+{additions}</span>{" "}
      <span className="text-error-foreground">−{deletions}</span>
    </span>
  );
}

/** Every file the thread changed, from its turn checkpoints, with a per-turn breakdown. */
export function ThreadDetailsFilesTab({
  threadRef,
  onOpenChanges,
}: {
  threadRef: ScopedThreadRef;
  onOpenChanges?: (() => void) | undefined;
}) {
  const changes = summarizeThreadChanges(useThreadCheckpointSummaries(threadRef));
  if (changes.files === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">No changed files yet.</p>;
  }
  const largest = Math.max(
    ...changes.directories.flatMap((directory) =>
      directory.files.map((file: ThreadChangedFile) => file.additions + file.deletions),
    ),
  );
  const total = changes.additions + changes.deletions;
  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-xs">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium tabular-nums">
            {changes.files === 1 ? "1 file" : `${changes.files} files`}
          </span>
          <LineCounts additions={changes.additions} deletions={changes.deletions} />
        </div>
        {total > 0 ? (
          <span aria-hidden className="flex h-1 overflow-hidden rounded-full bg-muted">
            <span
              className="bg-success"
              style={{ width: `${(changes.additions / total) * 100}%` }}
            />
            <span className="flex-1 bg-error" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {changes.directories.map((directory) => (
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
                onClick={onOpenChanges}
                className="flex h-6 min-w-0 items-center gap-2 rounded-md px-1 text-left outline-none enabled:hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="w-3 shrink-0 font-mono text-info-foreground">
                  {kindLetter(file.kind)}
                </span>
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
        {changes.partial ? (
          <span className="text-muted-foreground">
            Some turns changed more files than are listed here.
          </span>
        ) : null}
      </div>
      {changes.turns.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="flex items-center justify-between text-muted-foreground">
            <span>By turn</span>
            <span>from checkpoints</span>
          </span>
          {changes.turns.map((turn) => (
            <div key={turn.turn} className="flex items-center gap-2">
              <span className="w-12 shrink-0">Turn {turn.turn}</span>
              <span className="min-w-0 flex-1 text-muted-foreground">
                {turn.files === 1 ? "1 file" : `${turn.files} files`}
              </span>
              <LineCounts additions={turn.additions} deletions={turn.deletions} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
