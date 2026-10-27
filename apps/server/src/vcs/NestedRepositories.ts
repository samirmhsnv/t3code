import type {
  ReviewDiffFileStat,
  ReviewDiffPreviewResult,
  ReviewDiffPreviewSource,
  ReviewDiffPreviewSourceKind,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

// A folder of checkouts, not a monorepo scan: only immediate children count.
const MAX_NESTED_REPOSITORIES = 32;

/** Immediate child directories of a non-repository folder that hold their own Git repository. */
export const listNestedGitRepositories = Effect.fn("NestedRepositories.list")(function* (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
) {
  const entries = yield* fileSystem
    .readDirectory(cwd)
    .pipe(Effect.orElseSucceed((): string[] => []));
  const repositories: string[] = [];
  for (const name of entries.filter((entry) => !entry.startsWith(".")).toSorted()) {
    if (repositories.length >= MAX_NESTED_REPOSITORIES) break;
    const hasGit = yield* fileSystem
      .exists(path.join(cwd, name, ".git"))
      .pipe(Effect.orElseSucceed(() => false));
    if (hasGit) repositories.push(name);
  }
  return repositories;
});

/** Splits `child/rest` into the nested repository it belongs to and its repo-relative path. */
export function splitNestedPath(
  repositories: ReadonlyArray<string>,
  workspacePath: string,
): { readonly repository: string; readonly path: string } | null {
  const slash = workspacePath.indexOf("/");
  if (slash <= 0) return null;
  const repository = workspacePath.slice(0, slash);
  return repositories.includes(repository)
    ? { repository, path: workspacePath.slice(slash + 1) }
    : null;
}

const prefixAfterMarker = (value: string, marker: string, prefix: string) =>
  value.startsWith(`"${marker}`)
    ? `"${marker}${prefix}${value.slice(marker.length + 1)}`
    : value.startsWith(marker)
      ? `${marker}${prefix}${value.slice(marker.length)}`
      : value;

const prefixBare = (value: string, prefix: string) =>
  value.startsWith('"') ? `"${prefix}${value.slice(1)}` : `${prefix}${value}`;

/** Rewrites a repo-relative unified diff so its paths are relative to the parent folder. */
export function prefixReviewDiff(diff: string, repository: string): string {
  const prefix = `${repository}/`;
  let inHeader = false;
  return diff
    .split("\n")
    .map((line) => {
      if (line.startsWith("diff --git ")) {
        inHeader = true;
        const rest = line.slice("diff --git ".length);
        const split = rest.lastIndexOf(rest.startsWith('"') ? ' "b/' : " b/");
        if (split < 0) return line;
        return `diff --git ${prefixAfterMarker(rest.slice(0, split), "a/", prefix)} ${prefixAfterMarker(rest.slice(split + 1), "b/", prefix)}`;
      }
      if (!inHeader) return line;
      if (line.startsWith("@@")) {
        inHeader = false;
        return line;
      }
      if (line.startsWith("--- ")) return `--- ${prefixAfterMarker(line.slice(4), "a/", prefix)}`;
      if (line.startsWith("+++ ")) return `+++ ${prefixAfterMarker(line.slice(4), "b/", prefix)}`;
      for (const marker of ["rename from ", "rename to ", "copy from ", "copy to "]) {
        if (line.startsWith(marker)) return marker + prefixBare(line.slice(marker.length), prefix);
      }
      if (line.startsWith("Binary files ")) {
        return line
          .replace(/^Binary files ("?)a\//, `Binary files $1a/${prefix}`)
          .replace(/ and ("?)b\//, ` and $1b/${prefix}`);
      }
      return line;
    })
    .join("\n");
}

const prefixFile = (file: ReviewDiffFileStat, repository: string): ReviewDiffFileStat => ({
  ...file,
  path: `${repository}/${file.path}`,
  previousPath: file.previousPath === null ? null : `${repository}/${file.previousPath}`,
});

/** Combines each nested repository's review sources into one source per kind, still unhashed. */
export function mergeNestedReviewSources(
  children: ReadonlyArray<{
    readonly repository: string;
    readonly result: ReviewDiffPreviewResult;
  }>,
): Omit<ReviewDiffPreviewSource, "diffHash">[] {
  return (["working-tree", "branch-range"] as const satisfies ReviewDiffPreviewSourceKind[]).map(
    (kind) => {
      const parts = children.flatMap(({ repository, result }) => {
        const source = result.sources.find((entry) => entry.kind === kind);
        return source ? [{ repository, source }] : [];
      });
      const diff = parts
        .map(({ repository, source }) => prefixReviewDiff(source.diff, repository))
        .filter((part) => part.length > 0)
        .map((part) => (part.endsWith("\n") ? part : `${part}\n`))
        .join("");
      const files = parts.every(({ source }) => source.files !== undefined)
        ? parts.flatMap(({ repository, source }) =>
            (source.files ?? []).map((file) => prefixFile(file, repository)),
          )
        : undefined;
      const baseRefs = new Set(parts.map(({ source }) => source.baseRef));
      const sharedBaseRef = baseRefs.size === 1 ? ([...baseRefs][0] ?? null) : null;
      const baseRef = kind === "working-tree" ? "HEAD" : sharedBaseRef;
      return {
        id: kind,
        kind,
        title:
          kind === "working-tree" ? "Uncommitted" : baseRef ? `Changes vs ${baseRef}` : "Changes",
        baseRef,
        headRef: null,
        diff,
        ...(files === undefined ? {} : { files }),
        truncated: parts.some(({ source }) => source.truncated),
      };
    },
  );
}
