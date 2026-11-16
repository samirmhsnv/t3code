import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  attentionIsEmpty,
  summarizeAttention,
  type AttentionPullRequest,
  type AttentionThread,
} from "./attentionStrip.logic";

const environmentId = EnvironmentId.make("local");

function thread(id: string, overrides: Partial<AttentionThread> = {}): AttentionThread {
  return {
    ref: { environmentId, threadId: ThreadId.make(id) },
    title: id,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pullRequests: [],
    ...overrides,
  };
}

function pr(number: number, overrides: Partial<AttentionPullRequest> = {}): AttentionPullRequest {
  return { key: `repo#${number}`, number, state: "open", isDraft: false, ...overrides };
}

const failing = pr(1, { checksState: "failing" });
const conflicting = pr(2, { mergeability: "conflicting", checksState: "passing" });
const ready = pr(3, {
  reviewDecision: "approved",
  checksState: "passing",
  mergeability: "mergeable",
});

describe("summarizeAttention", () => {
  it("is empty with nothing to do", () => {
    const summary = summarizeAttention([thread("a"), thread("b", { pullRequests: [pr(9)] })]);
    expect(attentionIsEmpty(summary)).toBe(true);
  });

  it("counts each pull request once across the threads that link it", () => {
    const summary = summarizeAttention([
      thread("a", { pullRequests: [failing, ready] }),
      thread("b", { pullRequests: [failing] }),
    ]);
    expect(summary.ciFailing).toEqual({ count: 1, first: thread("a").ref });
    expect(summary.readyToMerge.count).toBe(1);
  });

  it("ignores drafts and closed requests", () => {
    const summary = summarizeAttention([
      thread("a", {
        pullRequests: [
          pr(4, { isDraft: true, checksState: "failing" }),
          pr(5, { ...ready, key: "repo#5", state: "merged" }),
        ],
      }),
    ]);
    expect(attentionIsEmpty(summary)).toBe(true);
  });

  it.each([
    [
      "approval before everything",
      [
        thread("pr", { pullRequests: [failing] }),
        thread("asks", { hasPendingUserInput: true }),
        thread("approve", { hasPendingApprovals: true }),
      ],
      "approval",
      "approve",
      "Approve in approve",
    ],
    [
      "input before broken pull requests",
      [thread("pr", { pullRequests: [failing] }), thread("asks", { hasPendingUserInput: true })],
      "input",
      "asks",
      "Answer asks",
    ],
    [
      "failing CI before conflicts",
      [thread("c", { pullRequests: [conflicting] }), thread("f", { pullRequests: [failing] })],
      "ci-failing",
      "f",
      "Fix CI on #1",
    ],
    [
      "conflicts before a ready merge",
      [thread("r", { pullRequests: [ready] }), thread("c", { pullRequests: [conflicting] })],
      "conflicts",
      "c",
      "Resolve #2 conflicts",
    ],
    [
      "a ready merge last",
      [thread("r", { pullRequests: [ready] })],
      "ready-to-merge",
      "r",
      "Merge #3",
    ],
  ] as const)("picks %s", (_name, threads, kind, threadId, label) => {
    expect(summarizeAttention(threads).next).toEqual({
      kind,
      ref: { environmentId, threadId: ThreadId.make(threadId) },
      label,
    });
  });

  it("counts a thread waiting on both approval and input once, as approval", () => {
    const summary = summarizeAttention([
      thread("a", { hasPendingApprovals: true, hasPendingUserInput: true }),
    ]);
    expect(summary.approval.count).toBe(1);
    expect(summary.input.count).toBe(0);
  });
});
