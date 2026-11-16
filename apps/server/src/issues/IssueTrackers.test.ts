import { it } from "@effect/vitest";
import { SecretProviderId, type SettingsSecretValue } from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { expect, vi } from "vite-plus/test";

import * as ServerSettings from "../serverSettings.ts";
import * as IssueTrackers from "./IssueTrackers.ts";

const linearBody = {
  data: {
    viewer: {
      assignedIssues: {
        nodes: [
          {
            id: "lin-uuid",
            identifier: "ENG-7",
            title: "Fix login",
            url: "https://linear.app/acme/issue/ENG-7",
            priority: 2,
            priorityLabel: "High",
            updatedAt: "2026-11-10T10:00:00.000Z",
            state: {
              id: "state-started",
              name: "In Progress",
              type: "started",
              color: "#f2c94c",
              position: 2,
            },
            team: { id: "team-eng", key: "ENG", name: "Engineering" },
            assignee: { id: "user-me", name: "Me", avatarUrl: null },
            labels: { nodes: [{ id: "label-bug", name: "Bug", color: "#eb5757" }] },
          },
        ],
      },
    },
  },
};

const deckbellBody = {
  data: [
    {
      id: 42,
      identifier: "WEB-42",
      title: "Ship issues page",
      url: "https://deckbell.com/acme/issues/WEB-42",
      priority: "urgent",
      updated_at: "2026-11-12T08:00:00+00:00",
      project: { id: 1, key: "WEB", name: "Web" },
      state: { id: 3, name: "Todo", category: "unstarted", color: "#999999" },
      assignee: { type: "user", id: 9, name: "Me" },
      labels: [{ id: 4, name: "UI", color: "#6366f1" }],
    },
    {
      id: 43,
      identifier: "WEB-43",
      title: "Already done",
      url: "https://deckbell.com/acme/issues/WEB-43",
      priority: "low",
      updated_at: "2026-11-13T08:00:00+00:00",
      project: { id: 1, key: "WEB", name: "Web" },
      state: { id: 5, name: "Done", category: "completed", color: "#00ff00" },
    },
  ],
  pagination: { next_cursor: null, has_more: false, limit: 100 },
};

type Credentials = { linear?: SettingsSecretValue; deckbell?: SettingsSecretValue };

const makeService = (credentials: Credentials, read = vi.fn()) =>
  IssueTrackers.IssueTrackers.pipe(
    Effect.provide(
      IssueTrackers.layer.pipe(
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(
          ServerSettings.ServerSettingsService.layerTest({ issueTrackerCredentials: credentials }),
        ),
        Layer.provide(
          Layer.mock(SecretResolver.SecretResolver)({
            read,
            label: () => Effect.succeed("Work"),
          }),
        ),
      ),
    ),
  );

it.effect("merges open assigned issues from Linear and Deckbell, newest first", () =>
  Effect.gen(function* () {
    const reference = { provider: SecretProviderId.make("work"), reference: "op://Work/Linear" };
    const read = vi.fn(() => Effect.succeed(["lin_api_resolved"]));
    const upstream = vi.fn<typeof fetch>(async (input) =>
      String(input).startsWith("https://api.linear.app")
        ? Response.json(linearBody)
        : Response.json(deckbellBody),
    );
    const service = yield* makeService({ linear: reference, deckbell: "dkb_secret" }, read);
    const result = yield* service
      .list({})
      .pipe(Effect.provideService(FetchHttpClient.Fetch, upstream));

    expect(result.sources).toEqual({ linear: { _tag: "Ok" }, deckbell: { _tag: "Ok" } });
    expect(result.issues).toEqual([
      {
        source: "deckbell",
        id: "42",
        identifier: "WEB-42",
        title: "Ship issues page",
        url: "https://deckbell.com/acme/issues/WEB-42",
        status: { id: "3", name: "Todo", category: "unstarted", color: "#999999" },
        priority: "urgent",
        labels: [{ id: "4", name: "UI", color: "#6366f1" }],
        assignee: { id: "9", name: "Me" },
        container: { id: "1", key: "WEB", name: "Web" },
        updatedAt: "2026-11-12T08:00:00+00:00",
      },
      {
        source: "linear",
        id: "lin-uuid",
        identifier: "ENG-7",
        title: "Fix login",
        url: "https://linear.app/acme/issue/ENG-7",
        status: {
          id: "state-started",
          name: "In Progress",
          category: "started",
          color: "#f2c94c",
          position: 2,
        },
        priority: "high",
        labels: [{ id: "label-bug", name: "Bug", color: "#eb5757" }],
        assignee: { id: "user-me", name: "Me" },
        container: { id: "team-eng", key: "ENG", name: "Engineering" },
        updatedAt: "2026-11-10T10:00:00.000Z",
      },
    ]);

    const headers = (prefix: string) => {
      const call = upstream.mock.calls.find(([url]) => String(url).startsWith(prefix));
      return { url: new URL(String(call?.[0])), headers: new Headers(call?.[1]?.headers) };
    };
    const linear = headers("https://api.linear.app");
    expect(linear.headers.get("authorization")).toBe("lin_api_resolved");
    const deckbell = headers("https://api.deckbell.com");
    expect(deckbell.headers.get("authorization")).toBe("Bearer dkb_secret");
    expect(deckbell.url.searchParams.get("assignee")).toBe("me");
    expect(deckbell.url.searchParams.get("state_category")).toBe("backlog,unstarted,started");
    expect(read).toHaveBeenCalledWith([reference]);

    upstream.mockClear();
    yield* service
      .list({ scope: "all" })
      .pipe(Effect.provideService(FetchHttpClient.Fetch, upstream));
    expect(headers("https://api.deckbell.com").url.searchParams.has("assignee")).toBe(false);
  }),
);

