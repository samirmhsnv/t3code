import { createGitHubBillingEnvironmentAtoms } from "@t3tools/client-runtime/state/github-billing";
import type { EnvironmentId } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQuery } from "./query";

const gitHubBillingEnvironment = createGitHubBillingEnvironmentAtoms(connectionAtomRuntime);

/** This month's GitHub billing usage for `owner`, as seen by that environment's `gh`. */
export function useGitHubBillingUsage(environmentId: EnvironmentId | null, owner: string | null) {
  return useEnvironmentQuery(
    environmentId === null || owner === null
      ? null
      : gitHubBillingEnvironment.usage({ environmentId, input: { owner } }),
  );
}
