import { describe, expect, it } from "vite-plus/test";

import { githubOwnerFromPullRequests } from "./statusBarGitHub.logic";

const pr = (repository: string, host = "github.com") => ({ host, repository });

describe("githubOwnerFromPullRequests", () => {
  it("prefers the thread's own GitHub PR, then the project's most common owner", () => {
    expect(githubOwnerFromPullRequests([pr("chatasist/api")], [pr("other/x"), pr("other/y")])).toBe(
      "chatasist",
    );
    expect(
      githubOwnerFromPullRequests([], [pr("atlas-dws/a"), pr("acme/b"), pr("atlas-dws/c")]),
    ).toBe("atlas-dws");
  });

  it("ignores other forges and returns null without a GitHub PR", () => {
    expect(githubOwnerFromPullRequests([pr("team/repo", "gitlab.com")], [])).toBeNull();
    expect(githubOwnerFromPullRequests([], [])).toBeNull();
  });
});
