/**
 * Deckbell over its public v1 REST API with an API token. A scope is a project key (`WEB`), an
 * issue key its identifier (`WEB-42`). People are addressed by member id, agents as `agent:<id>`,
 * because Deckbell's filters and writes take those.
 */
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import {
  IssueTrackerKind,
  type IssueActor,
  type IssueCapabilities,
  type IssueComment,
  type IssueLinkedPullRequest,
  type IssueState,
  type IssueViewerPermissions,
  type StandaloneIssueTrackerDescriptor,
} from "@t3tools/contracts";
import {
  IssueTrackerError,
  type StandaloneIssueTrackerApi,
  type TrackerIssueSummary,
} from "@t3tools/source-control-core/server/IssueTracker";
import * as IssueTrackerHost from "@t3tools/source-control-core/server/IssueTrackerHost";

const KIND = IssueTrackerKind.make("deckbell");
const APP_HOST = "app.deckbell.com";

const DeckbellConfig = Config.all({
  apiUrl: Config.String("T3CODE_DECKBELL_API_URL").pipe(
    Config.withDefault("https://api.deckbell.com/api/v1"),
  ),
});

const DESCRIPTOR: StandaloneIssueTrackerDescriptor = {
  tracker: KIND,
  displayName: "Deckbell",
  host: APP_HOST,
  scopeNoun: "project",
  credential: { label: "API token", helpUrl: null },
};

const CAPABILITIES: IssueCapabilities = {
  create: true,
  edit: true,
  comment: true,
  labels: true,
  assignees: true,
  reactions: false,
  templates: false,
  linkedPullRequests: true,
  events: false,
  search: true,
};

/** Deckbell refuses what a token's role cannot do with a message, so everything is offered. */
const VIEWER_PERMISSIONS: IssueViewerPermissions = {
  setState: true,
  comment: true,
  edit: true,
  labels: true,
  assignees: true,
};

const PAGE_LIMIT = 100;
const COMMENTS_PAGE = 50;
const OPEN_CATEGORIES = "backlog,unstarted,started";
const CLOSED_CATEGORIES = ["completed", "canceled"];
const CATEGORY_ORDER = ["backlog", "unstarted", "started", "completed", "canceled"];

const Nullable = <S extends Schema.Top>(schema: S) => Schema.optionalKey(Schema.NullOr(schema));

const Pagination = Schema.Struct({ next_cursor: Nullable(Schema.String) });
const Data = <S extends Schema.Top>(data: S) => Schema.Struct({ data });
const Page = <S extends Schema.Top>(item: S) =>
  Schema.Struct({ data: Schema.Array(item), pagination: Schema.optionalKey(Pagination) });

