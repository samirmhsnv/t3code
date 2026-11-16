import {
  IssuePriority,
  IssueStatusCategory,
  type IssueListResult,
  type IssueSource,
  type IssueSourceStatus,
  type IssueSummary,
  ISSUE_SOURCE_LABELS,
} from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { requireSettingsSecret } from "../secrets/settingsSecretValue.ts";
import * as ServerSettings from "../serverSettings.ts";

const LINEAR_URL = "https://api.linear.app/graphql";
const DECKBELL_URL = "https://api.deckbell.com/api/v1/issues";
const LINEAR_QUERY = `query AssignedIssues {
  viewer {
    assignedIssues(
      first: 100
      filter: { state: { type: { nin: ["completed", "canceled"] } } }
      orderBy: updatedAt
    ) {
      nodes { id identifier title url priority updatedAt state { name type color } team { key } }
    }
  }
}`;

const LinearResponse = Schema.Struct({
  data: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        viewer: Schema.Struct({
          assignedIssues: Schema.Struct({
            nodes: Schema.Array(
              Schema.Struct({
                id: Schema.String,
                identifier: Schema.String,
                title: Schema.String,
                url: Schema.String,
                priority: Schema.Number,
                updatedAt: Schema.String,
                state: Schema.Struct({
                  name: Schema.String,
                  type: Schema.String,
                  color: Schema.String,
                }),
                team: Schema.optionalKey(Schema.NullOr(Schema.Struct({ key: Schema.String }))),
              }),
            ),
          }),
        }),
      }),
    ),
  ),
  errors: Schema.optionalKey(Schema.Array(Schema.Struct({ message: Schema.String }))),
});
type LinearResponse = typeof LinearResponse.Type;

const DeckbellResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      identifier: Schema.String,
      title: Schema.String,
      url: Schema.String,
      priority: Schema.String,
      updated_at: Schema.String,
      project: Schema.optionalKey(Schema.NullOr(Schema.Struct({ key: Schema.String }))),
      state: Schema.Struct({
        name: Schema.String,
        category: Schema.String,
        color: Schema.optionalKey(Schema.NullOr(Schema.String)),
      }),
    }),
  ),
});
type DeckbellResponse = typeof DeckbellResponse.Type;

class IssueSourceError extends Schema.TaggedError<IssueSourceError>()("IssueSourceError", {
  message: Schema.String,
}) {}

const isCategory = Schema.is(IssueStatusCategory);
const isPriority = Schema.is(IssuePriority);
const LINEAR_PRIORITIES = ["none", "urgent", "high", "medium", "low"] as const;
const OPEN = new Set(["triage", "backlog", "unstarted", "started"]);

const category = (value: string) => (isCategory(value) ? value : "unstarted");

function linearIssues(response: LinearResponse): ReadonlyArray<IssueSummary> {
  return (response.data?.viewer.assignedIssues.nodes ?? []).map((issue) => ({
    source: "linear",
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    status: {
      name: issue.state.name,
      category: category(issue.state.type),
      color: issue.state.color,
    },
    priority: LINEAR_PRIORITIES[issue.priority] ?? "none",
    ...(issue.team ? { projectKey: issue.team.key } : {}),
    updatedAt: issue.updatedAt,
  }));
}

function deckbellIssues(response: DeckbellResponse): ReadonlyArray<IssueSummary> {
  return response.data
    .filter((issue) => OPEN.has(issue.state.category))
    .map((issue) => ({
      source: "deckbell",
      id: String(issue.id),
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      status: {
        name: issue.state.name,
        category: category(issue.state.category),
        ...(issue.state.color ? { color: issue.state.color } : {}),
      },
      priority: isPriority(issue.priority) ? issue.priority : "none",
      ...(issue.project ? { projectKey: issue.project.key } : {}),
      updatedAt: issue.updated_at,
    }));
}

function mergeIssues(
  ...lists: ReadonlyArray<ReadonlyArray<IssueSummary>>
): ReadonlyArray<IssueSummary> {
  const time = (issue: IssueSummary) => Date.parse(issue.updatedAt) || 0;
  return lists.flat().toSorted((a, b) => time(b) - time(a));
}

export class IssueTrackers extends Context.Service<
  IssueTrackers,
  {
    /** The viewer's open assigned issues from every configured tracker; one failing leaves the rest. */
    readonly list: Effect.Effect<IssueListResult>;
  }
>()("t3/issues/IssueTrackers") {}

