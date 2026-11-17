import { ThreadId, TurnItemId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  backgroundWorkStatus,
  deriveBackgroundWorkRows,
  splitBackgroundWorkRows,
} from "./backgroundWork.logic";

const commandItem = (status: "running" | "completed") => ({
  id: TurnItemId.make("bash-1"),
  threadId: ThreadId.make("thread"),
  runId: null,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 1,
  status,
  title: null,
  startedAt: DateTime.makeUnsafe("2026-11-09T00:00:00Z"),
  completedAt: null,
  updatedAt: DateTime.makeUnsafe("2026-11-09T00:00:00Z"),
  type: "command_execution" as const,
  input: "sleep 60",
  output: "",
});

describe("deriveBackgroundWorkRows", () => {
  it("gives each task its own row, status, and start time", () => {
    const rows = deriveBackgroundWorkRows({
      tasks: [
        { taskId: "bash-1", itemId: TurnItemId.make("bash-1"), kind: "command" },
        {
          taskId: "agent-1",
          kind: "subagent",
          description: "Audit modules",
          childThreadId: ThreadId.make("child"),
        },
      ],
      turnItems: [commandItem("running")],
    });
    expect(rows.map((row) => [row.taskId, row.waiting, row.childThreadId])).toEqual([
      ["agent-1", true, "child"],
      ["bash-1", false, null],
    ]);
    const command = rows.find((row) => row.taskId === "bash-1");
    expect(command?.startedAtMs).toBe(Date.parse("2026-11-09T00:00:00Z"));
    expect(command?.outputItem).toEqual({ threadId: "thread", itemId: "bash-1" });
  });

  it("streams no output once the launching item finished", () => {
    const [row] = deriveBackgroundWorkRows({
      tasks: [{ taskId: "bash-1", itemId: TurnItemId.make("bash-1"), kind: "command" }],
      turnItems: [commandItem("completed")],
    });
    expect(row?.outputItem).toBeNull();
  });
});

describe("backgroundWorkStatus", () => {
  it("marks a subagent done only once its own run finished", () => {
    expect(backgroundWorkStatus({ waiting: true }, "completed")).toBe("done");
    expect(backgroundWorkStatus({ waiting: true }, "running")).toBe("waiting");
    // A native subagent's mirrored thread has no runs while it works.
    expect(backgroundWorkStatus({ waiting: false }, "idle")).toBe("running");
    expect(backgroundWorkStatus({ waiting: false }, null)).toBe("running");
  });
});

describe("splitBackgroundWorkRows", () => {
  it("folds rows past the cap into one more row", () => {
    expect(splitBackgroundWorkRows([1, 2, 3, 4])).toEqual({ visible: [1, 2, 3, 4], overflow: [] });
    expect(splitBackgroundWorkRows([1, 2, 3, 4, 5, 6])).toEqual({
      visible: [1, 2, 3],
      overflow: [4, 5, 6],
    });
  });
});
