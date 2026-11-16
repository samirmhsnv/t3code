import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { launchingThreadKeys, threadRole, type ThreadRoleInput } from "./threadRole.logic";

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");

function thread(id: string, overrides: Partial<ThreadRoleInput> = {}): ThreadRoleInput {
  return {
    environmentId: local,
    id: ThreadId.make(id),
    title: "Add a settings row",
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: ThreadId.make(id) },
    delegatedFrom: null,
    creationSource: "web",
    ...overrides,
  };
}

const parent = thread("parent", { title: "Borrowed ideas rollout" });
const worker = thread("worker", {
  creationSource: "mcp",
  lineage: {
    parentThreadId: ThreadId.make("parent"),
    relationshipToParent: "fork",
    rootThreadId: ThreadId.make("parent"),
  },
});
const delegated = thread("delegated", {
  environmentId: remote,
  delegatedFrom: { environmentId: local, threadId: ThreadId.make("other"), title: "Other" },
});
const subagent = thread("subagent", {
  creationSource: "provider",
  lineage: {
    parentThreadId: ThreadId.make("plain"),
    relationshipToParent: "subagent",
    rootThreadId: ThreadId.make("plain"),
  },
});

describe("threadRole", () => {
  const keys = launchingThreadKeys([parent, worker, delegated, subagent, thread("plain")]);

  it("marks threads that launched others, across environments, but not subagent parents", () => {
    expect(keys).toEqual(new Set(["local:parent", "local:other"]));
  });

  it.each([
    ["a coordinator", parent, "main"],
    ["an agent-launched worker", worker, "impl"],
    ["a delegated task", delegated, "impl"],
    ["a user's own thread", thread("plain"), null],
    ["a user's fork", thread("fork", { lineage: worker.lineage }), null],
    [
      "a review by title, even when launched",
      { ...worker, title: "Review #1051 worker drain" },
      "rev",
    ],
    ["triage by title", thread("t", { title: "Triage: sidebar jank report" }), "tri"],
    ["no false review match inside a word", thread("p", { title: "Preview pane" }), null],
  ] as const)("%s", (_name, input, role) => {
    expect(threadRole(input, keys)).toBe(role);
  });
});
