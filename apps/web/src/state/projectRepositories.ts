import { createProjectRepositoriesEnvironmentAtoms } from "@t3tools/client-runtime/state/project-repositories";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQuery } from "./query";

const projectRepositoriesEnvironment =
  createProjectRepositoriesEnvironmentAtoms(connectionAtomRuntime);

/** GitHub owners of the repositories in a project's folder, as that environment sees them. */
export function useProjectGitHubOwners(
  environmentId: EnvironmentId | null,
  projectId: ProjectId | null,
) {
  return useEnvironmentQuery(
    environmentId === null || projectId === null
      ? null
      : projectRepositoriesEnvironment.githubOwners({ environmentId, input: { projectId } }),
  );
}

/** Uncommitted changes in each repository under a folder project. */
export function useNestedRepoChanges(
  environmentId: EnvironmentId | null,
  projectId: ProjectId | null,
) {
  return useEnvironmentQuery(
    environmentId === null || projectId === null
      ? null
      : projectRepositoriesEnvironment.nestedChanges({ environmentId, input: { projectId } }),
  );
}
