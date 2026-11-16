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
            state: { name: "In Progress", type: "started", color: "#f2c94c" },
            team: { key: "ENG", name: "Engineering" },
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
    const result = yield* service.list.pipe(Effect.provideService(FetchHttpClient.Fetch, upstream));

    expect(result.sources).toEqual({ linear: { _tag: "Ok" }, deckbell: { _tag: "Ok" } });
    expect(result.issues).toEqual([
      {
        source: "deckbell",
        id: "42",
        identifier: "WEB-42",
        title: "Ship issues page",
        url: "https://deckbell.com/acme/issues/WEB-42",
        status: { name: "Todo", category: "unstarted", color: "#999999" },
        priority: "urgent",
        projectKey: "WEB",
        updatedAt: "2026-11-12T08:00:00+00:00",
      },
      {
        source: "linear",
        id: "lin-uuid",
        identifier: "ENG-7",
        title: "Fix login",
        url: "https://linear.app/acme/issue/ENG-7",
        status: { name: "In Progress", category: "started", color: "#f2c94c" },
        priority: "high",
        projectKey: "ENG",
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
        Effect.flatMap((service) => service.list),
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
