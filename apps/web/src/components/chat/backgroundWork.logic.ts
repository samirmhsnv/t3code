import type {
  EnvironmentId,
  OrchestrationV2PendingBackgroundTask,
  ProviderInstanceId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import { presentPendingBackgroundWork } from "@t3tools/client-runtime/state/thread-execution";
import { commandDisplayText } from "@t3tools/client-runtime/work-log/command-label";
import { backgroundWorkHoldsCompletion } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import * as DateTime from "effect/DateTime";

/** One pending background task, as one card above the composer and its details dialog. */
export interface BackgroundWorkRow {
  readonly taskId: string;
  readonly kind: OrchestrationV2PendingBackgroundTask["kind"];
  /** The agent's description, or the command when it has none. */
  readonly label: string;
  readonly labelIsCommand: boolean;
  /** The command's display text, when it differs from the label. */
  readonly commandText: string | null;
  /** The full command, for the details dialog. */
  readonly command: string | null;
  /** The details dialog's title for a command. */
  readonly commandTitle: string;
  /** A subagent's latest progress line. */
  readonly activity: string | null;
  /** The thread holds until this work ends. */
  readonly waiting: boolean;
  readonly startedAtMs: number | null;
  readonly childThreadId: ThreadId | null;
  readonly providerInstanceId: ProviderInstanceId | null;
  /** The command item whose output streams while it runs. */
  readonly outputItem: { readonly threadId: ThreadId; readonly itemId: TurnItemId } | null;
}

export function deriveBackgroundWorkRows(input: {
  readonly tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>;
  readonly turnItems: ThreadStructure["turnItems"];
}): ReadonlyArray<BackgroundWorkRow> {
  const presentation = presentPendingBackgroundWork(input.tasks);
  if (presentation === null) return [];
  return presentation.items.flatMap((presented) => {
    const task = input.tasks.find((candidate) => candidate.taskId === presented.taskId);
    if (task === undefined) return [];
    const nativeKey = task.nativeItemId ?? task.taskId;
    const item = input.turnItems.findLast((candidate) =>
      task.itemId === undefined
        ? (candidate.nativeItemRef?.nativeId || candidate.id) === nativeKey
        : candidate.id === task.itemId,
    );
    const subagent = item?.type === "subagent" ? item : undefined;
    const commandItem = item?.type === "command_execution" ? item : undefined;
    const command = task.command ?? commandItem?.input ?? null;
    const commandText = command === null ? null : commandDisplayText(command);
    const description = task.description?.trim();
    const outputItemId = task.itemId ?? commandItem?.id;
    return [
      {
        taskId: task.taskId,
        kind: task.kind,
        label: presented.label,
        labelIsCommand: commandText === presented.label,
        commandText: commandText !== null && commandText !== presented.label ? commandText : null,
        command,
        commandTitle:
          description && description !== command?.trim()
            ? description
            : command !== null
              ? "Command"
              : task.kind.replaceAll("_", " "),
        activity: subagent?.progress?.replace(/\s+/gu, " ").trim() || null,
        waiting: backgroundWorkHoldsCompletion([task]),
        startedAtMs: item?.startedAt ? DateTime.toEpochMillis(item.startedAt) : null,
        childThreadId: task.kind === "subagent" ? (task.childThreadId ?? null) : null,
        providerInstanceId: task.kind === "subagent" ? (task.providerInstanceId ?? null) : null,
        // A finished launch item holds only the launch notice, not the background output.
        outputItem:
          outputItemId !== undefined && item?.status === "running"
            ? {
                threadId: task.sourceThreadId ?? item.threadId,
                itemId: outputItemId,
              }
            : null,
      },
    ];
  });
}

/** Cards shown above the composer before the rest fold into "+N more". */
const BACKGROUND_WORK_VISIBLE_ROWS = 4;

export function splitBackgroundWorkRows<T>(rows: ReadonlyArray<T>): {
  readonly visible: ReadonlyArray<T>;
  readonly overflow: ReadonlyArray<T>;
} {
  // A "+1 more" row would take the space of the row it hides.
  if (rows.length <= BACKGROUND_WORK_VISIBLE_ROWS) return { visible: rows, overflow: [] };
  const shown = BACKGROUND_WORK_VISIBLE_ROWS - 1;
  return { visible: rows.slice(0, shown), overflow: rows.slice(shown) };
}

export type BackgroundWorkStatus = "running" | "waiting" | "done";

const FINISHED_RUN_STATUSES = new Set([
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);

/**
 * A subagent whose own run finished is done, even before its parent hears back.
 * A native subagent's thread mirrors the parent and has no runs, so "idle" proves nothing.
 */
export function backgroundWorkStatus(
  row: Pick<BackgroundWorkRow, "waiting">,
  childRuntimeStatus: string | null,
): BackgroundWorkStatus {
  if (childRuntimeStatus !== null && FINISHED_RUN_STATUSES.has(childRuntimeStatus)) return "done";
  return row.waiting ? "waiting" : "running";
}

/** The thread's background work, one card per task above the composer. */
export interface BackgroundWork {
  readonly id: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly rows: ReadonlyArray<BackgroundWorkRow>;
  /** Stop ends every task: the server stops background work for the whole thread. */
  readonly stopDisabled: boolean;
  readonly stopping: boolean;
  readonly onStop: () => Promise<void>;
  readonly onOpenThread: (threadId: ThreadId) => void;
}

export function deriveBackgroundWork(
  input: Omit<BackgroundWork, "id" | "rows"> & {
    readonly tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>;
    readonly turnItems: ThreadStructure["turnItems"];
  },
): BackgroundWork | null {
  const { tasks, turnItems, ...rest } = input;
  const rows = deriveBackgroundWorkRows({ tasks, turnItems });
  if (rows.length === 0) return null;
  return { ...rest, id: `background-work:${input.threadId}`, rows };
}
