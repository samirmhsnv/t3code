import type { LegendListRef } from "@legendapp/list/react";
import { scopedThreadKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  deriveRunlessWorkStartedAt,
  deriveThreadActivityRun,
  deriveThreadStructureRuntime,
} from "@t3tools/client-runtime/state/thread-execution";
import type { ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { projectScriptCwd } from "@t3tools/shared/projectScripts";
import { useRef } from "react";

import { useIncrementalTimelineEntries } from "../../hooks/useIncrementalTimelineEntries";
import { useClientSettings } from "../../hooks/useSettings";
import { useStableCallback } from "../../hooks/useStableCallback";
import { useTheme } from "../../hooks/useTheme";
import { deriveActiveWorkStartedAt, derivePhase } from "../../session-logic";
import {
  useProject,
  useQuietThreadProjection,
  useQuietThreadShell,
  useThreadStatus,
  useTimelineVisibleTurnItems,
} from "../../state/entities";
import { openExpandedImagePreview } from "./ExpandedImageDialog";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";
import { MessagesTimeline } from "./MessagesTimeline";
import { ScrollToEndButton } from "./TimelineOverlays";
import { useTimelineFollow } from "./useTimelineFollow";

const NO_TURN_DIFFS: ReadonlyArray<never> = [];
const NO_OPTIMISTIC_MESSAGES: ReadonlyArray<never> = [];
const ignore = () => {};

/**
 * A child thread's timeline, read-only and without a composer. It subscribes to the thread's
 * detail only while mounted, so mount it only while it is on screen.
 */
export function BackgroundChildTimeline(props: {
  readonly threadRef: ScopedThreadRef;
  /** The key of the thread whose ChatView hosts the expanded-image viewer. */
  readonly hostThreadKey: string;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const { threadRef, hostThreadKey } = props;
  const threadKey = scopedThreadKey(threadRef);
  // Its own list identity, so scroll and disclosure memory stay apart from the child's own view.
  const listKey = `background-details:${threadKey}`;
  const listRef = useRef<LegendListRef | null>(null);
  const { resolvedTheme } = useTheme();
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const shell = useQuietThreadShell(threadRef);
  const project = useProject(
    shell === null ? null : scopeProjectRef(threadRef.environmentId, shell.projectId),
  );
  const structure = useQuietThreadProjection(threadRef)?.projection ?? null;
  const status = useThreadStatus(threadRef);
  const visibleTurnItems = useTimelineVisibleTurnItems(threadRef);
  const entries = useIncrementalTimelineEntries(listKey, {
    visibleTurnItems,
    optimisticMessages: NO_OPTIMISTIC_MESSAGES,
    ...(structure === null
      ? {}
      : { attempts: structure.attempts, nodes: structure.nodes, plans: structure.plans }),
  });
  const activityRun = structure === null ? null : deriveThreadActivityRun(structure);
  const runtime = structure === null ? null : deriveThreadStructureRuntime(structure);
  const runlessWorkStartedAt = structure === null ? null : deriveRunlessWorkStartedAt(structure);
  const isWorking = derivePhase(runtime) === "running" || runlessWorkStartedAt !== null;
  const workStartedAt =
    deriveActiveWorkStartedAt(activityRun, runtime, null) ?? runlessWorkStartedAt;
  const runningRunId = runtime?.activeRunId ?? null;
  const follow = useTimelineFollow({
    legendListRef: listRef,
    composerTimelineInset: 0,
    routeThreadKey: listKey,
    activeThreadKey: listKey,
    // Nothing is sent from here, so the end is followed instead of anchoring new turns.
    isServerThread: false,
    serverProjection: null,
    threadStatus: status,
    activeActivityRun: activityRun,
    activeRunningTurnId: runningRunId,
    timelineEntries: entries,
    timelineAnchorMessageId: null,
    setTimelineAnchor: ignore,
  });
  const expandImage = useStableCallback((preview: ExpandedImagePreview) =>
    openExpandedImagePreview(hostThreadKey, preview),
  );
  const openThread = useStableCallback((threadId: ThreadId) => props.onOpenThread(threadId));
  const workspaceRoot = shell?.worktreePath ?? project?.workspaceRoot ?? undefined;
  const markdownCwd = project
    ? projectScriptCwd({
        project: { cwd: project.workspaceRoot },
        worktreePath: shell?.worktreePath ?? null,
      })
    : undefined;

  if (structure === null && entries.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        {status === "deleted" ? "This subagent's thread was deleted." : "Loading…"}
      </p>
    );
  }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <MessagesTimeline
        listRef={listRef}
        timelineEntries={entries}
        isWorking={isWorking}
        activeTurnStartedAt={workStartedAt}
        latestRun={activityRun}
        runningRunId={runningRunId}
        turnDiffSummaries={NO_TURN_DIFFS}
        runs={structure?.runs ?? []}
        routeThreadKey={threadKey}
        displayThreadKey={listKey}
        // The card above the composer already speaks for this work.
        announceTurnStatus={false}
        onOpenThread={openThread}
        supportsConversationRollback={false}
        onRevertToTurnCount={ignore}
        isRevertingCheckpoint={false}
        onImageExpand={expandImage}
        activeThreadEnvironmentId={threadRef.environmentId}
        markdownCwd={markdownCwd}
        resolvedTheme={resolvedTheme}
        timestampFormat={timestampFormat}
        workspaceRoot={workspaceRoot}
        anchorMessageId={null}
        onAnchorReady={ignore}
        onAnchorSizeChanged={ignore}
        contentInsetEndAdjustment={0}
        emptyPlaceholderInset={0}
        liveFollowEnabled={follow.timelineLiveFollowEnabled}
        onIsAtEndChange={follow.onIsAtEndChangeStable}
        onViewportAttach={follow.attachTimelineViewport}
        onFooterGrow={follow.onTimelineFooterGrowStable}
      />
      {follow.showScrollToBottom ? (
        <ScrollToEndButton
          summary={null}
          bottom={8}
          onScrollToEnd={() => follow.scrollToEnd(true)}
        />
      ) : null}
    </div>
  );
}
