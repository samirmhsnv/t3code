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

export const IssueSummary = Schema.Struct({
  source: IssueSource,
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  url: Schema.String,
  status: Schema.Struct({
    name: Schema.String,
    category: IssueStatusCategory,
    color: Schema.optionalKey(Schema.String),
  }),
  priority: IssuePriority,
  /** Linear team key or Deckbell project key. */
  projectKey: Schema.optionalKey(Schema.String),
  updatedAt: Schema.String,
});
export type IssueSummary = typeof IssueSummary.Type;

export const IssueSourceStatus = Schema.Union([
  Schema.TaggedStruct("NotConfigured", {}),
  Schema.TaggedStruct("Ok", {}),
  Schema.TaggedStruct("Error", { message: Schema.String }),
]);
export type IssueSourceStatus = typeof IssueSourceStatus.Type;

export const IssueListInput = Schema.Struct({});
export type IssueListInput = typeof IssueListInput.Type;

export const IssueListResult = Schema.Struct({
  /** The viewer's open assigned issues, most recently updated first. */
  issues: Schema.Array(IssueSummary),
  sources: Schema.Struct({
    linear: IssueSourceStatus,
    deckbell: IssueSourceStatus,
  }),
});
export type IssueListResult = typeof IssueListResult.Type;

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
