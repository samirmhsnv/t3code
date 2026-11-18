import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/http";
import type { StandaloneIssueTrackerApi } from "@t3tools/source-control-core/server/IssueTracker";
import * as IssueTrackerHost from "@t3tools/source-control-core/server/IssueTrackerHost";

import * as DeckbellIssueTracker from "./DeckbellIssueTracker.ts";

const issue = (identifier: string, overrides: Record<string, unknown> = {}) => ({
  id: 7,
  identifier,
  title: `Issue ${identifier}`,
  description: "body",
  url: `https://app.deckbell.com/projects/${identifier}/issues/issue`,
  project: { id: 1, key: identifier.split("-")[0], name: "Web" },
  state: { id: 3, name: "In Progress", category: "started", color: "#fa0" },
  assignee: { type: "user", id: 12, name: "Theo" },
  labels: [{ id: 5, name: "Bug", color: "#f00" }],
  creator: { id: 4, name: "Julius", username: "julius", avatar: null },
  completed_at: null,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-02T00:00:00.000Z",
  ...overrides,
});

/** Answers each request by `METHOD /path`, the way Deckbell's v1 API would. */
function fakeDeckbell(answers: Record<string, (url: URL) => Response | unknown>) {
  const requests: Array<{ readonly route: string; readonly url: URL; readonly body: unknown }> = [];
  const http = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        const url = new URL(request.url);
        for (const [key, value] of request.urlParams.params)
          url.searchParams.set(key, String(value));
        const route = `${request.method} ${url.pathname.replace("/api/v1", "")}`;
        const body =
          request.body._tag === "Uint8Array"
            ? JSON.parse(new TextDecoder().decode(request.body.body))
            : undefined;
        requests.push({ route, url, body });
        const answer = answers[route]?.(url);
        const response =
          answer instanceof Response
            ? answer
            : new Response(JSON.stringify(answer ?? { error: { message: `No ${route}` } }), {
                status: answer === undefined ? 404 : 200,
                headers: { "content-type": "application/json" },
              });
        return HttpClientResponse.fromWeb(request, response);
      }),
    ),
  );
  const host = Layer.succeed(
    IssueTrackerHost.IssueTrackerHost,
    IssueTrackerHost.IssueTrackerHost.of({
      credentials: { get: () => Effect.succeedSome("dkb_stored") },
    }),
  );
  const tracker = DeckbellIssueTracker.make.pipe(
    Effect.map((api) => api as Required<StandaloneIssueTrackerApi>),
    Effect.provide(Layer.merge(http, host)),
  );
  return { tracker, requests };
}

const target = { cwd: "/w/web", host: "app.deckbell.com", scope: "WEB" };

describe("DeckbellIssueTracker", () => {
  it.effect("lists a project's open issues with members addressed by id", () =>
    Effect.gen(function* () {
      const fake = fakeDeckbell({
        "GET /issues": () => ({
          data: [issue("WEB-42")],
          pagination: { next_cursor: "c2", has_more: true },
        }),
      });
      const api = yield* fake.tracker;
      const page = yield* api.listIssues({
        ...target,
        involvement: "assigned",
        viewer: "12",
        state: "open",
        limit: 30,
        sort: "updated",
        labels: ["Bug"],
      });
      expect(page.nextCursor).toBe("c2");
      expect(page.items[0]).toMatchObject({
        key: "WEB-42",
        displayKey: "WEB-42",
        state: { category: "open", name: "In Progress" },
        assignees: [{ login: "12", name: "Theo" }],
        author: { login: "4", name: "Julius" },
        labels: [{ name: "Bug", color: "#f00" }],
      });
      const params = Object.fromEntries(fake.requests[0]!.url.searchParams);
      expect(params).toMatchObject({
        project: "WEB",
        state_category: "backlog,unstarted,started",
        assignee: "me",
        label: "Bug",
        label_mode: "all",
        order_by: "updated_at",
        limit: "30",
      });
    }),
  );

  it.effect("reads a rejected token as unauthenticated and a completed state as closed", () =>
    Effect.gen(function* () {
      const rejected = yield* fakeDeckbell({
        "GET /issues": () =>
          new Response(JSON.stringify({ error: { code: "unauthenticated", message: "no" } }), {
            status: 401,
          }),
      }).tracker;
      const error = yield* Effect.flip(
        rejected.listIssues({
          ...target,
          involvement: "all",
          state: "all",
          limit: 10,
          sort: "updated",
        }),
      );
      expect(error.reason).toBe("unauthenticated");

      const api = yield* fakeDeckbell({
        "GET /issues/WEB-42": () => ({
          data: issue("WEB-42", {
            state: { name: "Done", category: "completed" },
            completed_at: "2026-11-03T00:00:00.000Z",
          }),
        }),
        "GET /issues/WEB-42/comments": () => ({ data: [], pagination: { next_cursor: null } }),
        "GET /projects/WEB/states": () => ({
          data: [
            { id: 9, name: "Done", category: "completed", position: 0 },
            { id: 1, name: "Todo", category: "unstarted", position: 0 },
          ],
        }),
        "GET /issues/WEB-42/pull-requests": () => ({ data: [] }),
        "GET /me": () => ({ data: { user: { id: 12, name: "Theo" } } }),
      }).tracker;
      const detail = yield* api.getIssue({ ...target, key: "WEB-42" });
      expect(detail.state).toEqual({ category: "closed", name: "Done", closeReason: "completed" });
      expect(detail.closedAt).toBe("2026-11-03T00:00:00.000Z");
      expect(detail.states.map((state) => state.name)).toEqual(["Todo", "Done"]);
      expect(detail.viewer).toBe("12");
    }),
  );

  it.effect("refuses a write to an issue from another project", () =>
    Effect.gen(function* () {
      const fake = fakeDeckbell({
        "GET /issues/APP-3": () => ({ data: issue("APP-3") }),
      });
      const api = yield* fake.tracker;
      const error = yield* Effect.flip(api.setState({ ...target, key: "APP-3", state: "Done" }));
      expect(error.detail).toContain("not WEB");
      expect(fake.requests.map((request) => request.route)).toEqual(["GET /issues/APP-3"]);
    }),
  );

  it.effect("parses Deckbell issue links", () =>
    Effect.gen(function* () {
      const api = yield* fakeDeckbell({}).tracker;
      expect(
        api.parseIssueUrl(new URL("https://app.deckbell.com/projects/WEB-42/issues/fix-login")),
      ).toEqual({ host: "app.deckbell.com", workspace: "deckbell", scope: "WEB", key: "WEB-42" });
      for (const url of [
        "http://app.deckbell.com/projects/WEB-42/issues",
        "https://deckbell.com/projects/WEB-42/issues",
        "https://app.deckbell.com/documents/WEB-42",
        "https://app.deckbell.com/projects/WEB-0/issues",
      ]) {
        expect(api.parseIssueUrl(new URL(url)), url).toBeNull();
      }
    }),
  );
});
