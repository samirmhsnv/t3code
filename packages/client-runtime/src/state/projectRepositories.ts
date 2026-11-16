import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

export function createProjectRepositoriesEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    // Repositories in a folder rarely change; match the server's scan cache.
    githubOwners: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:project-repositories:github-owners",
      tag: WS_METHODS.sourceControlGithubOwners,
      staleTimeMs: 10 * 60_000,
    }),
    nestedChanges: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:project-repositories:nested-changes",
      tag: WS_METHODS.sourceControlNestedRepoChanges,
      staleTimeMs: 15_000,
    }),
  };
}
