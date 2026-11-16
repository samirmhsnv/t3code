import {
  IssueTrackerError,
  type IssueAddCommentInput,
  type IssueComment,
  type IssueCreateInput,
  type IssueCreateResult,
  type IssueDetail,
  type IssueGetInput,
  type IssueListInput,
  type IssueListResult,
  type IssueOptions,
  type IssueOptionsInput,
  type IssueSource,
  type IssueSourceStatus,
  type IssueSummary,
  type IssueUpdateInput,
  ISSUE_SOURCE_LABELS,
} from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient } from "effect/http";

import { requireSettingsSecret } from "../secrets/settingsSecretValue.ts";
import * as ServerSettings from "../serverSettings.ts";
import { makeDeckbellTracker } from "./deckbellTracker.ts";
import type { IssueTrackerAdapter } from "./issueTrackerAdapter.ts";
import { makeTrackerSend } from "./issueTrackerHttp.ts";
import { makeLinearTracker } from "./linearTracker.ts";

function mergeIssues(
  ...lists: ReadonlyArray<ReadonlyArray<IssueSummary>>
): ReadonlyArray<IssueSummary> {
  const time = (issue: IssueSummary) => Date.parse(issue.updatedAt) || 0;
  return lists.flat().toSorted((a, b) => time(b) - time(a));
}

export class IssueTrackers extends Context.Service<
  IssueTrackers,
  {
    /** Open issues from every configured tracker; one failing leaves the rest. */
    readonly list: (input: IssueListInput) => Effect.Effect<IssueListResult>;
    readonly get: (input: IssueGetInput) => Effect.Effect<IssueDetail, IssueTrackerError>;
    /** Teams or projects, and for one of them its statuses, members and labels. */
    readonly options: (input: IssueOptionsInput) => Effect.Effect<IssueOptions, IssueTrackerError>;
    readonly update: (input: IssueUpdateInput) => Effect.Effect<void, IssueTrackerError>;
    readonly addComment: (
      input: IssueAddCommentInput,
    ) => Effect.Effect<IssueComment, IssueTrackerError>;
    readonly create: (
      input: IssueCreateInput,
    ) => Effect.Effect<IssueCreateResult, IssueTrackerError>;
  }
>()("t3/issues/IssueTrackers") {}

export const layer = Layer.effect(
  IssueTrackers,
  Effect.gen(function* () {
    const settings = yield* ServerSettings.ServerSettingsService;
    const resolver = yield* SecretResolver.SecretResolver;
    const http = yield* HttpClient.HttpClient;

    const makers: Record<IssueSource, typeof makeLinearTracker> = {
      linear: makeLinearTracker,
      deckbell: makeDeckbellTracker,
    };

    /** The source's adapter, or undefined when no key is saved for it. */
    const adapterFor = Effect.fn("IssueTrackers.adapterFor")(function* (source: IssueSource) {
      const label = ISSUE_SOURCE_LABELS[source];
      const credential = yield* settings.getSettings.pipe(
        Effect.map((current) => current.issueTrackerCredentials[source]),
        Effect.mapError(() => new IssueTrackerError({ message: "Could not read settings." })),
      );
      if (credential === "") return undefined;
      const key = yield* requireSettingsSecret(resolver, credential).pipe(
        Effect.mapError(
          () => new IssueTrackerError({ message: `Could not read the ${label} API key.` }),
        ),
      );
      return makers[source](makeTrackerSend(http, source), key.trim());
    });

    const requireAdapter = (source: IssueSource) =>
      adapterFor(source).pipe(
        Effect.filterOrFail(
          (adapter): adapter is IssueTrackerAdapter => adapter !== undefined,
          () =>
            new IssueTrackerError({
              message: `Add your ${ISSUE_SOURCE_LABELS[source]} API key in Settings first.`,
            }),
        ),
      );

    const using = <A>(
      source: IssueSource,
      run: (adapter: IssueTrackerAdapter) => Effect.Effect<A, IssueTrackerError>,
    ) =>
      requireAdapter(source).pipe(
        Effect.flatMap(run),
        Effect.tapError((error) =>
          Effect.logWarning("issue tracker request failed", { source, error: error.message }),
        ),
      );

    type Settled = {
      readonly status: IssueSourceStatus;
      readonly issues: ReadonlyArray<IssueSummary>;
    };
    const settle = (source: IssueSource, input: IssueListInput): Effect.Effect<Settled> =>
      adapterFor(source).pipe(
        Effect.flatMap((adapter): Effect.Effect<Settled, IssueTrackerError> =>
          adapter === undefined
            ? Effect.succeed({ status: { _tag: "NotConfigured" }, issues: [] })
            : adapter
                .list(input.scope ?? "assigned")
                .pipe(Effect.map((issues) => ({ status: { _tag: "Ok" }, issues }))),
        ),
        Effect.catch((error: IssueTrackerError) =>
          Effect.logWarning("issue tracker request failed", { source, error: error.message }).pipe(
            Effect.as<Settled>({ status: { _tag: "Error", message: error.message }, issues: [] }),
          ),
        ),
      );

    const list = Effect.fn("IssueTrackers.list")(function* (input: IssueListInput) {
      const [linear, deckbell] = yield* Effect.all(
        [settle("linear", input), settle("deckbell", input)],
        { concurrency: "unbounded" },
      );
      return {
        issues: mergeIssues(linear.issues, deckbell.issues),
        sources: { linear: linear.status, deckbell: deckbell.status },
      } satisfies IssueListResult;
    });

    return IssueTrackers.of({
      list,
      get: Effect.fn("IssueTrackers.get")(function* (input: IssueGetInput) {
        return yield* using(input.source, (adapter) => adapter.get(input.id));
      }),
      options: Effect.fn("IssueTrackers.options")(function* (input: IssueOptionsInput) {
        return yield* using(input.source, (adapter) => adapter.options(input.containerId));
      }),
      update: Effect.fn("IssueTrackers.update")(function* (input: IssueUpdateInput) {
        return yield* using(input.source, (adapter) => adapter.update(input.id, input.patch));
      }),
      addComment: Effect.fn("IssueTrackers.addComment")(function* (input: IssueAddCommentInput) {
        const body = input.body.trim();
        if (body === "")
          return yield* new IssueTrackerError({ message: "A comment needs some text." });
        return yield* using(input.source, (adapter) => adapter.addComment(input.id, body));
      }),
      create: Effect.fn("IssueTrackers.create")(function* (input: IssueCreateInput) {
        const title = input.title.trim();
        if (title === "")
          return yield* new IssueTrackerError({ message: "An issue needs a title." });
        return yield* using(input.source, (adapter) => adapter.create({ ...input, title }));
      }),
    });
  }),
);
