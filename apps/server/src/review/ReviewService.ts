import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Hex from "effect/encoding/Hex";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import {
  VcsRepositoryDetectionError,
  VcsUnsupportedOperationError,
  type ReviewDiffFileContentsInput,
  type ReviewDiffFileContentsResult,
  type ReviewDiffPreviewError,
  type ReviewDiffPreviewInput,
  type ReviewDiffPreviewResult,
} from "@t3tools/contracts";

import * as ServerConfig from "../config.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as KnownWorkspaces from "../workspace/KnownWorkspaces.ts";
import {
  listNestedGitRepositories,
  mergeNestedReviewSources,
  splitNestedPath,
} from "../vcs/NestedRepositories.ts";

export class ReviewService extends Context.Service<
  ReviewService,
  {
    readonly getDiffPreview: (
      input: ReviewDiffPreviewInput,
    ) => Effect.Effect<ReviewDiffPreviewResult, ReviewDiffPreviewError>;
    readonly getDiffFileContents: (
      input: ReviewDiffFileContentsInput,
    ) => Effect.Effect<ReviewDiffFileContentsResult, ReviewDiffPreviewError>;
  }
>()("t3/review/ReviewService") {}

/** @public */
export const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const vcsRegistry = yield* VcsDriverRegistry.VcsDriverRegistry;
  const git = yield* GitVcsDriver.GitVcsDriver;
  const knownWorkspaces = yield* KnownWorkspaces.KnownWorkspaces;
  const crypto = yield* Crypto.Crypto;

  const canonicalizePath = (value: string) => {
    const resolvedPath = path.resolve(value);
    return fileSystem.realPath(resolvedPath).pipe(
      Effect.catchTags({
        PlatformError: (cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.succeed(resolvedPath)
            : Effect.fail(
                new VcsRepositoryDetectionError({
                  operation: "ReviewService.assertWorkspaceBoundCwd.canonicalizePath",
                  cwd: resolvedPath,
                  detail: "Failed to resolve a path while validating the review workspace.",
                  cause,
                }),
              ),
      }),
    );
  };

  const assertWorkspaceBoundCwd = Effect.fn("ReviewService.assertWorkspaceBoundCwd")(function* (
    operation: "ReviewService.getDiffPreview" | "ReviewService.getDiffFileContents",
    cwd: string,
  ) {
    const [candidate, workspaceRoot] = yield* Effect.all([
      canonicalizePath(cwd),
      canonicalizePath(config.cwd),
    ]);
    if (
      KnownWorkspaces.isWithinRoot(path, candidate, workspaceRoot) ||
      (yield* knownWorkspaces.contains(candidate))
    ) {
      return;
    }

    return yield* new VcsRepositoryDetectionError({
      operation,
      cwd,
      detail:
        operation === "ReviewService.getDiffPreview"
          ? "Review diff preview cwd must stay within the configured workspace root."
          : "Review diff file contents cwd must stay within the configured workspace root.",
    });
  });

  // A folder of separate checkouts: each child repository's diff, with paths under its folder.
  const getNestedDiffPreview = Effect.fn("ReviewService.getNestedDiffPreview")(function* (
    input: ReviewDiffPreviewInput,
  ) {
    const repositories = yield* listNestedGitRepositories(fileSystem, path, input.cwd);
    const file = input.file;
    const target = file ? splitNestedPath(repositories, file.path) : null;
    const requested = file ? (target ? [target.repository] : []) : repositories;
    const children = yield* Effect.forEach(
      requested,
      (repository) => {
        const previous =
          file?.previousPath && target ? splitNestedPath(repositories, file.previousPath) : null;
        return git
          .getReviewDiffPreview({
            cwd: path.join(input.cwd, repository),
            ...(input.ignoreWhitespace === undefined
              ? {}
              : { ignoreWhitespace: input.ignoreWhitespace }),
            ...(file && target
              ? {
                  file: {
                    path: target.path,
                    previousPath: previous?.repository === repository ? previous.path : null,
                    sourceKind: file.sourceKind,
                  },
                }
              : {}),
          })
          .pipe(
            Effect.map((result) => ({ repository, result })),
            Effect.orElseSucceed(() => null),
          );
      },
      { concurrency: 4 },
    );
    const succeeded = children.filter((child) => child !== null);
    const sources = yield* Effect.forEach(
      succeeded.length === 0 ? [] : mergeNestedReviewSources(succeeded),
      (source) =>
        crypto
          .digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify([source.diff, source.files ?? []])),
          )
          .pipe(
            Effect.map((digest) => ({ ...source, diffHash: Hex.encode(digest) })),
            Effect.mapError(
              (cause) =>
                new VcsRepositoryDetectionError({
                  operation: "ReviewService.getNestedDiffPreview",
                  cwd: input.cwd,
                  detail: "Failed to hash the nested repositories' review diff.",
                  cause,
                }),
            ),
          ),
    );
    return { cwd: input.cwd, generatedAt: yield* DateTime.now, sources };
  });

  const getNestedDiffFileContents = Effect.fn("ReviewService.getNestedDiffFileContents")(function* (
    input: ReviewDiffFileContentsInput,
  ) {
    const repositories = yield* listNestedGitRepositories(fileSystem, path, input.cwd);
    const target = splitNestedPath(repositories, input.newPath);
    const previous = splitNestedPath(repositories, input.oldPath);
    if (!target || previous?.repository !== target.repository) return null;
    const cwd = path.join(input.cwd, target.repository);
    // The merged source cannot carry one base per repository, so resolve this one's again.
    const baseRef =
      input.sourceKind === "branch-range"
        ? ((yield* git.getReviewDiffPreview({
            cwd,
            file: { path: target.path, previousPath: null, sourceKind: "branch-range" },
          })).sources.find((source) => source.kind === "branch-range")?.baseRef ?? null)
        : input.baseRef;
    return yield* git.getReviewDiffFileContents({
      ...input,
      cwd,
      baseRef,
      headRef: null,
      oldPath: previous.path,
      newPath: target.path,
    });
  });

  const getDiffPreview: ReviewService["Service"]["getDiffPreview"] = Effect.fn(
    "ReviewService.getDiffPreview",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd("ReviewService.getDiffPreview", input.cwd);

    const handle = yield* vcsRegistry.detect({ cwd: input.cwd, requestedKind: "auto" });
    if (!handle) return yield* getNestedDiffPreview(input);

    const getDriverDiffPreview = handle.driver.getDiffPreview;
    if (!getDriverDiffPreview) {
      if (handle.kind === "git") {
        return yield* git.getReviewDiffPreview(input);
      }
      return yield* new VcsUnsupportedOperationError({
        operation: "ReviewService.getDiffPreview",
        kind: handle.kind,
        detail: `The ${handle.kind} VCS driver does not support review diff previews.`,
      });
    }

    return yield* getDriverDiffPreview(input);
  });

  const getDiffFileContents: ReviewService["Service"]["getDiffFileContents"] = Effect.fn(
    "ReviewService.getDiffFileContents",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd("ReviewService.getDiffFileContents", input.cwd);

    const handle = yield* vcsRegistry.detect({ cwd: input.cwd, requestedKind: "auto" });
    if (!handle) {
      const nested = yield* getNestedDiffFileContents(input);
      if (nested) return nested;
    }
    if (handle?.kind !== "git") {
      return yield* new VcsUnsupportedOperationError({
        operation: "ReviewService.getDiffFileContents",
        kind: handle?.kind ?? "unknown",
        detail: "Unchanged diff expansion currently requires a Git repository.",
      });
    }

    return yield* git.getReviewDiffFileContents(input);
  });

  return ReviewService.of({
    getDiffPreview,
    getDiffFileContents,
  });
});

export const layer = Layer.effect(ReviewService, make);