it.effect("reports unconfigured and failing sources without dropping the others", () =>
  Effect.gen(function* () {
    const upstream = vi.fn<typeof fetch>(async (input) =>
      String(input).startsWith("https://api.linear.app")
        ? Response.json(
            { errors: [{ message: "Authentication required" }], data: null },
            { status: 400 },
          )
        : new Response("upstream diagnostic", { status: 401 }),
    );
    const run = (credentials: Credentials) =>
      makeService(credentials).pipe(
        Effect.flatMap((service) => service.list({})),
        Effect.provideService(FetchHttpClient.Fetch, upstream),
      );

    expect(yield* run({})).toEqual({
      issues: [],
      sources: { linear: { _tag: "NotConfigured" }, deckbell: { _tag: "NotConfigured" } },
    });
    expect(upstream).not.toHaveBeenCalled();

    expect((yield* run({ linear: "lin_api_bad", deckbell: "dkb_bad" })).sources).toEqual({
      linear: { _tag: "Error", message: "Linear: Authentication required" },
      deckbell: { _tag: "Error", message: "Deckbell rejected the API key." },
    });

    upstream.mockImplementation(async () => Response.json(deckbellBody));
    const partial = yield* run({ deckbell: "dkb_secret" });
    expect(partial.sources.linear).toEqual({ _tag: "NotConfigured" });
    expect(partial.issues.map((issue) => issue.identifier)).toEqual(["WEB-42"]);
  }),
);

type Sent = { method: string; url: URL; body: unknown };

/** A fetch that answers by `METHOD url-prefix` and records each request with its JSON body. */
const routedFetch = (routes: ReadonlyArray<readonly [string, () => Response]>) => {
  const sent: Array<Sent> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const method = request.method;
    const url = new URL(request.url);
    sent.push({ method, url, body: method === "GET" ? undefined : await request.json() });
    const route = routes.find(([key]) => {
      const [routeMethod, prefix] = key.split(" ");
      return routeMethod === method && `${url.origin}${url.pathname}` === prefix;
    });
    return route ? route[1]() : new Response("not found", { status: 404 });
  });
  return { fetch, sent };
};

const linearData = (data: unknown) => () => Response.json({ data });
const LINEAR = "POST https://api.linear.app/graphql";
const DECKBELL = "https://api.deckbell.com/api/v1";

