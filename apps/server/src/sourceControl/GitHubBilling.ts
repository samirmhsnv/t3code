import type {
  GitHubBillingBudget,
  GitHubBillingHeadline,
  GitHubBillingOwnerKind,
  GitHubBillingProductUsage,
  GitHubBillingUsageResult,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as VcsProcess from "../vcs/VcsProcess.ts";

// Same key and limit as the GitHub source control driver, so billing reads share its gh slots.
const GH_PROCESS_CONCURRENCY = { key: "gh", limit: 4 } as const;
const USAGE_TTL = Duration.minutes(5);
const TRANSIENT_FAILURE_TTL = Duration.seconds(30);

const Viewer = Schema.Struct({ login: Schema.String });

const UsageSummary = Schema.Struct({
  timePeriod: Schema.Struct({ year: Schema.Number, month: Schema.Number }),
  usageItems: Schema.Array(
    Schema.Struct({
      product: Schema.String,
      sku: Schema.String,
      unitType: Schema.String,
      grossQuantity: Schema.Number,
      netAmount: Schema.Number,
    }),
  ),
});
type UsageSummary = typeof UsageSummary.Type;

const Budgets = Schema.Struct({
  budgets: Schema.Array(
    Schema.Struct({
      budget_product_sku: Schema.optionalKey(Schema.NullOr(Schema.String)),
      budget_amount: Schema.Number,
    }),
  ),
});
type Budgets = typeof Budgets.Type;

const decodeViewer = Schema.decodeUnknownEffect(Schema.fromJsonString(Viewer));
const decodeUsageSummary = Schema.decodeUnknownEffect(Schema.fromJsonString(UsageSummary));
const decodeBudgets = Schema.decodeUnknownEffect(Schema.fromJsonString(Budgets));

class GhApiError extends Schema.TaggedError<GhApiError>()("GhApiError", {
  /** The HTTP status gh reported, or null when gh did not get an answer. */
  status: Schema.NullOr(Schema.Number),
  message: Schema.String,
}) {}

const isNoAccess = (error: GhApiError) => error.status === 403 || error.status === 404;

export class GitHubBilling extends Context.Service<
  GitHubBilling,
  {
    /** This month's billing usage for a GitHub user or organization; never fails. */
    readonly usage: (owner: string) => Effect.Effect<GitHubBillingUsageResult>;
  }
>()("t3/sourceControl/GitHubBilling") {}

function summarize(
  owner: string,
  kind: GitHubBillingOwnerKind,
  summary: UsageSummary,
  rawBudgets: Budgets["budgets"],
): GitHubBillingUsageResult {
  const products = new Map<
    string,
    { -readonly [K in keyof GitHubBillingProductUsage]: GitHubBillingProductUsage[K] }
  >();
  let actionsSpent = 0;
  let actionsMinutes = 0;
  for (const item of summary.usageItems) {
    if (item.product.toLowerCase() === "actions") {
      actionsSpent += item.netAmount;
      if (item.unitType === "minutes") actionsMinutes += item.grossQuantity;
    }
    const key = `${item.product}\u0000${item.unitType}`;
    const entry = products.get(key);
    if (entry === undefined) {
      products.set(key, {
        product: item.product,
        unitType: item.unitType,
        grossQuantity: item.grossQuantity,
        netAmount: item.netAmount,
      });
    } else {
      entry.grossQuantity += item.grossQuantity;
      entry.netAmount += item.netAmount;
    }
  }
  const budgets: Array<GitHubBillingBudget> = rawBudgets.map((budget) =>
    budget.budget_product_sku
      ? { sku: budget.budget_product_sku, amount: budget.budget_amount }
      : { amount: budget.budget_amount },
  );
  const actionsBudget = budgets
    .filter((budget) => budget.amount > 0 && (budget.sku === undefined || budget.sku === "actions"))
    .reduce<number | null>(
      (smallest, budget) => (smallest === null ? budget.amount : Math.min(smallest, budget.amount)),
      null,
    );
  const headline: GitHubBillingHeadline =
    actionsBudget === null
      ? { _tag: "Minutes", minutes: actionsMinutes, spent: actionsSpent }
      : { _tag: "Budget", spent: actionsSpent, budget: actionsBudget };
  return {
    _tag: "Ok",
    owner,
    kind,
    year: summary.timePeriod.year,
    month: summary.timePeriod.month,
    products: [...products.values()].toSorted(
      (left, right) => right.netAmount - left.netAmount || right.grossQuantity - left.grossQuantity,
    ),
    budgets,
    headline,
  };
}

export const make = Effect.gen(function* () {
  const vcsProcess = yield* VcsProcess.VcsProcess;
  const cwd = yield* HostProcess.WorkingDirectory;

  const ghApi = <A, E>(path: string, decode: (stdout: string) => Effect.Effect<A, E>) =>
    vcsProcess
      .run({
        operation: "GitHubBilling.api",
        command: "gh",
        args: ["api", path],
        cwd,
        env: { GH_PROMPT_DISABLED: "1" },
        allowNonZeroExit: true,
        timeoutMs: 15_000,
        concurrency: GH_PROCESS_CONCURRENCY,
      })
      .pipe(
        Effect.mapError(
          () => new GhApiError({ status: null, message: "The GitHub CLI is not available." }),
        ),
        Effect.flatMap((output) => {
          if (output.exitCode === 0) return Effect.succeed(output.stdout);
          const status = /HTTP (\d{3})/.exec(output.stderr)?.[1];
          return Effect.fail(
            new GhApiError({
              status: status === undefined ? null : Number(status),
              message: output.stderr.trim() || "The GitHub CLI failed.",
            }),
          );
        }),
        Effect.flatMap((stdout) =>
          decode(stdout).pipe(
            Effect.mapError(
              () =>
                new GhApiError({
                  status: null,
                  message: "GitHub sent a billing response T3 Code does not understand.",
                }),
            ),
          ),
        ),
      );

  const lookup = Effect.fn("GitHubBilling.lookup")(function* (owner: string) {
    const viewer = yield* ghApi("user", decodeViewer);
    if (viewer.login.toLowerCase() === owner.toLowerCase()) {
      const summary = yield* ghApi(
        `/users/${owner}/settings/billing/usage/summary`,
        decodeUsageSummary,
      );
      return summarize(owner, "user", summary, []);
    }
    const summary = yield* ghApi(
      `/organizations/${owner}/settings/billing/usage/summary`,
      decodeUsageSummary,
    );
    const budgets = yield* ghApi(
      `/organizations/${owner}/settings/billing/budgets`,
      decodeBudgets,
    ).pipe(
      Effect.map((response) => response.budgets),
      Effect.catchIf(isNoAccess, () => Effect.succeed([])),
    );
    return summarize(owner, "organization", summary, budgets);
  });

  const cache = yield* Cache.makeWith(lookup, {
    capacity: 64,
    timeToLive: (exit) =>
      Exit.isSuccess(exit) || Exit.findErrorOption(exit).pipe(Option.exists(isNoAccess))
        ? USAGE_TTL
        : TRANSIENT_FAILURE_TTL,
  });

  return GitHubBilling.of({
    usage: Effect.fn("GitHubBilling.usage")(function* (owner: string) {
      return yield* Cache.get(cache, owner.toLowerCase()).pipe(
        Effect.catchTags({
          GhApiError: (error) =>
            Effect.succeed<GitHubBillingUsageResult>({
              _tag: "Unavailable",
              owner,
              reason: isNoAccess(error)
                ? `The GitHub account on this server cannot read billing for ${owner}.`
                : error.message,
            }),
        }),
      );
    }),
  });
});

export const layer = Layer.effect(GitHubBilling, make);
