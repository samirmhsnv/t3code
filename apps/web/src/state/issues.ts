import { createIssueEnvironmentAtoms } from "@t3tools/client-runtime/state/issues";
import type { IssueListScope, IssueReference, IssueSource } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import { usePrimaryEnvironmentId } from "./environments";
import { useEnvironmentQuery } from "./query";

export const issueEnvironment = createIssueEnvironmentAtoms(connectionAtomRuntime);

/** The primary environment's open issues from Linear and Deckbell, assigned to the viewer by default. */
export function useIssueList(scope: IssueListScope = "assigned") {
  const environmentId = usePrimaryEnvironmentId();
  return useEnvironmentQuery(
    environmentId === null
      ? null
      : issueEnvironment.list({ environmentId, input: scope === "assigned" ? {} : { scope } }),
  );
}

/** One issue with its description and comments, fetched when it opens. */
export function useIssueDetail(issue: IssueReference | null) {
  const environmentId = usePrimaryEnvironmentId();
  return useEnvironmentQuery(
    environmentId === null || issue === null
      ? null
      : issueEnvironment.detail({ environmentId, input: { source: issue.source, id: issue.id } }),
  );
}

/** Teams or projects for a tracker, and for one of them what its pickers offer. */
export function useIssueOptions(source: IssueSource | null, containerId: string | undefined) {
  const environmentId = usePrimaryEnvironmentId();
  return useEnvironmentQuery(
    environmentId === null || source === null
      ? null
      : issueEnvironment.options({
          environmentId,
          input: containerId === undefined ? { source } : { source, containerId },
        }),
  );
}