it.effect("reads an issue with its comments, oldest first, from each tracker", () =>
  Effect.gen(function* () {
    const linearIssue = {
      ...linearBody.data.viewer.assignedIssues.nodes[0],
      description: "Steps to reproduce",
      createdAt: "2026-11-01T00:00:00.000Z",
      creator: { id: "user-a", name: "Ada", avatarUrl: "https://a/ada.png" },
      project: { name: "Auth" },
      comments: {
        nodes: [
          { id: "c2", body: "Second", createdAt: "2026-11-03T00:00:00.000Z", user: null },
          {
            id: "c1",
            body: "First",
            createdAt: "2026-11-02T00:00:00.000Z",
            user: { id: "user-a", name: "Ada", avatarUrl: null },
          },
        ],
      },
    };
    const { fetch, sent } = routedFetch([
      [LINEAR, linearData({ issue: linearIssue })],
      [
        `GET ${DECKBELL}/issues/42`,
        () =>
          Response.json({
            data: {
              ...deckbellBody.data[0],
              description: null,
              created_at: "2026-11-01T00:00:00+00:00",
              creator: { id: 9, name: "Me", username: "me", avatar: null },
            },
          }),
      ],
      [
        `GET ${DECKBELL}/issues/42/comments`,
        () =>
          Response.json({
            data: [
              {
                id: 7,
                body: "Imported note",
                author: null,
                imported_author: { source: "jira", name: "Old Timer", former: true },
                created_at: "2026-11-02T00:00:00+00:00",
              },
            ],
            pagination: { next_cursor: null, has_more: false, limit: 100 },
          }),
      ],
    ]);
    const service = yield* makeService({ linear: "lin_api_key", deckbell: "dkb_secret" });
    const read = (source: "linear" | "deckbell", id: string) =>
      service.get({ source, id }).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));

    const linear = yield* read("linear", "lin-uuid");
    expect(linear).toMatchObject({
      identifier: "ENG-7",
      description: "Steps to reproduce",
      project: "Auth",
      creator: { id: "user-a", name: "Ada", avatarUrl: "https://a/ada.png" },
      createdAt: "2026-11-01T00:00:00.000Z",
    });
    expect(linear.comments).toEqual([
      {
        id: "c1",
        body: "First",
        author: { id: "user-a", name: "Ada" },
        createdAt: "2026-11-02T00:00:00.000Z",
      },
      { id: "c2", body: "Second", createdAt: "2026-11-03T00:00:00.000Z" },
    ]);
    expect(sent[0]?.body).toMatchObject({ variables: { id: "lin-uuid" } });

    const deckbell = yield* read("deckbell", "42");
    expect(deckbell).toMatchObject({
      identifier: "WEB-42",
      description: "",
      container: { id: "1", key: "WEB", name: "Web" },
      creator: { id: "9", name: "Me" },
    });
    expect(deckbell.comments).toEqual([
      {
        id: "7",
        body: "Imported note",
        author: { id: "imported:Old Timer", name: "Old Timer" },
        createdAt: "2026-11-02T00:00:00+00:00",
      },
    ]);

    const missing = yield* makeService({}).pipe(
      Effect.flatMap((unconfigured) => unconfigured.get({ source: "linear", id: "x" })),
      Effect.flip,
    );
    expect(missing.message).toBe("Add your Linear API key in Settings first.");
  }),
);

it.effect("sends updates, comments and new issues in each tracker's own shape", () =>
  Effect.gen(function* () {
    const comment = {
      id: "c9",
      body: "On it",
      createdAt: "2026-11-05T00:00:00.000Z",
      user: { id: "user-me", name: "Me", avatarUrl: null },
    };
    const linearMutationReply: Array<unknown> = [
      { issueUpdate: { success: true } },
      { commentCreate: { success: true, comment } },
      { issueCreate: { success: true, issue: { id: "new-uuid", identifier: "ENG-8", url: "u" } } },
    ];
    const { fetch, sent } = routedFetch([
      [LINEAR, () => Response.json({ data: linearMutationReply.shift() })],
      [`PATCH ${DECKBELL}/issues/42`, () => Response.json({ data: deckbellBody.data[0] })],
      [
        `POST ${DECKBELL}/issues/42/comments`,
        () =>
          Response.json(
            {
              data: {
                id: 11,
                body: "On it",
                author: { type: "user", id: 9, name: "Me" },
                created_at: "2026-11-05T00:00:00+00:00",
              },
            },
            { status: 201 },
          ),
      ],
      [
        `POST ${DECKBELL}/issues`,
        () => Response.json({ data: deckbellBody.data[0] }, { status: 201 }),
      ],
    ]);
    const service = yield* makeService({ linear: "lin_api_key", deckbell: "dkb_secret" });
    const run = <A, E>(effect: Effect.Effect<A, E>) =>
      effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));
    const patch = { statusId: "5", priority: "high", assigneeId: null, labelIds: ["4"] } as const;

    yield* run(service.update({ source: "linear", id: "lin-uuid", patch }));
    expect(
      yield* run(service.addComment({ source: "linear", id: "lin-uuid", body: "  On it " })),
    ).toEqual({
      id: "c9",
      body: "On it",
      author: { id: "user-me", name: "Me" },
      createdAt: "2026-11-05T00:00:00.000Z",
    });
    expect(
      yield* run(
        service.create({
          source: "linear",
          containerId: "team-eng",
          title: "New",
          priority: "low",
        }),
      ),
    ).toEqual({ source: "linear", id: "new-uuid", identifier: "ENG-8", url: "u" });
    expect(sent.map((request) => (request.body as { variables: unknown }).variables)).toEqual([
      {
        id: "lin-uuid",
        input: { stateId: "5", priority: 2, assigneeId: null, labelIds: ["4"] },
      },
      { input: { issueId: "lin-uuid", body: "On it" } },
      { input: { teamId: "team-eng", title: "New", priority: 4 } },
    ]);

    sent.length = 0;
    yield* run(service.update({ source: "deckbell", id: "42", patch }));
    expect(
      (yield* run(service.addComment({ source: "deckbell", id: "42", body: "On it" }))).author,
    ).toEqual({ id: "9", name: "Me" });
    expect(
      yield* run(
        service.create({ source: "deckbell", containerId: "1", title: "New", assigneeId: "9" }),
      ),
    ).toEqual({
      source: "deckbell",
      id: "42",
      identifier: "WEB-42",
      url: "https://deckbell.com/acme/issues/WEB-42",
    });
    expect(sent.map(({ method, url, body }) => [method, url.pathname, body])).toEqual([
      [
        "PATCH",
        "/api/v1/issues/42",
        { state: "5", priority: "high", assignee_id: null, labels: [4] },
      ],
      ["POST", "/api/v1/issues/42/comments", { body: "On it" }],
      ["POST", "/api/v1/issues", { project: "1", title: "New", assignee_id: 9 }],
    ]);

    const rejected = yield* run(
      service.addComment({ source: "deckbell", id: "404", body: "x" }),
    ).pipe(Effect.flip);
    expect(rejected.message).toBe("Deckbell answered with HTTP 404.");
  }),
);

