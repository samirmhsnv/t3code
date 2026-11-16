import {
  IssueStatusCategory,
  IssueTrackerError,
  type IssueComment,
  type IssueDetail,
  type IssueListScope,
  type IssueOptions,
  type IssuePerson,
  type IssuePriority,
  type IssueSummary,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClientRequest } from "effect/http";

import type { TrackerSend } from "./issueTrackerHttp.ts";
import type { IssueTrackerAdapter } from "./issueTrackerAdapter.ts";

const LINEAR_URL = "https://api.linear.app/graphql";
const LINEAR_PRIORITIES = ["none", "urgent", "high", "medium", "low"] as const;
const OPEN_FILTER = `filter: { state: { type: { nin: ["completed", "canceled"] } } }`;
const ISSUE_FIELDS = `id identifier title url priority updatedAt
  state { id name type color position }
  team { id key name }
  assignee { id name avatarUrl }
  labels { nodes { id name color } }`;
const PERSON = `{ id name avatarUrl }`;

const ASSIGNED_QUERY = `query AssignedIssues {
  viewer { assignedIssues(first: 100, ${OPEN_FILTER}, orderBy: updatedAt) { nodes { ${ISSUE_FIELDS} } } }
}`;
const ALL_QUERY = `query OpenIssues {
  issues(first: 100, ${OPEN_FILTER}, orderBy: updatedAt) { nodes { ${ISSUE_FIELDS} } }
}`;
const ISSUE_QUERY = `query Issue($id: String!) {
  issue(id: $id) {
    ${ISSUE_FIELDS}
    description createdAt
    creator ${PERSON}
    project { name }
    comments(first: 100) { nodes { id body createdAt user ${PERSON} } }
  }
}`;
const TEAMS_QUERY = `query Teams { teams(first: 100) { nodes { id key name } } }`;
// Labels are per team or workspace-wide; `team: { null: true }` adds the workspace ones.
const OPTIONS_QUERY = `query Options($teamId: String!, $labelTeamId: ID!) {
  teams(first: 100) { nodes { id key name } }
  team(id: $teamId) {
    states { nodes { id name type color position } }
    members(first: 250) { nodes { id name avatarUrl active } }
  }
  issueLabels(first: 250, filter: { or: [{ team: { id: { eq: $labelTeamId } } }, { team: { null: true } }] }) {
    nodes { id name color }
  }
}`;
const UPDATE_MUTATION = `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}`;
const COMMENT_MUTATION = `mutation AddComment($input: CommentCreateInput!) {
  commentCreate(input: $input) { success comment { id body createdAt user ${PERSON} } }
}`;
const CREATE_MUTATION = `mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url } }
}`;

const Nullable = <S extends Schema.Top>(schema: S) => Schema.optionalKey(Schema.NullOr(schema));
const Connection = <S extends Schema.Top>(node: S) => Schema.Struct({ nodes: Schema.Array(node) });

const LinearPerson = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  avatarUrl: Nullable(Schema.String),
});
const LinearState = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  color: Schema.String,
  position: Schema.optionalKey(Schema.Number),
});
const LinearLabel = Schema.Struct({ id: Schema.String, name: Schema.String, color: Schema.String });
const LinearTeam = Schema.Struct({ id: Schema.String, key: Schema.String, name: Schema.String });
const LinearIssue = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  url: Schema.String,
  priority: Schema.Number,
  updatedAt: Schema.String,
  state: LinearState,
  team: Nullable(LinearTeam),
  assignee: Nullable(LinearPerson),
  labels: Schema.optionalKey(Connection(LinearLabel)),
});
const LinearComment = Schema.Struct({
  id: Schema.String,
  body: Schema.String,
  createdAt: Schema.String,
  user: Nullable(LinearPerson),
});
const LinearIssueDetail = Schema.Struct({
  ...LinearIssue.fields,
  description: Nullable(Schema.String),
  createdAt: Schema.String,
  creator: Nullable(LinearPerson),
  project: Nullable(Schema.Struct({ name: Schema.String })),
  comments: Connection(LinearComment),
});

