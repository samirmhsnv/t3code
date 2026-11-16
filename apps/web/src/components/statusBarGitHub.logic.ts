interface PullRequestRepository {
  readonly host: string;
  readonly repository: string;
}

function githubOwner(pullRequest: PullRequestRepository): string | null {
  if (pullRequest.host.toLowerCase() !== "github.com") return null;
  const owner = pullRequest.repository.split("/")[0];
  return owner === undefined || owner === "" ? null : owner;
}

/**
 * The GitHub owner to bill for a project whose root is not itself a repository (a folder of
 * repos): the thread's own PRs decide, else the owner most of the project's PRs belong to.
 */
export function githubOwnerFromPullRequests(
  threadPullRequests: readonly PullRequestRepository[],
  projectPullRequests: readonly PullRequestRepository[],
): string | null {
  for (const pullRequest of threadPullRequests) {
    const owner = githubOwner(pullRequest);
    if (owner !== null) return owner;
  }
  const counts = new Map<string, number>();
  for (const pullRequest of projectPullRequests) {
    const owner = githubOwner(pullRequest);
    if (owner !== null) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [owner, count] of counts) {
    if (count > bestCount) {
      best = owner;
      bestCount = count;
    }
  }
  return best;
}