const DeckbellUser = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  username: Schema.optionalKey(Schema.String),
  avatar: Nullable(Schema.String),
});
const DeckbellAssignee = Schema.Struct({
  type: Schema.optionalKey(Schema.String),
  id: Schema.Number,
  name: Schema.String,
});
const DeckbellState = Schema.Struct({
  id: Schema.optionalKey(Schema.Number),
  name: Schema.String,
  category: Schema.String,
  color: Nullable(Schema.String),
  position: Schema.optionalKey(Schema.Number),
});
const DeckbellLabel = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  color: Nullable(Schema.String),
  description: Nullable(Schema.String),
  archived: Schema.optionalKey(Schema.Boolean),
});
const DeckbellProject = Schema.Struct({
  id: Schema.Number,
  key: Schema.String,
  name: Schema.String,
  archived: Schema.optionalKey(Schema.Boolean),
});
const DeckbellIssue = Schema.Struct({
  id: Schema.Number,
  identifier: Schema.String,
  title: Schema.String,
  description: Nullable(Schema.String),
  url: Schema.String,
  project: Nullable(Schema.Struct({ key: Schema.String })),
  state: DeckbellState,
  assignee: Nullable(DeckbellAssignee),
  labels: Schema.optionalKey(Schema.Array(DeckbellLabel)),
  creator: Nullable(DeckbellUser),
  completed_at: Nullable(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
});
type DeckbellIssue = typeof DeckbellIssue.Type;
const DeckbellComment = Schema.Struct({
  id: Schema.Number,
  body: Schema.String,
  author: Nullable(DeckbellAssignee),
  imported_author: Nullable(Schema.Struct({ name: Nullable(Schema.String) })),
  created_at: Schema.String,
});
const DeckbellPullRequest = Schema.Struct({
  repository: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  url: Schema.String,
  state: Schema.String,
  draft: Schema.optionalKey(Schema.Boolean),
});
const DeckbellMe = Data(
  Schema.Struct({
    user: Nullable(DeckbellUser),
    token: Schema.optionalKey(
      Schema.Struct({
        projects: Nullable(
          Schema.Array(Schema.Struct({ key: Schema.String, name: Schema.String })),
        ),
      }),
    ),
  }),
);
const DeckbellProjectMembers = Data(
  Schema.Struct({
    members: Schema.Array(
      Schema.Struct({
        type: Schema.String,
        id: Schema.Number,
        name: Schema.String,
        avatar: Nullable(Schema.String),
      }),
    ),
  }),
);

const ErrorBody = Schema.Struct({ error: Schema.Struct({ message: Schema.String }) });
const decodeErrorBody = Schema.decodeUnknownOption(ErrorBody);

const fail = (
  operation: string,
  reason: IssueTrackerError["reason"],
  detail: string,
  extra: { readonly retryAt?: number; readonly cause?: unknown } = {},
) =>
  new IssueTrackerError({
    tracker: KIND,
    operation,
    reason,
    detail,
    ...(extra.retryAt === undefined ? {} : { retryAt: extra.retryAt }),
    ...(extra.cause === undefined ? {} : { cause: extra.cause }),
  });

/** A member as an actor: the id is the login, since Deckbell's filters and writes take ids. */
const memberActor = (member: {
  readonly type?: string | undefined;
  readonly id: number;
  readonly name: string;
  readonly avatar?: string | null | undefined;
}): IssueActor => ({
  ...(member.type === "agent" ? { isBot: true } : {}),
  login: member.type === "agent" ? `agent:${member.id}` : String(member.id),
  name: member.name,
  avatarUrl: member.avatar ?? null,
});

function toState(state: typeof DeckbellState.Type): IssueState {
  return CLOSED_CATEGORIES.includes(state.category)
    ? { category: "closed", name: state.name, closeReason: state.category }
    : { category: "open", name: state.name };
}

function toSummary(issue: DeckbellIssue, commentCount = 0): TrackerIssueSummary {
  return {
    key: issue.identifier,
    displayKey: issue.identifier,
    title: issue.title,
    url: issue.url,
    author: issue.creator ? memberActor(issue.creator) : null,
    state: toState(issue.state),
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.completed_at ?? null,
    assignees: issue.assignee ? [memberActor(issue.assignee)] : [],
    labels: (issue.labels ?? []).map((label) => ({ name: label.name, color: label.color ?? null })),
    commentCount,
  };
}

function toComment(comment: typeof DeckbellComment.Type): IssueComment {
  const imported = comment.imported_author?.name;
  return {
    id: String(comment.id),
    author: comment.author
      ? memberActor(comment.author)
      : imported
        ? { login: imported, name: imported, avatarUrl: null }
        : null,
    body: comment.body,
    createdAt: comment.created_at,
    url: null,
  };
}

function toLinkedPullRequest(
  pullRequest: typeof DeckbellPullRequest.Type,
): IssueLinkedPullRequest | null {
  if (pullRequest.number < 1 || !pullRequest.title.trim()) return null;
  return {
    repository: pullRequest.repository,
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.url,
    state:
      pullRequest.state === "merged"
        ? "merged"
        : pullRequest.state === "closed"
          ? "closed"
          : "open",
    isDraft: pullRequest.draft === true,
    closesIssue: false,
  };
}

/** One assignee at most, as a Deckbell issue has; logins are member ids or `agent:<id>`. */
const assigneeFields = (operation: string, assignees: ReadonlyArray<string>) => {
  const [first, ...rest] = assignees;
  if (rest.length > 0) {
    return Effect.fail(fail(operation, "failed", "A Deckbell issue has one assignee at most."));
  }
  if (first === undefined) return Effect.succeed({ assignee_id: null });
  const agent = /^agent:(\d+)$/.exec(first);
  return Effect.succeed(
    agent
      ? { agent_id: Number(agent[1]) }
      : { assignee_id: /^\d+$/.test(first) ? Number(first) : first },
  );
};

export const make: Effect.Effect<
  StandaloneIssueTrackerApi,
  never,
  HttpClient.HttpClient | IssueTrackerHost.IssueTrackerHost
> = Effect.gen(function* () {
  const config = yield* DeckbellConfig.pipe(Effect.orDie);
  const http = yield* HttpClient.HttpClient;
  const host = yield* IssueTrackerHost.IssueTrackerHost;

  const storedToken = (operation: string) =>
    host.credentials
      .get(KIND)
      .pipe(
        Effect.flatMap(
          Effect.fromOption(() =>
            fail(operation, "unauthenticated", "Deckbell is not connected on this server."),
          ),
        ),
      );

  const request = Effect.fn("DeckbellIssueTracker.request")(function* <S extends Schema.Top>(
    operation: string,
    schema: S,
    options: {
      readonly method?: "GET" | "POST" | "PATCH";
      readonly path: ReadonlyArray<string>;
      readonly params?: Record<string, string | undefined>;
      readonly body?: unknown;
      readonly token?: string;
    },
  ): Effect.fn.Return<S["Type"], IssueTrackerError, S["DecodingServices"]> {
    const token = options.token ?? (yield* storedToken(operation));
    const url = `${config.apiUrl}/${options.path.map(encodeURIComponent).join("/")}`;
    const params = Object.fromEntries(
      Object.entries(options.params ?? {}).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    const base = HttpClientRequest.make(options.method ?? "GET")(url).pipe(
      HttpClientRequest.setUrlParams(params),
      HttpClientRequest.acceptJson,
      HttpClientRequest.bearerToken(Redacted.make(token)),
    );
    const response = yield* http
      .execute(
        options.body === undefined ? base : HttpClientRequest.bodyJsonUnsafe(base, options.body),
      )
      .pipe(
        // A redirect could carry the token to another origin.
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
        Effect.provideService(HttpClient.TracerPropagationEnabled, false),
        Effect.mapError((cause) =>
          fail(operation, "failed", "Deckbell could not be reached.", { cause }),
        ),
      );
    const body = yield* response.json.pipe(Effect.orElseSucceed((): unknown => undefined));
    if (response.status < 200 || response.status >= 300) {
      const message = decodeErrorBody(body).pipe(
        Option.map((decoded) => decoded.error.message),
        Option.getOrUndefined,
      );
      if (response.status === 401) {
        return yield* fail(operation, "unauthenticated", "Deckbell rejected the API token.");
      }
      if (response.status === 404) {
        return yield* fail(
          operation,
          "not-found",
          message ?? "Deckbell has nothing there, or this token cannot see it.",
        );
      }
      if (response.status === 429) {
        const retryAfter = Number(response.headers["retry-after"]);
        const now = yield* Clock.currentTimeMillis;
        return yield* fail(
          operation,
          "rate-limited",
          "Deckbell's rate limit was reached.",
          Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAt: now + retryAfter * 1000 } : {},
        );
      }
      return yield* fail(
        operation,
        "failed",
        message ?? `Deckbell answered with HTTP ${response.status}.`,
      );
    }
    return yield* Schema.decodeUnknownEffect(schema)(body).pipe(
      Effect.mapError((cause) =>
        fail(operation, "failed", "Deckbell sent a response T3 Code does not understand.", {
          cause,
        }),
      ),
    );
  });

  const me = (operation: string, token?: string) =>
    request(operation, DeckbellMe, {
      path: ["me"],
      ...(token === undefined ? {} : { token }),
    }).pipe(Effect.map(({ data }) => data));

  /** The issue a write names, refused unless it sits in the bound project. */
  const requireProjectIssue = Effect.fn("DeckbellIssueTracker.requireProjectIssue")(function* (
    operation: string,
    input: { readonly scope: string; readonly key: string },
  ) {
    const { data: issue } = yield* request(operation, Data(DeckbellIssue), {
      path: ["issues", input.key],
    });
    const project = input.scope.trim().toUpperCase();
    if (issue.project && issue.project.key.toUpperCase() !== project) {
      return yield* fail(
        operation,
        "failed",
        `${issue.identifier} belongs to Deckbell project ${issue.project.key}, not ${project}.`,
      );
    }
    return issue;
  });

  const commentsPage = (key: string, cursor?: string) =>
    request("getComments", Page(DeckbellComment), {
      path: ["issues", key, "comments"],
      params: { limit: String(COMMENTS_PAGE), cursor },
    }).pipe(
      Effect.map((page) => ({
        comments: page.data.map(toComment),
        nextCursor: page.pagination?.next_cursor || null,
      })),
    );

  const api: StandaloneIssueTrackerApi = {
    kind: KIND,
    capabilities: CAPABILITIES,
    standalone: DESCRIPTOR,

    // https://app.deckbell.com/projects/WEB-42/issues/<title>: tokens are per workspace, so one.
    parseIssueUrl: (url) => {
      if (url.protocol !== "https:" || url.host.toLowerCase() !== APP_HOST) return null;
      const [, resource, key] = url.pathname.split("/");
      const match = key === undefined ? null : /^([A-Za-z][A-Za-z0-9]*)-[1-9]\d*$/.exec(key);
      if (resource !== "projects" || match === null || key === undefined) return null;
      return {
        host: APP_HOST,
        workspace: "deckbell",
        scope: match[1]!.toUpperCase(),
        key: key.toUpperCase(),
      };
    },

    probeCredential: Effect.fn("DeckbellIssueTracker.probeCredential")(function* (token) {
      const identity = yield* me("probeCredential", token);
      const projects =
        identity.token?.projects ??
        (yield* request("probeCredential", Page(DeckbellProject), {
          path: ["projects"],
          params: { limit: String(PAGE_LIMIT) },
          token,
        }).pipe(Effect.map((page) => page.data.filter((project) => project.archived !== true))));
      return {
        account: identity.user?.name ?? "Deckbell API token",
        scopes: projects.map((project) => ({ key: project.key, name: project.name })),
      };
    }),

    getViewer: () =>
      me("getViewer").pipe(
        Effect.flatMap((identity) =>
          identity.user
            ? Effect.succeed(String(identity.user.id))
            : Effect.fail(fail("getViewer", "failed", "This Deckbell token acts as no member.")),
        ),
      ),

    listIssues: (input) =>
      request("listIssues", Page(DeckbellIssue), {
        path: ["issues"],
        params: {
          project: input.scope,
          state_category:
            input.state === "open"
              ? OPEN_CATEGORIES
              : input.state === "closed"
                ? CLOSED_CATEGORIES.join(",")
                : undefined,
          // Deckbell reads `me` as the token's owner, so the viewer id is not needed here.
          ...(input.involvement === "assigned" ? { assignee: "me" } : {}),
          ...(input.involvement === "authored" ? { creator: "me" } : {}),
          ...(input.involvement === "mentioned" ? { mentioned: "me" } : {}),
          ...(input.assignee === undefined ? {} : { assignee: input.assignee }),
          ...(input.labels === undefined || input.labels.length === 0
            ? {}
            : { label: input.labels.join(","), label_mode: "all" }),
          q: input.query?.trim() || undefined,
          order_by: input.sort === "created" ? "created_at" : "updated_at",
          limit: String(Math.min(PAGE_LIMIT, Math.max(1, input.limit))),
          cursor: input.cursor,
        },
      }).pipe(
        Effect.map((page) => ({
          items: page.data.map((issue) => toSummary(issue)),
          nextCursor: page.pagination?.next_cursor || null,
        })),
      ),

    getIssue: Effect.fn("DeckbellIssueTracker.getIssue")(function* (input) {
      const issue = yield* requireProjectIssue("getIssue", input);
      const projectKey = issue.project?.key ?? input.scope;
      const [comments, states, pullRequests, viewer] = yield* Effect.all(
        [
          commentsPage(issue.identifier),
          request("getIssue", Data(Schema.Array(DeckbellState)), {
            path: ["projects", projectKey, "states"],
          }).pipe(
            Effect.map(({ data }) =>
              data.toSorted(
                (a, b) =>
                  CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
                  (a.position ?? 0) - (b.position ?? 0),
              ),
            ),
          ),
          request("getIssue", Data(Schema.Array(DeckbellPullRequest)), {
            path: ["issues", issue.identifier, "pull-requests"],
          }).pipe(
            Effect.map(({ data }) => data.flatMap((pr) => toLinkedPullRequest(pr) ?? [])),
            Effect.orElseSucceed((): IssueLinkedPullRequest[] => []),
          ),
          me("getIssue").pipe(
            Effect.map((identity) => (identity.user ? String(identity.user.id) : null)),
            Effect.orElseSucceed(() => null),
          ),
        ],
        { concurrency: "unbounded" },
      );
      return {
        ...toSummary(issue, comments.comments.length),
        body: issue.description ?? "",
        viewer,
        viewerPermissions: VIEWER_PERMISSIONS,
        states: states.map(toState),
        comments: comments.comments,
        commentsCursor: comments.nextCursor,
        events: [],
        linkedPullRequests: pullRequests,
      };
    }),

    getComments: (input) => commentsPage(input.key, input.cursor),

    create: Effect.fn("DeckbellIssueTracker.create")(function* (input) {
      const assignee =
        input.assignees.length === 0 ? {} : yield* assigneeFields("create", input.assignees);
      const { data } = yield* request("create", Data(DeckbellIssue), {
        method: "POST",
        path: ["issues"],
        body: {
          project: input.scope,
          title: input.title,
          ...(input.body ? { description: input.body } : {}),
          ...(input.labels.length === 0 ? {} : { labels: input.labels }),
          ...assignee,
        },
      });
      return { key: data.identifier, displayKey: data.identifier, url: data.url };
    }),

    comment: Effect.fn("DeckbellIssueTracker.comment")(function* (input) {
      const issue = yield* requireProjectIssue("comment", input);
      yield* request("comment", Schema.Unknown, {
        method: "POST",
        path: ["issues", issue.identifier, "comments"],
        body: { body: input.body },
      });
    }),

    update: Effect.fn("DeckbellIssueTracker.update")(function* (input) {
      const issue = yield* requireProjectIssue("update", input);
      const assignee =
        input.assignees === undefined ? {} : yield* assigneeFields("update", input.assignees);
      yield* request("update", Schema.Unknown, {
        method: "PATCH",
        path: ["issues", issue.identifier],
        body: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.body === undefined ? {} : { description: input.body }),
          ...(input.labels === undefined ? {} : { labels: input.labels }),
          ...assignee,
        },
      });
    }),

    setState: Effect.fn("DeckbellIssueTracker.setState")(function* (input) {
      const issue = yield* requireProjectIssue("setState", input);
      yield* request("setState", Schema.Unknown, {
        method: "PATCH",
        path: ["issues", issue.identifier],
        body: { state: input.state },
      });
    }),

    listCandidates: Effect.fn("DeckbellIssueTracker.listCandidates")(function* (input) {
      const [labels, members] = yield* Effect.all(
        [
          request("listCandidates", Data(Schema.Array(DeckbellLabel)), {
            path: ["projects", input.scope, "labels"],
          }),
          request("listCandidates", DeckbellProjectMembers, {
            path: ["projects", input.scope, "members"],
          }),
        ],
        { concurrency: "unbounded" },
      );
      return {
        labels: labels.data
          .filter((label) => label.archived !== true)
          .map((label) => ({
            name: label.name,
            color: label.color ?? null,
            description: label.description ?? null,
          })),
        assignees: members.data.members
          .filter((member) => member.type === "user")
          .map((member) => ({ ...memberActor(member), id: String(member.id) })),
        truncated: false,
      };
    }),
  };
  return api;
});
