import {
  IssuePriority,
  IssueStatusCategory,
  type IssueComment,
  type IssueDetail,
  type IssueLabel,
  type IssuePerson,
  type IssueStatus,
  type IssueSummary,
  type IssueUpdatePatch,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { HttpClientRequest } from "effect/http";

import type { IssueTrackerAdapter } from "./issueTrackerAdapter.ts";
import type { TrackerSend } from "./issueTrackerHttp.ts";

const DECKBELL_URL = "https://api.deckbell.com/api/v1";
const OPEN_CATEGORIES = new Set(["triage", "backlog", "unstarted", "started"]);

const Nullable = <S extends Schema.Top>(schema: S) => Schema.optionalKey(Schema.NullOr(schema));
const Data = <S extends Schema.Top>(data: S) => Schema.Struct({ data });

const DeckbellPerson = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  avatar: Nullable(Schema.String),
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
});
const DeckbellProject = Schema.Struct({
  id: Schema.Number,
  key: Schema.String,
  name: Schema.String,
});
const DeckbellIssue = Schema.Struct({
  id: Schema.Number,
  identifier: Schema.String,
  title: Schema.String,
  url: Schema.String,
  priority: Schema.String,
  updated_at: Schema.String,
  project: Nullable(DeckbellProject),
  state: DeckbellState,
  assignee: Nullable(DeckbellPerson),
  labels: Schema.optionalKey(Schema.Array(DeckbellLabel)),
});
const DeckbellIssueDetail = Schema.Struct({
  ...DeckbellIssue.fields,
  description: Nullable(Schema.String),
  created_at: Schema.String,
  creator: Nullable(DeckbellPerson),
});
const DeckbellComment = Schema.Struct({
  id: Schema.Number,
  body: Schema.String,
  author: Nullable(DeckbellPerson),
  imported_author: Nullable(Schema.Struct({ name: Nullable(Schema.String) })),
  created_at: Schema.String,
});
const DeckbellProjectMembers = Schema.Struct({
  members: Schema.Array(
    Schema.Struct({
      type: Schema.String,
      id: Schema.Number,
      name: Schema.String,
      avatar: Nullable(Schema.String),
    }),
  ),
});

const isCategory = Schema.is(IssueStatusCategory);
const isPriority = Schema.is(IssuePriority);

const person = (value: typeof DeckbellPerson.Type | null | undefined): IssuePerson | undefined =>
  value
    ? {
        id: String(value.id),
        name: value.name,
        ...(value.avatar ? { avatarUrl: value.avatar } : {}),
      }
    : undefined;

const status = (state: typeof DeckbellState.Type): IssueStatus => ({
  ...(state.id === undefined ? {} : { id: String(state.id) }),
  name: state.name,
  category: isCategory(state.category) ? state.category : "unstarted",
  ...(state.color ? { color: state.color } : {}),
  ...(state.position === undefined ? {} : { position: state.position }),
});

const label = (value: typeof DeckbellLabel.Type): IssueLabel => ({
  id: String(value.id),
  name: value.name,
  ...(value.color ? { color: value.color } : {}),
});

function deckbellSummary(issue: typeof DeckbellIssue.Type): IssueSummary {
  const assignee = person(issue.assignee);
  return {
    source: "deckbell",
    id: String(issue.id),
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    status: status(issue.state),
    priority: isPriority(issue.priority) ? issue.priority : "none",
    labels: (issue.labels ?? []).map(label),
    ...(assignee ? { assignee } : {}),
    ...(issue.project
      ? {
          container: {
            id: String(issue.project.id),
            key: issue.project.key,
            name: issue.project.name,
          },
        }
      : {}),
    updatedAt: issue.updated_at,
  };
}

const deckbellComment = (comment: typeof DeckbellComment.Type): IssueComment => {
  const author =
    person(comment.author) ??
    (comment.imported_author?.name
      ? { id: `imported:${comment.imported_author.name}`, name: comment.imported_author.name }
      : undefined);
  return {
    id: String(comment.id),
    body: comment.body,
    ...(author ? { author } : {}),
    createdAt: comment.created_at,
  };
};

/** Deckbell takes member and label ids as numbers, and a status as its name or id string. */
const numericId = (id: string) => (/^\d+$/.test(id) ? Number(id) : id);

const issueFields = (patch: IssueUpdatePatch) => ({
  ...(patch.title === undefined ? {} : { title: patch.title }),
  ...(patch.description === undefined ? {} : { description: patch.description }),
  ...(patch.statusId === undefined ? {} : { state: patch.statusId }),
  ...(patch.priority === undefined ? {} : { priority: patch.priority }),
  ...(patch.assigneeId === undefined
    ? {}
    : { assignee_id: patch.assigneeId === null ? null : numericId(patch.assigneeId) }),
  ...(patch.labelIds === undefined ? {} : { labels: patch.labelIds.map(numericId) }),
});