it.effect("lists a team's or project's statuses, members and labels for the pickers", () =>
  Effect.gen(function* () {
    const { fetch, sent } = routedFetch([
      [
        LINEAR,
        linearData({
          teams: { nodes: [{ id: "team-eng", key: "ENG", name: "Engineering" }] },
          team: {
            states: {
              nodes: [
                { id: "s-done", name: "Done", type: "completed", color: "#0f0", position: 3 },
                { id: "s-todo", name: "Todo", type: "unstarted", color: "#999", position: 1 },
              ],
            },
            members: {
              nodes: [
                { id: "user-me", name: "Me", avatarUrl: null, active: true },
                { id: "user-gone", name: "Gone", avatarUrl: null, active: false },
              ],
            },
          },
          issueLabels: { nodes: [{ id: "label-bug", name: "Bug", color: "#eb5757" }] },
        }),
      ],
      [
        `GET ${DECKBELL}/projects`,
        () => Response.json({ data: [{ id: 1, key: "WEB", name: "Web", slug: "web" }] }),
      ],
      [
        `GET ${DECKBELL}/projects/1/states`,
        () =>
          Response.json({
            data: [{ id: 3, name: "Todo", category: "unstarted", color: "#999", position: 0 }],
          }),
      ],
      [`GET ${DECKBELL}/projects/1/labels`, () => Response.json({ data: [{ id: 4, name: "UI" }] })],
      [
        `GET ${DECKBELL}/projects/1/members`,
        () =>
          Response.json(
            { error: { code: "insufficient_scope", message: "Needs projects:read." } },
            { status: 403 },
          ),
      ],
    ]);
    const service = yield* makeService({ linear: "lin_api_key", deckbell: "dkb_secret" });
    const run = <A, E>(effect: Effect.Effect<A, E>) =>
      effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));

    expect(yield* run(service.options({ source: "linear", containerId: "team-eng" }))).toEqual({
      containers: [{ id: "team-eng", key: "ENG", name: "Engineering" }],
      statuses: [
        { id: "s-todo", name: "Todo", category: "unstarted", color: "#999", position: 1 },
        { id: "s-done", name: "Done", category: "completed", color: "#0f0", position: 3 },
      ],
      members: [{ id: "user-me", name: "Me" }],
      labels: [{ id: "label-bug", name: "Bug", color: "#eb5757" }],
    });
    expect(sent[0]?.body).toMatchObject({
      variables: { teamId: "team-eng", labelTeamId: "team-eng" },
    });

    expect(yield* run(service.options({ source: "deckbell", containerId: "1" }))).toEqual({
      containers: [{ id: "1", key: "WEB", name: "Web" }],
      statuses: [{ id: "3", name: "Todo", category: "unstarted", color: "#999", position: 0 }],
      members: [],
      labels: [{ id: "4", name: "UI" }],
    });
    expect(yield* run(service.options({ source: "deckbell" }))).toEqual({
      containers: [{ id: "1", key: "WEB", name: "Web" }],
      statuses: [],
      members: [],
      labels: [],
    });
  }),
);
