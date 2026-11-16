import { ThreadId, TurnItemId, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import type { WorkLogEntry } from "../../session-logic";
import { summarizeWork } from "./TimelineWorkGroupRows.logic";

const at = "2026-01-01T00:00:00.000Z";

const work = (id: string, fields: Partial<WorkLogEntry> = {}): WorkLogEntry => ({
  id,
  createdAt: at,
  label: id,
  tone: "tool",
  ...fields,
});

const fileChange = (fileName: string, additions: number, deletions: number): WorkLogEntry => {
  const item: OrchestrationV2TurnItem = {
    id: TurnItemId.make(`edit:${fileName}`),
    threadId: ThreadId.make("thread"),
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    status: "completed",
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: DateTime.makeUnsafe(at),
    type: "file_change",
    fileName,
    additions,
    deletions,
  };
  return work(`edit:${fileName}`, { itemType: "file_change", structuredPayload: item });
};

describe("summarizeWork", () => {
  it("counts tool steps, distinct edited files with their diff, and reads", () => {
    expect(
      summarizeWork([
        work("read", { viewedImagePath: "shot.png" }),
        fileChange("src/a.ts", 40, 8),
        fileChange("src/a.ts", 2, 1),
        work("patch", { itemType: "file_change", changedFiles: ["src/b.ts"] }),
        work("run", { itemType: "command_execution", command: "vp test" }),
        work("thought", { tone: "thinking", itemType: "reasoning" }),
        work("notice", { tone: "info", itemType: "system_notice" }),
        work("ask", { itemType: "approval_request" }),
      ]),
    ).toEqual({ steps: 5, files: 2, additions: 42, deletions: 9, reads: 1 });
  });

  it("is empty for a turn with no tool work", () => {
    expect(summarizeWork([work("thought", { tone: "thinking" })])).toEqual({
      steps: 0,
      files: 0,
      additions: 0,
      deletions: 0,
      reads: 0,
    });
  });
});
