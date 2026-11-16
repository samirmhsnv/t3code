import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { ProjectId, type OrchestrationProjectShell } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { expect } from "vite-plus/test";

import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as ProjectRepositories from "./ProjectRepositories.ts";

it("reads branch and changed files from porcelain v1 status", () => {
  const stdout = [
    "## feature/x...origin/feature/x [ahead 1]",
    " M src/a.ts",
    "A  src/new file.ts",
    " D gone.ts",
    "R  renamed.ts",
    "old name.ts",
    "?? notes/",
    "!! ignored.log",
    "",
  ].join("\0");
  expect(ProjectRepositories.parsePorcelainV1Status(stdout)).toEqual({
    branch: "feature/x",
    files: [
      { path: "src/a.ts", kind: "modified" },
      { path: "src/new file.ts", kind: "added" },
      { path: "gone.ts", kind: "deleted" },
      { path: "renamed.ts", kind: "renamed" },
      { path: "notes/", kind: "added" },
    ],
  });
  expect(ProjectRepositories.parsePorcelainV1Status("## No commits yet on main\0").branch).toBe(
    "main",
  );
  expect(ProjectRepositories.parsePorcelainV1Status("## HEAD (no branch)\0").branch).toBeNull();
  expect(ProjectRepositories.parsePorcelainV1Status("## main\0").branch).toBe("main");
});

it("reads line counts from numstat, with binary files as zero", () => {
  const stdout = ["3\t1\tsrc/a.ts", "-\t-\timage.png", "2\t0\t", "old.ts", "new.ts", ""].join("\0");
  expect([...ProjectRepositories.parseNumstat(stdout)]).toEqual([
    ["src/a.ts", { insertions: 3, deletions: 1 }],
    ["image.png", { insertions: 0, deletions: 0 }],
    ["new.ts", { insertions: 2, deletions: 0 }],
  ]);
});

it.each([
  ["https://github.com/Acme/repo.git", "Acme"],
  ["https://user@github.com/Acme/repo", "Acme"],
  ["git@github.com:Acme/repo.git", "Acme"],
  ["ssh://git@github.com/Acme/repo.git", "Acme"],
  ["ssh://git@github.com:22/Acme/repo.git", "Acme"],
  ["git@gitlab.com:Acme/repo.git", null],
  ["https://github.example.com/Acme/repo", null],
  ["../local/repo", null],
])("reads the GitHub owner of %s", (url, owner) => {
  expect(ProjectRepositories.githubOwnerFromRemoteUrl(url)).toBe(owner);
});

const projectId = ProjectId.make("project:folder");

const ownersOf = (workspaceRoot: string, id: ProjectId) =>
  ProjectRepositories.ProjectRepositories.pipe(
    Effect.flatMap((repositories) => repositories.githubOwners(id)),
    Effect.provide(
      ProjectRepositories.layer.pipe(
        Layer.provide(Layer.mock(VcsProcess.VcsProcess)({})),
        Layer.provide(
          Layer.mock(ProjectStore.ProjectStoreV2)({
            getShell: (requested) =>
              Effect.succeed(
                requested === projectId
                  ? Option.some({
                      id: projectId,
                      title: "Folder",
                      workspaceRoot,
                      defaultModelSelection: null,
                      scripts: [],
                      createdAt: "2026-11-01T00:00:00.000Z",
                      updatedAt: "2026-11-01T00:00:00.000Z",
                    } satisfies OrchestrationProjectShell)
                  : Option.none(),
              ),
          }),
        ),
        Layer.provide(NodeServices.layer),
      ),
    ),
  );

it.effect("counts GitHub owners of repositories within two folders of the project root", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-github-owners-" });
    const write = (relative: string, content: string) =>
      Effect.gen(function* () {
        const file = path.join(root, relative);
        yield* fileSystem.makeDirectory(path.dirname(file), { recursive: true });
        yield* fileSystem.writeFileString(file, content);
      });
    const remote = (name: string, url: string) => `[remote "${name}"]\n\turl = ${url}\n`;

    yield* write(".git/config", remote("origin", "git@github.com:RootOrg/root.git"));
    yield* write("alpha/.git/config", remote("origin", "https://github.com/Acme/alpha.git"));
    // Folders inside a repository belong to it, not to the project folder.
    yield* write("alpha/vendor/.git/config", remote("origin", "git@github.com:Inner/vendor"));
    yield* write("beta/.git/config", remote("upstream", "https://github.com/Other/beta"));
    yield* write("group/gamma/.git/config", remote("origin", "ssh://git@github.com/acme/gamma"));
    yield* write("group/deep/nested/.git/config", remote("origin", "git@github.com:Deep/n"));
    yield* write("gitlab/.git/config", remote("origin", "git@gitlab.com:acme/x.git"));
    yield* write("node_modules/pkg/.git/config", remote("origin", "git@github.com:Npm/pkg"));
    yield* write(".cache/repo/.git/config", remote("origin", "git@github.com:Hidden/repo"));
    // A linked worktree of alpha is alpha again, not a second repository.
    yield* write("alpha/.git/worktrees/wt/commondir", "../..\n");
    yield* write("wt/.git", `gitdir: ${path.join(root, "alpha/.git/worktrees/wt")}\n`);

    expect(yield* ownersOf(root, projectId)).toEqual({
      owners: [
        { owner: "Acme", repoCount: 2 },
        { owner: "Other", repoCount: 1 },
        { owner: "RootOrg", repoCount: 1 },
      ],
    });
    expect(yield* ownersOf(root, ProjectId.make("project:missing"))).toEqual({ owners: [] });
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