export function makeDeckbellTracker(send: TrackerSend, key: string): IssueTrackerAdapter {
  const authorize = HttpClientRequest.bearerToken(Redacted.make(key));
  const path = (...segments: ReadonlyArray<string>) =>
    `${DECKBELL_URL}/${segments.map(encodeURIComponent).join("/")}`;
  const get = <S extends Schema.Top>(url: string, schema: S, params?: Record<string, string>) =>
    send(
      HttpClientRequest.get(url).pipe(
        HttpClientRequest.setUrlParams(params ?? {}),
        HttpClientRequest.acceptJson,
        authorize,
      ),
      schema,
    );
  const write = <S extends Schema.Top>(
    method: "POST" | "PATCH",
    url: string,
    body: unknown,
    schema: S,
  ) =>
    send(
      HttpClientRequest.make(method)(url).pipe(
        HttpClientRequest.bodyJsonUnsafe(body),
        HttpClientRequest.acceptJson,
        authorize,
      ),
      schema,
    );

  return {
    list: (scope) =>
      get(path("issues"), Data(Schema.Array(DeckbellIssue)), {
        ...(scope === "assigned" ? { assignee: "me" } : {}),
        state_category: "backlog,unstarted,started",
        sort: "-updated_at",
        limit: "100",
      }).pipe(
        Effect.map(({ data }) =>
          data.filter((issue) => OPEN_CATEGORIES.has(issue.state.category)).map(deckbellSummary),
        ),
      ),

    get: (id) =>
      Effect.all(
        [
          get(path("issues", id), Data(DeckbellIssueDetail)),
          get(path("issues", id, "comments"), Data(Schema.Array(DeckbellComment)), {
            limit: "100",
          }),
        ],
        { concurrency: "unbounded" },
      ).pipe(
        Effect.map(([{ data: issue }, { data: comments }]): IssueDetail => {
          const creator = person(issue.creator);
          return {
            ...deckbellSummary(issue),
            description: issue.description ?? "",
            ...(creator ? { creator } : {}),
            createdAt: issue.created_at,
            comments: comments.map(deckbellComment),
          };
        }),
      ),

    options: (containerId) => {
      const containers = get(path("projects"), Data(Schema.Array(DeckbellProject)), {
        limit: "100",
      }).pipe(
        Effect.map(({ data }) =>
          data.map((project) => ({ id: String(project.id), key: project.key, name: project.name })),
        ),
      );
      if (containerId === undefined)
        return containers.pipe(
          Effect.map((list) => ({ containers: list, statuses: [], members: [], labels: [] })),
        );
      // Labels and members need scopes a key made for issues alone may lack; pickers do without.
      return Effect.all(
        {
          containers,
          statuses: get(
            path("projects", containerId, "states"),
            Data(Schema.Array(DeckbellState)),
          ).pipe(Effect.map(({ data }) => data.map(status))),
          labels: get(
            path("projects", containerId, "labels"),
            Data(Schema.Array(DeckbellLabel)),
          ).pipe(
            Effect.map(({ data }) => data.map(label)),
            Effect.orElseSucceed(() => []),
          ),
          members: get(path("projects", containerId, "members"), Data(DeckbellProjectMembers)).pipe(
            Effect.map(({ data }) =>
              data.members
                .filter((member) => member.type === "user")
                .flatMap((member) => person(member) ?? []),
            ),
            Effect.orElseSucceed(() => []),
          ),
        },
        { concurrency: "unbounded" },
      );
    },

    update: (id, patch) =>
      write("PATCH", path("issues", id), issueFields(patch), Schema.Unknown).pipe(Effect.asVoid),

    addComment: (id, body) =>
      write("POST", path("issues", id, "comments"), { body }, Data(DeckbellComment)).pipe(
        Effect.map(({ data }) => deckbellComment(data)),
      ),

    create: (input) =>
      write(
        "POST",
        path("issues"),
        {
          project: input.containerId,
          ...issueFields({
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            ...(input.priority === undefined ? {} : { priority: input.priority }),
            ...(input.statusId === undefined ? {} : { statusId: input.statusId }),
            ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }),
            ...(input.labelIds === undefined ? {} : { labelIds: input.labelIds }),
          }),
        },
        Data(DeckbellIssue),
      ).pipe(
        Effect.map(({ data }) => ({
          source: "deckbell" as const,
          id: String(data.id),
          identifier: data.identifier,
          url: data.url,
        })),
      ),
  };
}
