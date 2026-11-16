import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/process";
import { expect } from "vite-plus/test";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubBilling from "./GitHubBilling.ts";

const summary = (items: ReadonlyArray<Record<string, unknown>>) =>
  JSON.stringify({ timePeriod: { year: 2026, month: 11 }, usageItems: items });

const item = (product: string, sku: string, unitType: string, gross: number, net: number) => ({
  product,
  sku,
  unitType,
  grossQuantity: gross,
  discountQuantity: 0,
  netQuantity: gross,
  grossAmount: net,
  discountAmount: 0,
  netAmount: net,
  pricePerUnit: 0.006,
});

const budget = (sku: string | null, amount: number) => ({
  id: `budget-${sku}`,
  budget_type: "ProductPricing",
  budget_product_sku: sku,
  budget_scope: "organization",
  budget_amount: amount,
  prevent_further_usage: true,
  budget_entity_name: "acme",
});

const NOT_FOUND = {
  exitCode: 1,
  stdout: '{"message":"Not Found"}',
  stderr: "gh: Not Found (HTTP 404)",
};

/** Answers `gh api <path>` from a table; unknown paths 404 like GitHub does. */
const withGh = (routes: Record<string, string | typeof NOT_FOUND>, calls: Array<string> = []) =>
  Effect.provideService(
    VcsProcess.VcsProcess,
    VcsProcess.VcsProcess.of({
      run: (input) => {
        const path = input.args[1] ?? "";
        calls.push(path);
        const route = routes[path] ?? NOT_FOUND;
        const output =
          typeof route === "string" ? { exitCode: 0, stdout: route, stderr: "" } : route;
        return Effect.succeed({
          ...output,
          exitCode: ChildProcessSpawner.ExitCode(output.exitCode),
          stdoutTruncated: false,
          stderrTruncated: false,
        });
      },
    }),
  );

const usageWith = (
  routes: Record<string, string | typeof NOT_FOUND>,
  owner: string,
  calls: Array<string> = [],
) =>
  GitHubBilling.make.pipe(
    Effect.flatMap((billing) => billing.usage(owner)),
    withGh(routes, calls),
  );

const viewer = JSON.stringify({ login: "Me" });

it.effect("reads the personal summary when the owner is the gh user", () =>
  Effect.gen(function* () {
    const calls: Array<string> = [];
    const result = yield* usageWith(
      {
        user: viewer,
        "/users/me/settings/billing/usage/summary": summary([
          item("Actions", "actions_linux", "minutes", 120, 0),
          item("Actions", "actions_macos", "minutes", 30, 0),
          item("Actions", "actions_storage", "gigabyte-hours", 5, 0),
          item("Copilot", "copilot_premium_request", "requests", 12, 1.5),
        ]),
      },
      "me",
      calls,
    );
    expect(calls).not.toContain("/organizations/me/settings/billing/budgets");
    expect(result).toEqual({
      _tag: "Ok",
      owner: "me",
      kind: "user",
      year: 2026,
      month: 11,
      products: [
        { product: "Copilot", unitType: "requests", grossQuantity: 12, netAmount: 1.5 },
        { product: "Actions", unitType: "minutes", grossQuantity: 150, netAmount: 0 },
        { product: "Actions", unitType: "gigabyte-hours", grossQuantity: 5, netAmount: 0 },
      ],
      budgets: [],
      headline: { _tag: "Minutes", minutes: 150, spent: 0 },
    });
  }),
);

it.effect("measures Actions spend against a positive Actions budget", () =>
  Effect.gen(function* () {
    const result = yield* usageWith(
      {
        user: viewer,
        "/organizations/acme/settings/billing/usage/summary": summary([
          item("Actions", "actions_linux", "minutes", 6000, 30),
          item("Actions", "actions_storage", "gigabyte-hours", 100, 9),
        ]),
        "/organizations/acme/settings/billing/budgets": JSON.stringify({
          budgets: [budget("actions", 100), budget("git_lfs", 0)],
        }),
      },
      "acme",
    );
    expect(result).toMatchObject({
      _tag: "Ok",
      kind: "organization",
      budgets: [
        { sku: "actions", amount: 100 },
        { sku: "git_lfs", amount: 0 },
      ],
      headline: { _tag: "Budget", spent: 39, budget: 100 },
    });
  }),
);

it.effect("falls back to minutes when the only budgets are zero or not for Actions", () =>
  Effect.gen(function* () {
    const result = yield* usageWith(
      {
        user: viewer,
        "/organizations/acme/settings/billing/usage/summary": summary([
          item("Actions", "actions_linux", "minutes", 7, 0),
        ]),
        "/organizations/acme/settings/billing/budgets": JSON.stringify({
          budgets: [budget("actions", 0), budget("packages", 50)],
        }),
      },
      "acme",
    );
    expect(result).toMatchObject({ headline: { _tag: "Minutes", minutes: 7, spent: 0 } });
  }),
);

it.effect("counts an all-products budget toward Actions", () =>
  Effect.gen(function* () {
    const result = yield* usageWith(
      {
        user: viewer,
        "/organizations/acme/settings/billing/usage/summary": summary([
          item("Actions", "actions_linux", "minutes", 10, 2),
        ]),
        "/organizations/acme/settings/billing/budgets": JSON.stringify({
          budgets: [budget(null, 20)],
        }),
      },
      "acme",
    );
    expect(result).toMatchObject({
      budgets: [{ amount: 20 }],
      headline: { _tag: "Budget", spent: 2, budget: 20 },
    });
  }),
);

it.effect("reports an org the gh user cannot administer as unavailable", () =>
  Effect.gen(function* () {
    const result = yield* usageWith({ user: viewer }, "pingdotgg");
    expect(result).toEqual({
      _tag: "Unavailable",
      owner: "pingdotgg",
      reason: "The GitHub account on this server cannot read billing for pingdotgg.",
    });
  }),
);

it.effect("serves a repeat request for the same owner from the cache", () =>
  Effect.gen(function* () {
    const calls: Array<string> = [];
    yield* Effect.gen(function* () {
      const billing = yield* GitHubBilling.make;
      yield* billing.usage("pingdotgg");
      yield* billing.usage("PingDotGG");
    }).pipe(withGh({ user: viewer }, calls));
    expect(calls).toEqual(["user", "/organizations/pingdotgg/settings/billing/usage/summary"]);
  }),
);
