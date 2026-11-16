import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/shell";
import { cn } from "~/lib/utils";

import { useQuietThreadShell } from "../../state/entities";
import { InlineButton } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ComposerBanner } from "./ComposerBanner";
import {
  BACKGROUND_WORK_STATUS_LABEL,
  type BackgroundWork,
  type BackgroundWorkRow,
  backgroundWorkStatus,
  splitBackgroundWorkRows,
} from "./backgroundWork.logic";
import {
  BackgroundWorkDetails,
  BackgroundWorkStopButton,
  type BackgroundWorkStop,
} from "./BackgroundWorkDetails";
import { BackgroundWorkElapsed } from "./BackgroundWorkElapsed";

/** A subagent's live title and status; the shell is already in memory, so this loads nothing. */
function useBackgroundWorkRowState(work: BackgroundWork, row: BackgroundWorkRow) {
  const child = useQuietThreadShell(
    row.childThreadId === null ? null : scopeThreadRef(work.environmentId, row.childThreadId),
  );
  return {
    title: child?.title || row.label,
    mono: child === null && row.labelIsCommand,
    status: backgroundWorkStatus(row, child === null ? null : threadRuntimeIsActive(child.runtime)),
  };
}

function BackgroundWorkTaskCard(props: {
  readonly work: BackgroundWork;
  readonly row: BackgroundWorkRow;
  readonly stop: BackgroundWorkStop;
  readonly showStop: boolean;
}) {
  const { work, row } = props;
  const { title, mono, status } = useBackgroundWorkRowState(work, row);
  const detail = row.commandText ?? row.activity;
  return (
    <ComposerBanner.Root detached density="comfortable" data-background-work-card={row.taskId}>
      <ComposerBanner.Row>
        <ComposerBanner.Icon>
          <span
            className={cn(
              "size-2 rounded-full border-2",
              status === "done" ? "border-success" : "border-info",
            )}
          />
        </ComposerBanner.Icon>
        <ComposerBanner.Content className="gap-2 whitespace-nowrap">
          <span
            className={cn(
              "shrink-0 font-medium",
              status === "done" ? "text-success-foreground" : "text-info",
            )}
          >
            {BACKGROUND_WORK_STATUS_LABEL[status]}
          </span>
          <span className={cn("min-w-0 shrink truncate text-foreground", mono && "font-mono")}>
            {title}
          </span>
          {detail ? (
            <span
              className={cn(
                "w-0 min-w-0 grow truncate text-muted-foreground",
                row.commandText !== null && "font-mono",
              )}
            >
              {detail}
            </span>
          ) : null}
        </ComposerBanner.Content>
        <ComposerBanner.Actions className="flex-nowrap gap-3">
          {row.startedAtMs === null ? null : (
            <BackgroundWorkElapsed
              startedAtMs={row.startedAtMs}
              live={status !== "done"}
              className="border-s border-border ps-3 text-muted-foreground"
            />
          )}
          <BackgroundWorkDetails
            environmentId={work.environmentId}
            threadId={work.threadId}
            row={row}
            stop={props.stop}
            onOpenThread={work.onOpenThread}
          />
          {props.showStop ? <BackgroundWorkStopButton stop={props.stop} /> : null}
        </ComposerBanner.Actions>
      </ComposerBanner.Row>
    </ComposerBanner.Root>
  );
}

function OverflowListRow(props: {
  readonly work: BackgroundWork;
  readonly row: BackgroundWorkRow;
  readonly stop: BackgroundWorkStop;
}) {
  const { title, mono, status } = useBackgroundWorkRowState(props.work, props.row);
  return (
    <li className="flex min-w-0 items-center gap-2 py-1 text-xs">
      <span
        className={cn(
          "shrink-0 font-medium",
          status === "done" ? "text-success-foreground" : "text-info",
        )}
      >
        {BACKGROUND_WORK_STATUS_LABEL[status]}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-foreground", mono && "font-mono")}>
        {title}
      </span>
      <BackgroundWorkDetails
        environmentId={props.work.environmentId}
        threadId={props.work.threadId}
        row={props.row}
        stop={props.stop}
        onOpenThread={props.work.onOpenThread}
      />
    </li>
  );
}

/**
 * One card per background task above the composer. Stop ends all of the thread's background
 * work, so it sits once, on the last card, rather than on each.
 */
export function BackgroundWorkCards({ work }: { readonly work: BackgroundWork }) {
  const { visible, overflow } = splitBackgroundWorkRows(work.rows);
  const stop: BackgroundWorkStop = {
    label: work.rows.length > 1 ? "Stop all" : "Stop",
    disabled: work.stopDisabled,
    stopping: work.stopping,
    onStop: work.onStop,
  };
  return (
    <>
      {visible.map((row, index) => (
        <BackgroundWorkTaskCard
          key={row.taskId}
          work={work}
          row={row}
          stop={stop}
          showStop={overflow.length === 0 && index === visible.length - 1}
        />
      ))}
      {overflow.length === 0 ? null : (
        <ComposerBanner.Root detached density="comfortable" data-background-work-overflow>
          <ComposerBanner.Row>
            <ComposerBanner.Content className="gap-2 whitespace-nowrap">
              <Popover>
                <PopoverTrigger render={<InlineButton />}>+{overflow.length} more</PopoverTrigger>
                <PopoverPopup
                  side="top"
                  align="start"
                  width="md"
                  padding="compact"
                  aria-label="More background work"
                >
                  <ul className="m-0 flex list-none flex-col p-0">
                    {overflow.map((row) => (
                      <OverflowListRow key={row.taskId} work={work} row={row} stop={stop} />
                    ))}
                  </ul>
                </PopoverPopup>
              </Popover>
            </ComposerBanner.Content>
            <ComposerBanner.Actions className="flex-nowrap gap-3">
              <BackgroundWorkStopButton stop={stop} />
            </ComposerBanner.Actions>
          </ComposerBanner.Row>
        </ComposerBanner.Root>
      )}
    </>
  );
}
