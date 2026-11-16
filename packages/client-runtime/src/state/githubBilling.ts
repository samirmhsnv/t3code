import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

export function createGitHubBillingEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    // Billing usage moves slowly and the status bar is always mounted; match the server cache.
    usage: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:github-billing:usage",
      tag: WS_METHODS.sourceControlGithubBillingUsage,
      staleTimeMs: 5 * 60_000,
    }),
  };
}