const isCategory = Schema.is(IssueStatusCategory);
const category = (value: string) => (isCategory(value) ? value : "unstarted");

const person = (value: typeof LinearPerson.Type | null | undefined): IssuePerson | undefined =>
  value
    ? { id: value.id, name: value.name, ...(value.avatarUrl ? { avatarUrl: value.avatarUrl } : {}) }
    : undefined;

const status = (state: typeof LinearState.Type) => ({
  id: state.id,
  name: state.name,
  category: category(state.type),
  color: state.color,
  ...(state.position === undefined ? {} : { position: state.position }),
});

function linearSummary(issue: typeof LinearIssue.Type): IssueSummary {
  const assignee = person(issue.assignee);
  return {
    source: "linear",
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    status: status(issue.state),
    priority: LINEAR_PRIORITIES[issue.priority] ?? "none",
    labels: (issue.labels?.nodes ?? []).map((label) => ({ ...label })),
    ...(assignee ? { assignee } : {}),
    ...(issue.team ? { container: { ...issue.team } } : {}),
    updatedAt: issue.updatedAt,
  };
}

const linearComment = (comment: typeof LinearComment.Type): IssueComment => {
  const author = person(comment.user);
  return {
    id: comment.id,
    body: comment.body,
    ...(author ? { author } : {}),
    createdAt: comment.createdAt,
  };
};

const priorityNumber = (priority: IssuePriority) => LINEAR_PRIORITIES.indexOf(priority);

