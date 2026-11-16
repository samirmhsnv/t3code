import { createIssueEnvironmentAtoms } from "@t3tools/client-runtime/state/issues";

import { connectionAtomRuntime } from "../connection/runtime";
import { usePrimaryEnvironmentId } from "./environments";
import { useEnvironmentQuery } from "./query";

const issueEnvironment = createIssueEnvironmentAtoms(connectionAtomRuntime);

/** The primary environment's open assigned issues from Linear and Deckbell. */
export function useIssueList() {
  const environmentId = usePrimaryEnvironmentId();
  return useEnvironmentQuery(
    environmentId === null ? null : issueEnvironment.list({ environmentId, input: {} }),
  );
}
