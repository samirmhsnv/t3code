import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { ArrowUpRightIcon, SquareIcon, TerminalIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useQuietThreadShell } from "../../state/entities";
import { Badge } from "../ui/badge";
import { Button, InlineButton } from "../ui/button";
import { Dialog, DialogPanel, DialogPopup, DialogTitle, DialogTrigger } from "../ui/dialog";
import { BackgroundChildTimeline } from "./BackgroundChildTimeline";
import {
  BACKGROUND_WORK_STATUS_LABEL,
  backgroundWorkStatus,
  type BackgroundWorkRow,
  type BackgroundWorkStatus,
} from "./backgroundWork.logic";
import { BackgroundWorkElapsed } from "./BackgroundWorkElapsed";
import { CommandOutputPanel, useCommandOutputStreaming } from "./CommandOutputPanel";
import { MessageCopyButton } from "./MessageCopyButton";
import { EnvironmentSubagentAvatar } from "./V2LifecycleRow";

export interface BackgroundWorkStop {
  readonly label: string;
  readonly disabled: boolean;
  readonly stopping: boolean;
  readonly onStop: () => Promise<void>;
}

export function BackgroundWorkStopButton({ stop }: { readonly stop: BackgroundWorkStop }) {
  return (
    <Button size="xs" variant="outline" disabled={stop.disabled} onClick={() => void stop.onStop()}>
      <SquareIcon />
      {stop.stopping ? "Stopping..." : stop.label}
    </Button>
  );
}

const STATUS_BADGE_VARIANT = {
  running: "info",
  waiting: "info",
  done: "success",
} as const satisfies Record<BackgroundWorkStatus, "info" | "success">;

/** One background task's details: a subagent's own timeline, or a command and its output. */
export function BackgroundWorkDetails(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly row: BackgroundWorkRow;
  readonly stop: BackgroundWorkStop;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const [open, setOpen] = useState(false);
  const isSubagent = props.row.childThreadId !== null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<InlineButton />}>Details</DialogTrigger>
      <DialogPopup className={isSubagent ? "h-[85dvh] max-w-4xl" : "max-w-2xl"}>
        {props.row.childThreadId !== null ? (
          <SubagentDetails
            {...props}
            childThreadId={props.row.childThreadId}
            onOpenThread={(threadId) => {
              setOpen(false);
              props.onOpenThread(threadId);
            }}
          />
        ) : (
          <CommandDetails {...props} />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function SubagentDetails(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly childThreadId: ThreadId;
  readonly row: BackgroundWorkRow;
  readonly stop: BackgroundWorkStop;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const { row, childThreadId } = props;
  const childRef = scopeThreadRef(props.environmentId, childThreadId);
  const shell = useQuietThreadShell(childRef);
  const providerInstanceId = row.providerInstanceId ?? shell?.providerInstanceId ?? null;
  const status = backgroundWorkStatus(row, shell?.runtime?.status ?? null);
  return (
    <>
      <DetailsHeader
        icon={
          providerInstanceId === null ? null : (
            <EnvironmentSubagentAvatar
              environmentId={props.environmentId}
              providerInstanceId={providerInstanceId}
            />
          )
        }
        title={shell?.title || row.label}
        status={status}
        startedAtMs={row.startedAtMs}
        stop={status === "done" ? null : props.stop}
        action={
          <Button size="xs" variant="outline" onClick={() => props.onOpenThread(childThreadId)}>
            <ArrowUpRightIcon />
            Open thread
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col border-t border-border">
        <BackgroundChildTimeline
          threadRef={childRef}
          hostThreadKey={scopedThreadKey(scopeThreadRef(props.environmentId, props.threadId))}
          onOpenThread={props.onOpenThread}
        />
      </div>
    </>
  );
}

function CommandDetails(props: {
  readonly environmentId: EnvironmentId;
  readonly row: BackgroundWorkRow;
  readonly stop: BackgroundWorkStop;
}) {
  const { row } = props;
  const streamsOutput = useCommandOutputStreaming(props.environmentId);
  const status = backgroundWorkStatus(row, null);
  return (
    <>
      <DetailsHeader
        icon={<TerminalIcon aria-hidden className="size-4 text-muted-foreground" />}
        title={row.commandTitle}
        status={status}
        startedAtMs={row.startedAtMs}
        stop={props.stop}
      />
      <DialogPanel>
        {row.command !== null ? (
          <DetailsSection
            label="Command"
            action={
              <MessageCopyButton
                text={row.command}
                label="Copy command"
                size="icon-xs"
                variant="ghost"
              />
            }
          >
            <pre className="max-h-48 overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre-wrap wrap-anywhere text-foreground select-text">
              {row.command}
            </pre>
          </DetailsSection>
        ) : null}
        {row.outputItem !== null && streamsOutput ? (
          <DetailsSection label="Output">
            <div className="p-3 font-mono text-xs leading-5 whitespace-pre-wrap wrap-anywhere">
              <CommandOutputPanel
                environmentId={props.environmentId}
                threadId={row.outputItem.threadId}
                itemId={row.outputItem.itemId}
              />
            </div>
          </DetailsSection>
        ) : null}
      </DialogPanel>
    </>
  );
}

function DetailsHeader(props: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly status: BackgroundWorkStatus;
  readonly startedAtMs: number | null;
  readonly stop: BackgroundWorkStop | null;
  readonly action?: ReactNode;
}) {
  return (
    // End padding clears the dialog's close button.
    <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 py-3 ps-5 pe-12">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {props.icon}
        <DialogTitle className="sr-only">{props.title}</DialogTitle>
        <span aria-hidden className="min-w-0 truncate text-sm font-medium text-foreground">
          {props.title}
        </span>
        <Badge variant={STATUS_BADGE_VARIANT[props.status]}>
          {BACKGROUND_WORK_STATUS_LABEL[props.status]}
        </Badge>
        {props.startedAtMs === null ? null : (
          <BackgroundWorkElapsed
            startedAtMs={props.startedAtMs}
            live={props.status !== "done"}
            className="text-xs text-muted-foreground"
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {props.action}
        {props.stop === null ? null : <BackgroundWorkStopButton stop={props.stop} />}
      </div>
    </div>
  );
}

function DetailsSection(props: {
  readonly label: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={props.label}
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/20"
    >
      <div className="flex h-8 items-center justify-between gap-2 border-b border-border ps-3 pe-1 text-xs text-muted-foreground">
        <span className="font-medium">{props.label}</span>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}
