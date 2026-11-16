import type {
  GitHubOwnersResult,
  NestedRepoChangedFile,
  NestedRepoChangesResult,
  ProjectId,
} from "@t3tools/contracts";
import { parseGitRemoteRepository, parseOriginUrlFromGitConfig } from "@t3tools/shared/git";
import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";

const SCAN_TTL = Duration.minutes(10);
const CHANGES_TTL = Duration.seconds(15);
const MAX_SCAN_DEPTH = 2;
const MAX_REPOSITORIES = 50;
// A folder this large is a data or build directory, not a folder of repositories.
const MAX_DIRECTORY_ENTRIES = 500;
const SCAN_CONCURRENCY = 8;
const GIT_CONCURRENCY = 4;
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_FILES_PER_REPOSITORY = 300;

/** The GitHub owner a remote URL names, as spelled in the URL, or null for other hosts. */
export function githubOwnerFromRemoteUrl(url: string): string | null {
  const repository = parseGitRemoteRepository(url);
  if (repository?.host !== "github.com") return null;
  const spelled = /github\.com(?::\d+)?[:/]+([A-Za-z0-9-]+)\//i.exec(url.trim())?.[1];
  return spelled ?? repository.path.split("/")[0] ?? null;
}

function statusKind(code: string): NestedRepoChangedFile["kind"] {
  if (code.includes("R")) return "renamed";
  if (code === "??" || code.includes("A")) return "added";
  if (code.includes("D")) return "deleted";
  return "modified";
}

/** Branch and changed files from `git status --porcelain=v1 --branch -z`. */
export function parsePorcelainV1Status(stdout: string): {
  readonly branch: string | null;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly kind: NestedRepoChangedFile["kind"];
  }>;
} {
  const records = stdout.split("\0");
  let branch: string | null = null;
  const files: Array<{ path: string; kind: NestedRepoChangedFile["kind"] }> = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.startsWith("## ")) {
      const header = record.slice(3);
      const unborn = /^No commits yet on (.+)$/.exec(header)?.[1];
      const name = unborn ?? header.split("...")[0]!.split(" ")[0]!;
      branch = header.startsWith("HEAD (no branch)") || name.length === 0 ? null : name;
      continue;
    }
    if (record.length < 4) continue;
    const code = record.slice(0, 2);
    if (code === "!!") continue;
    files.push({ path: record.slice(3), kind: statusKind(code) });
    // A rename or copy is followed by its original path as a separate record.
    if (/[RC]/.test(code)) index += 1;
  }
  return { branch, files };
}

/** Per-path line counts from `git diff-index --numstat -z`; binary files count as zero. */
export function parseNumstat(
  stdout: string,
): ReadonlyMap<string, { insertions: number; deletions: number }> {
  const fields = stdout.split("\0");
  const stats = new Map<string, { insertions: number; deletions: number }>();
  for (let index = 0; index < fields.length; index += 1) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(fields[index]!);
    if (match === null) continue;
    // A rename spells `old\0new` after an empty path field.
    const path = match[3] === "" ? fields[(index += 2)] : match[3];
    if (path === undefined) continue;
    stats.set(path, {
      insertions: match[1] === "-" ? 0 : Number(match[1]),
      deletions: match[2] === "-" ? 0 : Number(match[2]),
    });
  }
  return stats;
}

interface ScannedRepository {
  readonly directory: string;
  readonly gitDir: string;
  readonly githubOwner: string | null;
}

export class ProjectRepositories extends Context.Service<
  ProjectRepositories,
  {
    /**
     * GitHub owners of the project's repository and of the repositories up to two folders
     * below its root, most repositories first; never fails.
     */
    readonly githubOwners: (projectId: ProjectId) => Effect.Effect<GitHubOwnersResult>;
    /** Uncommitted changes in those same repositories; never fails. */
    readonly nestedChanges: (projectId: ProjectId) => Effect.Effect<NestedRepoChangesResult>;
  }
