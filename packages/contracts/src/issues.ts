import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { SettingsSecretValue } from "./settingsSecretValue.ts";

export const IssueSource = Schema.Literals(["linear", "deckbell"]);
export type IssueSource = typeof IssueSource.Type;

export const ISSUE_SOURCE_LABELS: Record<IssueSource, string> = {
  linear: "Linear",
  deckbell: "Deckbell",
};

export const IssueStatusCategory = Schema.Literals([
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
]);
export type IssueStatusCategory = typeof IssueStatusCategory.Type;

export const IssuePriority = Schema.Literals(["none", "urgent", "high", "medium", "low"]);
export type IssuePriority = typeof IssuePriority.Type;

export const IssueStatus = Schema.Struct({
  /** Linear workflow state id or Deckbell state id; absent only on old cached rows. */
  id: Schema.optionalKey(Schema.String),
  name: Schema.String,
  category: IssueStatusCategory,
  color: Schema.optionalKey(Schema.String),
  /** The tracker's board order within its team or project. */
  position: Schema.optionalKey(Schema.Number),
});
export type IssueStatus = typeof IssueStatus.Type;

export const IssueLabel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.optionalKey(Schema.String),
});
export type IssueLabel = typeof IssueLabel.Type;

export const IssuePerson = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  avatarUrl: Schema.optionalKey(Schema.String),
});
export type IssuePerson = typeof IssuePerson.Type;

/** A Linear team or a Deckbell project: what owns an issue's statuses, labels and identifier. */
export const IssueContainer = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
});
export type IssueContainer = typeof IssueContainer.Type;

export const IssueSummary = Schema.Struct({
  source: IssueSource,
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  url: Schema.String,
  status: IssueStatus,
  priority: IssuePriority,
  labels: Schema.Array(IssueLabel),
  assignee: Schema.optionalKey(IssuePerson),
  container: Schema.optionalKey(IssueContainer),
  updatedAt: Schema.String,
});
export type IssueSummary = typeof IssueSummary.Type;

export const IssueComment = Schema.Struct({
  id: Schema.String,
  body: Schema.String,
  author: Schema.optionalKey(IssuePerson),
  createdAt: Schema.String,
});
export type IssueComment = typeof IssueComment.Type;

export const IssueDetail = Schema.Struct({
  ...IssueSummary.fields,
  /** Markdown; empty when the issue has none. */
  description: Schema.String,
  /** A Linear project the issue belongs to, which Deckbell folds into its container. */
  project: Schema.optionalKey(Schema.String),
  creator: Schema.optionalKey(IssuePerson),
  createdAt: Schema.String,
  /** Oldest first. */
  comments: Schema.Array(IssueComment),
});
export type IssueDetail = typeof IssueDetail.Type;

export const IssueSourceStatus = Schema.Union([
  Schema.TaggedStruct("NotConfigured", {}),
  Schema.TaggedStruct("Ok", {}),
  Schema.TaggedStruct("Error", { message: Schema.String }),
]);
export type IssueSourceStatus = typeof IssueSourceStatus.Type;

export const IssueListScope = Schema.Literals(["assigned", "all"]);
export type IssueListScope = typeof IssueListScope.Type;

export const IssueListInput = Schema.Struct({
  /** Open issues assigned to the viewer (the default), or every open issue they can see. */
  scope: Schema.optionalKey(IssueListScope),
});
export type IssueListInput = typeof IssueListInput.Type;

export const IssueListResult = Schema.Struct({
  /** Open issues, most recently updated first. */
  issues: Schema.Array(IssueSummary),
  sources: Schema.Struct({
    linear: IssueSourceStatus,
    deckbell: IssueSourceStatus,
  }),
});
export type IssueListResult = typeof IssueListResult.Type;

export class IssueTrackerError extends Schema.TaggedError<IssueTrackerError>()(
  "IssueTrackerError",
  { message: Schema.String },
) {}

export const IssueReference = Schema.Struct({ source: IssueSource, id: Schema.String });
export type IssueReference = typeof IssueReference.Type;

export const IssueGetInput = IssueReference;
export type IssueGetInput = typeof IssueGetInput.Type;

export const IssueUpdatePatch = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  statusId: Schema.optionalKey(Schema.String),
  priority: Schema.optionalKey(IssuePriority),
  /** null unassigns. */
  assigneeId: Schema.optionalKey(Schema.NullOr(Schema.String)),
  /** Replaces every label. */
  labelIds: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type IssueUpdatePatch = typeof IssueUpdatePatch.Type;

export const IssueUpdateInput = Schema.Struct({
  ...IssueReference.fields,
  patch: IssueUpdatePatch,
});
export type IssueUpdateInput = typeof IssueUpdateInput.Type;

export const IssueAddCommentInput = Schema.Struct({
  ...IssueReference.fields,
  body: Schema.String,
});
export type IssueAddCommentInput = typeof IssueAddCommentInput.Type;

export const IssueCreateInput = Schema.Struct({
  source: IssueSource,
  containerId: Schema.String,
  title: Schema.String,
  description: Schema.optionalKey(Schema.String),
  priority: Schema.optionalKey(IssuePriority),
  statusId: Schema.optionalKey(Schema.String),
  assigneeId: Schema.optionalKey(Schema.String),
  labelIds: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type IssueCreateInput = typeof IssueCreateInput.Type;

export const IssueCreateResult = Schema.Struct({
  ...IssueReference.fields,
  identifier: Schema.String,
  url: Schema.String,
});
export type IssueCreateResult = typeof IssueCreateResult.Type;

export const IssueOptionsInput = Schema.Struct({
  source: IssueSource,
  /** A team or project id; without one only `containers` is filled. */
  containerId: Schema.optionalKey(Schema.String),
});
export type IssueOptionsInput = typeof IssueOptionsInput.Type;

export const IssueOptions = Schema.Struct({
  containers: Schema.Array(IssueContainer),
  /** In board order. */
  statuses: Schema.Array(IssueStatus),
  members: Schema.Array(IssuePerson),
  labels: Schema.Array(IssueLabel),
});
export type IssueOptions = typeof IssueOptions.Type;

const IssueTrackerCredential = SettingsSecretValue.pipe(
  Schema.withDecodingDefault(Effect.succeed("")),
);
export const IssueTrackerCredentials = Schema.Struct({
  linear: IssueTrackerCredential,
  deckbell: IssueTrackerCredential,
});
export type IssueTrackerCredentials = typeof IssueTrackerCredentials.Type;

export const IssueTrackerCredentialsPatch = Schema.Struct({
  linear: Schema.optionalKey(SettingsSecretValue),
  deckbell: Schema.optionalKey(SettingsSecretValue),
});