export function makeLinearTracker(send: TrackerSend, key: string): IssueTrackerAdapter {
  const graphql = <S extends Schema.Top>(
    query: string,
    variables: Record<string, unknown>,
    data: S,
  ) =>
    send(
      HttpClientRequest.post(LINEAR_URL).pipe(
        // Linear personal API keys go without the Bearer prefix.
        HttpClientRequest.setHeader("Authorization", key),
        HttpClientRequest.bodyJsonUnsafe({ query, variables }),
      ),
      Schema.Struct({
        data: Nullable(data),
        errors: Schema.optionalKey(Schema.Array(Schema.Struct({ message: Schema.String }))),
      }),
    ).pipe(
      Effect.flatMap((response) =>
        response.data === undefined || response.data === null
          ? Effect.fail(
              new IssueTrackerError({
                message: `Linear: ${response.errors?.[0]?.message ?? "the request failed."}`,
              }),
            )
          : Effect.succeed(response.data),
      ),
    );

  const succeeded = (ok: boolean, what: string) =>
    ok ? Effect.void : Effect.fail(new IssueTrackerError({ message: `Linear could not ${what}.` }));

  return {
    list: (scope: IssueListScope) =>
      scope === "all"
        ? graphql(ALL_QUERY, {}, Schema.Struct({ issues: Connection(LinearIssue) })).pipe(
            Effect.map((data) => data.issues.nodes.map(linearSummary)),
          )
        : graphql(
            ASSIGNED_QUERY,
            {},
            Schema.Struct({
              viewer: Schema.Struct({ assignedIssues: Connection(LinearIssue) }),
            }),
          ).pipe(Effect.map((data) => data.viewer.assignedIssues.nodes.map(linearSummary))),

    get: (id) =>
      graphql(ISSUE_QUERY, { id }, Schema.Struct({ issue: Nullable(LinearIssueDetail) })).pipe(
        Effect.flatMap(({ issue }) =>
          issue
            ? Effect.succeed(issue)
            : Effect.fail(new IssueTrackerError({ message: "Linear has no such issue." })),
        ),
        Effect.map((issue): IssueDetail => {
          const creator = person(issue.creator);
          return {
            ...linearSummary(issue),
            description: issue.description ?? "",
            ...(issue.project ? { project: issue.project.name } : {}),
            ...(creator ? { creator } : {}),
            createdAt: issue.createdAt,
            comments: issue.comments.nodes
              .map(linearComment)
              .toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
          };
        }),
      ),

    options: (containerId) =>
      containerId === undefined
        ? graphql(TEAMS_QUERY, {}, Schema.Struct({ teams: Connection(LinearTeam) })).pipe(
            Effect.map((data): IssueOptions => ({
              containers: data.teams.nodes.map((team) => ({ ...team })),
              statuses: [],
              members: [],
              labels: [],
            })),
          )
        : graphql(
            OPTIONS_QUERY,
            { teamId: containerId, labelTeamId: containerId },
            Schema.Struct({
              teams: Connection(LinearTeam),
              team: Nullable(
                Schema.Struct({
                  states: Connection(LinearState),
                  members: Connection(
                    Schema.Struct({ ...LinearPerson.fields, active: Schema.Boolean }),
                  ),
                }),
              ),
              issueLabels: Connection(LinearLabel),
            }),
          ).pipe(
            Effect.map((data): IssueOptions => ({
              containers: data.teams.nodes.map((team) => ({ ...team })),
              statuses: (data.team?.states.nodes ?? [])
                .map(status)
                .toSorted((a, b) => (a.position ?? 0) - (b.position ?? 0)),
              members: (data.team?.members.nodes ?? [])
                .filter((member) => member.active)
                .flatMap((member) => person(member) ?? []),
              labels: data.issueLabels.nodes.map((label) => ({ ...label })),
            })),
          ),

    update: (id, patch) =>
      graphql(
        UPDATE_MUTATION,
        {
          id,
          input: {
            ...(patch.title === undefined ? {} : { title: patch.title }),
            ...(patch.description === undefined ? {} : { description: patch.description }),
            ...(patch.statusId === undefined ? {} : { stateId: patch.statusId }),
            ...(patch.priority === undefined ? {} : { priority: priorityNumber(patch.priority) }),
            ...(patch.assigneeId === undefined ? {} : { assigneeId: patch.assigneeId }),
            ...(patch.labelIds === undefined ? {} : { labelIds: patch.labelIds }),
          },
        },
        Schema.Struct({ issueUpdate: Schema.Struct({ success: Schema.Boolean }) }),
      ).pipe(Effect.flatMap((data) => succeeded(data.issueUpdate.success, "update the issue"))),

    addComment: (id, body) =>
      graphql(
        COMMENT_MUTATION,
        { input: { issueId: id, body } },
        Schema.Struct({
          commentCreate: Schema.Struct({
            success: Schema.Boolean,
            comment: Nullable(LinearComment),
          }),
        }),
      ).pipe(
        Effect.flatMap(({ commentCreate }) =>
          commentCreate.success && commentCreate.comment
            ? Effect.succeed(linearComment(commentCreate.comment))
            : Effect.fail(new IssueTrackerError({ message: "Linear could not add the comment." })),
        ),
      ),

    create: (input) =>
      graphql(
        CREATE_MUTATION,
        {
          input: {
            teamId: input.containerId,
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            ...(input.priority === undefined ? {} : { priority: priorityNumber(input.priority) }),
            ...(input.statusId === undefined ? {} : { stateId: input.statusId }),
            ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }),
            ...(input.labelIds === undefined ? {} : { labelIds: input.labelIds }),
          },
        },
        Schema.Struct({
          issueCreate: Schema.Struct({
            success: Schema.Boolean,
            issue: Nullable(
              Schema.Struct({ id: Schema.String, identifier: Schema.String, url: Schema.String }),
            ),
          }),
        }),
      ).pipe(
        Effect.flatMap(({ issueCreate }) =>
          issueCreate.success && issueCreate.issue
            ? Effect.succeed({ source: "linear" as const, ...issueCreate.issue })
            : Effect.fail(new IssueTrackerError({ message: "Linear could not create the issue." })),
        ),
      ),
  };
}
