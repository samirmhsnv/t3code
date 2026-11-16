import type { ScopedThreadRef } from "@t3tools/contracts";

import { pipelineStage, type PipelineSnapshot } from "../pullRequest/pipelineStage.logic";

export interface AttentionPullRequest extends PipelineSnapshot {
  /** Identifies the request across threads that link it. */
  readonly key: string;
  readonly number: number;
}

export interface AttentionThread {
  readonly ref: ScopedThreadRef;
  readonly title: string;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly pullRequests: ReadonlyArray<AttentionPullRequest>;
}

export type AttentionKind = "approval" | "input" | "ci-failing" | "conflicts" | "ready-to-merge";

export interface AttentionSegment {
  readonly count: number;
  /** The thread a click opens: the first match. */
  readonly first: ScopedThreadRef | null;
}

export interface AttentionNext {
  readonly kind: AttentionKind;
  readonly ref: ScopedThreadRef;
  readonly label: string;
}

export interface AttentionSummary {
  readonly approval: AttentionSegment;
  readonly input: AttentionSegment;
  readonly ciFailing: AttentionSegment;
  readonly readyToMerge: AttentionSegment;
  readonly next: AttentionNext | null;
}

/**
 * The order the Next chip picks in: an agent blocked on you first, then broken pull
 * requests, then finished ones. Each request counts once however many threads link it.
 */
const ATTENTION_PRIORITY: readonly AttentionKind[] = [
  "approval",
  "input",
  "ci-failing",
  "conflicts",
  "ready-to-merge",
];

function pullRequestAttention(pullRequest: AttentionPullRequest): AttentionKind | null {
  if (pullRequest.state !== "open" || pullRequest.isDraft) return null;
  if (pullRequest.checksState === "failing") return "ci-failing";
  if (pullRequest.mergeability === "conflicting") return "conflicts";
  const pipeline = pipelineStage(pullRequest);
  return pipeline.stage === "merge" && !pipeline.blocked && pullRequest.mergeability === "mergeable"
    ? "ready-to-merge"
    : null;
}

function nextLabel(kind: AttentionKind, thread: AttentionThread, number: number | null): string {
  switch (kind) {
    case "approval":
      return `Approve in ${thread.title}`;
    case "input":
      return `Answer ${thread.title}`;
    case "ci-failing":
      return `Fix CI on #${number}`;
    case "conflicts":
      return `Resolve #${number} conflicts`;
    case "ready-to-merge":
      return `Merge #${number}`;
  }
}

export function summarizeAttention(threads: Iterable<AttentionThread>): AttentionSummary {
  const counts = new Map<AttentionKind, number>();
  const firsts = new Map<AttentionKind, { thread: AttentionThread; number: number | null }>();
  const seenPullRequests = new Set<string>();
  const add = (kind: AttentionKind, thread: AttentionThread, number: number | null) => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (!firsts.has(kind)) firsts.set(kind, { thread, number });
  };
  for (const thread of threads) {
    if (thread.hasPendingApprovals) add("approval", thread, null);
    else if (thread.hasPendingUserInput) add("input", thread, null);
    for (const pullRequest of thread.pullRequests) {
      if (seenPullRequests.has(pullRequest.key)) continue;
      seenPullRequests.add(pullRequest.key);
      const kind = pullRequestAttention(pullRequest);
      if (kind !== null) add(kind, thread, pullRequest.number);
    }
  }
  const segment = (kind: AttentionKind): AttentionSegment => ({
    count: counts.get(kind) ?? 0,
    first: firsts.get(kind)?.thread.ref ?? null,
  });
  const nextKind = ATTENTION_PRIORITY.find((kind) => firsts.has(kind));
  const nextMatch = nextKind === undefined ? undefined : firsts.get(nextKind);
  return {
    approval: segment("approval"),
    input: segment("input"),
    ciFailing: segment("ci-failing"),
    readyToMerge: segment("ready-to-merge"),
    next:
      nextKind === undefined || nextMatch === undefined
        ? null
        : {
            kind: nextKind,
            ref: nextMatch.thread.ref,
            label: nextLabel(nextKind, nextMatch.thread, nextMatch.number),
          },
  };
}

export function attentionIsEmpty(summary: AttentionSummary): boolean {
  return (
    summary.approval.count === 0 &&
    summary.input.count === 0 &&
    summary.ciFailing.count === 0 &&
    summary.readyToMerge.count === 0 &&
    summary.next === null
  );
}
