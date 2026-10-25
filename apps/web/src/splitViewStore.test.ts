import { describe, expect, it } from "vite-plus/test";

import { EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";

import { MAX_SPLIT_PANES, splitPaneCapacity, withSplitThread } from "./splitViewStore";

const environmentId = EnvironmentId.make("env:local");
const ref = (id: string): ScopedThreadRef => ({ environmentId, threadId: ThreadId.make(id) });
const ids = (refs: ReadonlyArray<ScopedThreadRef>) => refs.map((open) => open.threadId);

describe("withSplitThread", () => {
  it("adds panes until full, then replaces the last one", () => {
    let refs: ReadonlyArray<ScopedThreadRef> = [];
    for (const id of ["a", "b", "c"]) refs = withSplitThread(refs, ref(id), 3);
    expect(ids(refs)).toEqual(["a", "b", "c"]);

    expect(ids(withSplitThread(refs, ref("d"), 3))).toEqual(["a", "b", "d"]);
  });

  it("keeps an already open thread where it is", () => {
    const refs = [ref("a"), ref("b")];
    expect(withSplitThread(refs, ref("a"), 4)).toBe(refs);
  });

  it("drops panes beyond a capacity that shrank with the window", () => {
    const refs = [ref("a"), ref("b"), ref("c")];
    expect(ids(withSplitThread(refs, ref("d"), 2))).toEqual(["a", "d"]);
  });
});

describe("splitPaneCapacity", () => {
  it("fits fewer panes in narrow windows and never exceeds the cap", () => {
    expect(splitPaneCapacity(600)).toBe(1);
    expect(splitPaneCapacity(1280)).toBe(2);
    expect(splitPaneCapacity(1920)).toBe(MAX_SPLIT_PANES);
    expect(splitPaneCapacity(5000)).toBe(MAX_SPLIT_PANES);
  });
});