export const layer = Layer.effect(
  IssueTrackers,
  Effect.gen(function* () {
    const settings = yield* ServerSettings.ServerSettingsService;
    const resolver = yield* SecretResolver.SecretResolver;
    const http = yield* HttpClient.HttpClient;

    const unreadable = (source: IssueSource) =>
      new IssueSourceError({
        message: `${ISSUE_SOURCE_LABELS[source]} sent a response T3 Code does not understand.`,
      });
    const fetchResponse = (source: IssueSource, request: HttpClientRequest.HttpClientRequest) => {
      const label = ISSUE_SOURCE_LABELS[source];
      const fail = (message: string) => new IssueSourceError({ message });
      return Effect.gen(function* () {
        const response = yield* http.execute(request).pipe(
          Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.mapError(() => fail(`Could not reach ${label}.`)),
        );
        if (response.status === 401 || response.status === 403)
          return yield* fail(`${label} rejected the API key.`);
        if (response.status === 429) return yield* fail(`${label} is rate limiting requests.`);
        // Linear reports query errors as a 400 with a GraphQL error body.
        if ((response.status < 200 || response.status >= 300) && response.status !== 400)
          return yield* fail(`${label} answered with HTTP ${response.status}.`);
        return response;
      });
    };
    const withTimeout = <A>(
      source: IssueSource,
      effect: Effect.Effect<A, IssueSourceError>,
    ): Effect.Effect<A, IssueSourceError> =>
      effect.pipe(
        Effect.timeoutOrElse({
          duration: "15 seconds",
          orElse: () =>
            Effect.fail(
              new IssueSourceError({
                message: `${ISSUE_SOURCE_LABELS[source]} did not answer in time.`,
              }),
            ),
        }),
      );

    const fetchers: Record<
      IssueSource,
      (key: string) => Effect.Effect<ReadonlyArray<IssueSummary>, IssueSourceError>
    > = {
      linear: (key) =>
        withTimeout(
          "linear",
          fetchResponse(
            "linear",
            HttpClientRequest.post(LINEAR_URL).pipe(
              // Linear personal API keys go without the Bearer prefix.
              HttpClientRequest.setHeader("Authorization", key),
              HttpClientRequest.bodyJsonUnsafe({ query: LINEAR_QUERY }),
            ),
          ).pipe(
            Effect.flatMap((response) =>
              HttpClientResponse.schemaBodyJson(LinearResponse)(response).pipe(
                Effect.mapError(() => unreadable("linear")),
              ),
            ),
          ),
        ).pipe(
          Effect.flatMap((response) =>
            response.errors?.length && !response.data
              ? Effect.fail(
                  new IssueSourceError({ message: `Linear: ${response.errors[0]!.message}` }),
                )
              : Effect.succeed(linearIssues(response)),
          ),
        ),
      deckbell: (key) =>
        withTimeout(
          "deckbell",
          fetchResponse(
            "deckbell",
            HttpClientRequest.get(DECKBELL_URL).pipe(
              HttpClientRequest.setUrlParams({
                assignee: "me",
                state_category: "backlog,unstarted,started",
                sort: "-updated_at",
                limit: "100",
              }),
              HttpClientRequest.bearerToken(Redacted.make(key)),
            ),
          ).pipe(
            Effect.flatMap((response) =>
              HttpClientResponse.schemaBodyJson(DeckbellResponse)(response).pipe(
                Effect.mapError(() => unreadable("deckbell")),
              ),
            ),
          ),
        ).pipe(Effect.map(deckbellIssues)),
    };

    const fetchSource = Effect.fn("IssueTrackers.fetchSource")(function* (source: IssueSource) {
      const label = ISSUE_SOURCE_LABELS[source];
      const credential = yield* settings.getSettings.pipe(
        Effect.map((current) => current.issueTrackerCredentials[source]),
        Effect.mapError(() => new IssueSourceError({ message: "Could not read settings." })),
      );
      if (credential === "") return { status: { _tag: "NotConfigured" } as const, issues: [] };
      const key = yield* requireSettingsSecret(resolver, credential).pipe(
        Effect.mapError(
          () => new IssueSourceError({ message: `Could not read the ${label} API key.` }),
        ),
      );
      const issues = yield* fetchers[source](key.trim());
      return { status: { _tag: "Ok" } as const, issues };
    });

    const settle = (source: IssueSource) =>
      fetchSource(source).pipe(
        Effect.catch((error: IssueSourceError) =>
          Effect.logWarning("issue tracker request failed", { source, error: error.message }).pipe(
            Effect.as({
              status: { _tag: "Error", message: error.message } satisfies IssueSourceStatus,
              issues: [] as ReadonlyArray<IssueSummary>,
            }),
          ),
        ),
      );

    const list = Effect.gen(function* () {
      const [linear, deckbell] = yield* Effect.all([settle("linear"), settle("deckbell")], {
        concurrency: "unbounded",
      });
      return {
        issues: mergeIssues(linear.issues, deckbell.issues),
        sources: { linear: linear.status, deckbell: deckbell.status },
      } satisfies IssueListResult;
    }).pipe(Effect.withSpan("IssueTrackers.list"));

    return IssueTrackers.of({ list });
  }),
);
