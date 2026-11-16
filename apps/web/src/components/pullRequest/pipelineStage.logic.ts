import type {
  PullRequestChecksState,
  PullRequestMergeability,
  PullRequestReviewDecision,
  PullRequestState,
} from "@t3tools/contracts";

export type PipelineSegmentState = "done" | "active" | "blocked" | "pending";
export type PipelineStageName = "implement" | "review" | "ci" | "merge";

export interface PipelineSnapshot {
  readonly state: PullRequestState;
  readonly isDraft: boolean;
  readonly reviewDecision?: PullRequestReviewDecision | null | undefined;
  readonly checksState?: PullRequestChecksState | null | undefined;
  readonly mergeability?: PullRequestMergeability | null | undefined;
  /** Whether anyone is asked to review; unknown keeps an undecided review in progress. */
  readonly reviewRequested?: boolean | undefined;
}

export interface Pipeline {
  /** Implement, Review, CI and Merge, in order. */
  readonly segments: readonly [
    PipelineSegmentState,
    PipelineSegmentState,
    PipelineSegmentState,
    PipelineSegmentState,
  ];
  /** The stage that holds the request now; null once it is merged or closed. */
  readonly stage: PipelineStageName | null;
  readonly label: string;
  readonly detail: string | null;
  readonly blocked: boolean;
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStageName, string> = {
  implement: "Implement",
  review: "Review",
  ci: "CI",
  merge: "Merge",
};

const STAGES: readonly PipelineStageName[] = ["implement", "review", "ci", "merge"];

/** Where an open pull request stands: the first blocked stage wins, then the first one in progress. */
export function pipelineStage(snapshot: PipelineSnapshot): Pipeline {
  if (snapshot.state === "merged") {
    return {
      segments: ["done", "done", "done", "done"],
      stage: null,
      label: "Merged",
      detail: null,
      blocked: false,
    };
  }
  if (snapshot.state === "closed") {
    return {
      segments: ["pending", "pending", "pending", "pending"],
      stage: null,
      label: "Closed",
      detail: null,
      blocked: false,
    };
  }
  if (snapshot.isDraft) {
    return {
      segments: ["active", "pending", "pending", "pending"],
      stage: "implement",
      label: "Implement",
      detail: "draft",
      blocked: false,
    };
  }
  const review: PipelineSegmentState =
    snapshot.reviewDecision === "approved"
      ? "done"
      : snapshot.reviewDecision === "changes-requested"
        ? "blocked"
        : snapshot.reviewDecision == null && snapshot.reviewRequested === false
          ? "pending"
          : "active";
  const ci: PipelineSegmentState =
    snapshot.checksState === "passing"
      ? "done"
      : snapshot.checksState === "failing"
        ? "blocked"
        : snapshot.checksState === "pending"
          ? "active"
          : // No checks reported: nothing to wait on.
            "done";
  const conflicting = snapshot.mergeability === "conflicting";
  const merge: PipelineSegmentState = conflicting
    ? "blocked"
    : review === "done" && ci === "done"
      ? "active"
      : "pending";
  const segments = ["done", review, ci, merge] as const;
  const blockedIndex = segments.indexOf("blocked");
  const activeIndex = segments.indexOf("active");
  // Nothing in progress: the first stage still waiting holds it, such as a review nobody was asked for.
  const index =
    blockedIndex !== -1
      ? blockedIndex
      : activeIndex !== -1
        ? activeIndex
        : review === "pending"
          ? 1
          : 3;
  const stage = STAGES[index]!;
  return {
    segments,
    stage,
    label: PIPELINE_STAGE_LABELS[stage],
    detail: pipelineDetail(stage, snapshot, conflicting),
    blocked: blockedIndex !== -1,
  };
}

function pipelineDetail(
  stage: PipelineStageName,
  snapshot: PipelineSnapshot,
  conflicting: boolean,
): string | null {
  switch (stage) {
    case "review":
      return snapshot.reviewDecision === "changes-requested"
        ? "changes requested"
        : snapshot.reviewDecision == null && snapshot.reviewRequested === false
          ? "no reviewers"
          : "waiting";
    case "ci":
      return snapshot.checksState === "failing" ? "failing" : "running";
    case "merge":
      return conflicting ? "conflicts" : "ready";
    case "implement":
      return null;
  }
}
