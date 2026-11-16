import * as Schema from "effect/Schema";

import { ProjectId } from "./baseSchemas.ts";

export const GitHubBillingUsageInput = Schema.Struct({
  owner: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/)),
});
export type GitHubBillingUsageInput = typeof GitHubBillingUsageInput.Type;

export const GitHubBillingOwnerKind = Schema.Literals(["user", "organization"]);
export type GitHubBillingOwnerKind = typeof GitHubBillingOwnerKind.Type;

/** This month's usage of one product in one unit, summed across its SKUs. */
export const GitHubBillingProductUsage = Schema.Struct({
  product: Schema.String,
  unitType: Schema.String,
  grossQuantity: Schema.Number,
  netAmount: Schema.Number,
});
export type GitHubBillingProductUsage = typeof GitHubBillingProductUsage.Type;

export const GitHubBillingBudget = Schema.Struct({
  /** Product or SKU the budget covers; absent for an all-products budget. */
  sku: Schema.optionalKey(Schema.String),
  amount: Schema.Number,
});
export type GitHubBillingBudget = typeof GitHubBillingBudget.Type;

export const GitHubBillingHeadline = Schema.Union([
  /** Actions spend against a positive budget that covers Actions. */
  Schema.TaggedStruct("Budget", { spent: Schema.Number, budget: Schema.Number }),
  Schema.TaggedStruct("Minutes", { minutes: Schema.Number, spent: Schema.Number }),
]);
export type GitHubBillingHeadline = typeof GitHubBillingHeadline.Type;

export const GitHubBillingUsageResult = Schema.Union([
  Schema.TaggedStruct("Ok", {
    owner: Schema.String,
    kind: GitHubBillingOwnerKind,
    year: Schema.Number,
    month: Schema.Number,
    products: Schema.Array(GitHubBillingProductUsage),
    budgets: Schema.Array(GitHubBillingBudget),
    headline: GitHubBillingHeadline,
  }),
  Schema.TaggedStruct("Unavailable", { owner: Schema.String, reason: Schema.String }),
]);
export type GitHubBillingUsageResult = typeof GitHubBillingUsageResult.Type;

export const GitHubOwnersInput = Schema.Struct({ projectId: ProjectId });
export type GitHubOwnersInput = typeof GitHubOwnersInput.Type;

/** GitHub owners of the project's repository and the repositories in its folder, most used first. */
export const GitHubOwnersResult = Schema.Struct({
  owners: Schema.Array(Schema.Struct({ owner: Schema.String, repoCount: Schema.Number })),
});
export type GitHubOwnersResult = typeof GitHubOwnersResult.Type;

export const NestedRepoChangesInput = Schema.Struct({ projectId: ProjectId });
export type NestedRepoChangesInput = typeof NestedRepoChangesInput.Type;

export const NestedRepoChangedFile = Schema.Struct({
  path: Schema.String,
  kind: Schema.Literals(["added", "modified", "deleted", "renamed"]),
  insertions: Schema.Number,
  deletions: Schema.Number,
});
export type NestedRepoChangedFile = typeof NestedRepoChangedFile.Type;

/** Uncommitted changes against HEAD in each repository under a folder project, changed ones only. */
export const NestedRepoChangesResult = Schema.Struct({
  repos: Schema.Array(
    Schema.Struct({
      /** Relative to the project root; empty for the root itself. */
      path: Schema.String,
      branch: Schema.NullOr(Schema.String),
      fileCount: Schema.Number,
      insertions: Schema.Number,
      deletions: Schema.Number,
      /** At most a few hundred files; `fileCount` counts them all. */
      files: Schema.Array(NestedRepoChangedFile),
    }),
  ),
});
export type NestedRepoChangesResult = typeof NestedRepoChangesResult.Type;
