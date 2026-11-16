import * as Schema from "effect/Schema";

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