>()("t3/sourceControl/ProjectRepositories") {}

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const vcsProcess = yield* VcsProcess.VcsProcess;

  const readText = (file: string) =>
    fileSystem.readFileString(file).pipe(Effect.orElseSucceed(() => null));
  const statType = (target: string) =>
    fileSystem.stat(target).pipe(
      Effect.map((info) => info.type),
      Effect.orElseSucceed(() => null),
    );

  // Untraced: these run per scanned directory or repository inside a traced operation.
  const gitDirOf = Effect.fnUntraced(function* (directory: string) {
    const dotGit = path.join(directory, ".git");
    const type = yield* statType(dotGit);
    if (type === "Directory") return dotGit;
    if (type !== "File") return null;
    const target = /^gitdir:\s*(.+)$/m.exec((yield* readText(dotGit)) ?? "")?.[1]?.trim();
    if (target === undefined || target.length === 0) return null;
    const gitDir = path.resolve(directory, target);
    const commonDir = (yield* readText(path.join(gitDir, "commondir")))?.trim();
    return commonDir === undefined || commonDir.length === 0
      ? gitDir
      : path.resolve(gitDir, commonDir);
  });

  const githubOwnerOf = Effect.fnUntraced(function* (gitDir: string) {
    const config = yield* readText(path.join(gitDir, "config"));
    const url = config === null ? null : parseOriginUrlFromGitConfig(config);
    return url === null ? null : githubOwnerFromRemoteUrl(url);
  });

  const childDirectories = Effect.fnUntraced(function* (directory: string) {
    const names = yield* fileSystem
      .readDirectory(directory)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    if (names.length > MAX_DIRECTORY_ENTRIES) return [];
    const candidates = names
      .filter((name) => !name.startsWith(".") && name !== "node_modules")
      .toSorted()
      .map((name) => path.join(directory, name));
    const types = yield* Effect.forEach(candidates, statType, { concurrency: SCAN_CONCURRENCY });
    return candidates.filter((_, index) => types[index] === "Directory");
  });

  const scan = Effect.fn("ProjectRepositories.scan")(function* (root: string) {
    const found: Array<{ directory: string; gitDir: string }> = [];
    let frontier = [root];
    for (let depth = 0; depth <= MAX_SCAN_DEPTH && frontier.length > 0; depth += 1) {
      const gitDirs = yield* Effect.forEach(frontier, gitDirOf, { concurrency: SCAN_CONCURRENCY });
      const next: Array<string> = [];
      for (const [index, directory] of frontier.entries()) {
        const gitDir = gitDirs[index];
        if (gitDir !== null && gitDir !== undefined) {
          if (found.length < MAX_REPOSITORIES) found.push({ directory, gitDir });
          // A repository's own folders belong to it; only the root may hold nested repositories.
          if (directory !== root) continue;
        }
        next.push(directory);
      }
      if (found.length >= MAX_REPOSITORIES || depth === MAX_SCAN_DEPTH) break;
      const children = yield* Effect.forEach(next, childDirectories, {
        concurrency: SCAN_CONCURRENCY,
      });
      frontier = children.flat();
    }
    return yield* Effect.forEach(
      found,
      (repository) =>
        githubOwnerOf(repository.gitDir).pipe(
          Effect.map((githubOwner): ScannedRepository => ({ ...repository, githubOwner })),
        ),
      { concurrency: SCAN_CONCURRENCY },
    );
  });

  const scanCache = yield* Cache.make({ lookup: scan, capacity: 256, timeToLive: SCAN_TTL });

  const git = (operation: string, cwd: string, args: ReadonlyArray<string>) =>
    vcsProcess
      .run({
        operation: `ProjectRepositories.${operation}`,
        command: "git",
        // Optional locks would let a read race the agent's own commits for index.lock.
        args: ["--no-optional-locks", ...args],
        cwd,
        allowNonZeroExit: true,
        timeoutMs: GIT_TIMEOUT_MS,
        maxOutputBytes: GIT_MAX_OUTPUT_BYTES,
      })
      .pipe(
        Effect.map((output) => (output.exitCode === 0 ? output.stdout : null)),
        Effect.orElseSucceed(() => null),
      );

  const repositoryChanges = Effect.fnUntraced(function* (root: string, directory: string) {
    const [status, numstat] = yield* Effect.all(
      [
        git("status", directory, ["status", "--porcelain=v1", "--branch", "-z"]),
        // Fails on an unborn HEAD, where every file is new and has no counts against it.
        git("numstat", directory, ["diff-index", "--numstat", "-z", "HEAD", "--"]),
      ],
      { concurrency: 2 },
    );
    if (status === null) return null;
    const { branch, files } = parsePorcelainV1Status(status);
    if (files.length === 0) return null;
    const stats = parseNumstat(numstat ?? "");
    let insertions = 0;
    let deletions = 0;
    const changed = files.map((file): NestedRepoChangedFile => {
      const stat = stats.get(file.path) ?? { insertions: 0, deletions: 0 };
      insertions += stat.insertions;
      deletions += stat.deletions;
      return { ...file, ...stat };
    });
    return {
      path: path.relative(root, directory),
      branch,
      fileCount: changed.length,
      insertions,
      deletions,
      files: changed.slice(0, MAX_FILES_PER_REPOSITORY),
    };
  });

  const changes = Effect.fn("ProjectRepositories.changes")(function* (root: string) {
    const repositories = yield* Cache.get(scanCache, root);
    const repos = yield* Effect.forEach(
      repositories,
      (repository) => repositoryChanges(root, repository.directory),
      { concurrency: GIT_CONCURRENCY },
    );
    return { repos: repos.filter((repo) => repo !== null) } satisfies NestedRepoChangesResult;
  });

  const changesCache = yield* Cache.make({
    lookup: changes,
    capacity: 64,
    timeToLive: CHANGES_TTL,
  });

  const workspaceRootOf = (projectId: ProjectId) =>
    projects.getShell(projectId).pipe(
      Effect.map(Option.map((shell) => shell.workspaceRoot)),
      Effect.orElseSucceed(() => Option.none<string>()),
    );

  return ProjectRepositories.of({
    githubOwners: Effect.fn("ProjectRepositories.githubOwners")(function* (projectId: ProjectId) {
      const root = yield* workspaceRootOf(projectId);
      if (Option.isNone(root)) return { owners: [] };
      const repositories = yield* Cache.get(scanCache, root.value);
      const counts = new Map<string, { owner: string; repoCount: number }>();
      const seenGitDirs = new Set<string>();
      for (const { gitDir, githubOwner } of repositories) {
        // Linked worktrees share their repository's git dir and count once.
        if (githubOwner === null || seenGitDirs.has(gitDir)) continue;
        seenGitDirs.add(gitDir);
        const entry = counts.get(githubOwner.toLowerCase());
        if (entry === undefined)
          counts.set(githubOwner.toLowerCase(), { owner: githubOwner, repoCount: 1 });
        else entry.repoCount += 1;
      }
      return {
        owners: [...counts.values()].toSorted(
          (left, right) =>
            right.repoCount - left.repoCount || left.owner.localeCompare(right.owner),
        ),
      };
    }),
    nestedChanges: Effect.fn("ProjectRepositories.nestedChanges")(function* (projectId: ProjectId) {
      const root = yield* workspaceRootOf(projectId);
      if (Option.isNone(root)) return { repos: [] };
      return yield* Cache.get(changesCache, root.value);
    }),
  });
});

export const layer = Layer.effect(ProjectRepositories, make);
