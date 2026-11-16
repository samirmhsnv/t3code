import type {
  IssueComment,
  IssueCreateInput,
  IssueCreateResult,
  IssueDetail,
  IssueListScope,
  IssueOptions,
  IssueSummary,
  IssueTrackerError,
  IssueUpdatePatch,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";

/** One tracker's API, already holding its key. Ids are the tracker's own. */
export interface IssueTrackerAdapter {
  readonly list: (
    scope: IssueListScope,
  ) => Effect.Effect<ReadonlyArray<IssueSummary>, IssueTrackerError>;
  readonly get: (id: string) => Effect.Effect<IssueDetail, IssueTrackerError>;
  readonly options: (
    containerId: string | undefined,
  ) => Effect.Effect<IssueOptions, IssueTrackerError>;
  readonly update: (id: string, patch: IssueUpdatePatch) => Effect.Effect<void, IssueTrackerError>;
  readonly addComment: (id: string, body: string) => Effect.Effect<IssueComment, IssueTrackerError>;
  readonly create: (input: IssueCreateInput) => Effect.Effect<IssueCreateResult, IssueTrackerError>;
}
