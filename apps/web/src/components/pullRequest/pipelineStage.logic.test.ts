import { describe, expect, it } from "vite-plus/test";

import { pipelineStage, type PipelineSnapshot } from "./pipelineStage.logic";

const open: PipelineSnapshot = { state: "open", isDraft: false };

describe("pipelineStage", () => {
  it.each([
    [
      "merged",
      { ...open, state: "merged" },
      ["done", "done", "done", "done"],
      null,
      "Merged",
      null,
    ],
    [
      "closed",
      { ...open, state: "closed" },
      ["pending", "pending", "pending", "pending"],
      null,
      "Closed",
      null,
    ],
    [
      "draft",
      { ...open, isDraft: true, checksState: "failing" },
      ["active", "pending", "pending", "pending"],
      "implement",
      "Implement",
      "draft",
    ],
    [
      "waiting on review",
      { ...open, reviewDecision: "review-required", checksState: "passing" },
      ["done", "active", "done", "pending"],
      "review",
      "Review",
      "waiting",
    ],
    [
      "changes requested beats running checks",
      { ...open, reviewDecision: "changes-requested", checksState: "pending" },
      ["done", "blocked", "active", "pending"],
      "review",
      "Review",
      "changes requested",
    ],
    [
      "failing checks block an approved request",
      { ...open, reviewDecision: "approved", checksState: "failing" },
      ["done", "done", "blocked", "pending"],
      "ci",
      "CI",
      "failing",
    ],
    [
      "ready to merge",
      { ...open, reviewDecision: "approved", checksState: "passing", mergeability: "mergeable" },
      ["done", "done", "done", "active"],
      "merge",
      "Merge",
      "ready",
    ],
    [
      "no checks reported counts as nothing to wait on",
      { ...open, reviewDecision: "approved" },
      ["done", "done", "done", "active"],
      "merge",
      "Merge",
      "ready",
    ],
    [
      "conflicts block the merge and are named while review is pending",
      { ...open, checksState: "passing", mergeability: "conflicting" },
      ["done", "active", "done", "blocked"],
      "merge",
      "Merge",
      "conflicts",
    ],
  ] as const)("%s", (_name, snapshot, segments, stage, label, detail) => {
    const pipeline = pipelineStage(snapshot);
    expect(pipeline.segments).toEqual(segments);
    expect(pipeline.stage).toBe(stage);
    expect(pipeline.label).toBe(label);
    expect(pipeline.detail).toBe(detail);
  });
});
