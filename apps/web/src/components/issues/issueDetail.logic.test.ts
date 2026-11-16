import { describe, expect, it } from "vite-plus/test";

import { filterByName, sameIds, shouldCloseOnEscape, withCurrent } from "./issueDetail.logic";

describe("withCurrent", () => {
  it("puts current values the tracker did not offer first", () => {
    const options = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    expect(withCurrent(options, [{ id: "b", name: "B" }])).toBe(options);
    expect(withCurrent(options, [{ id: "z", name: "Z" }]).map((item) => item.id)).toEqual([
      "z",
      "a",
      "b",
    ]);
  });
});

describe("filterByName", () => {
  it("matches case-insensitively and ignores surrounding space", () => {
    const items = [{ name: "Bug" }, { name: "Feature" }, { name: "debug" }];
    expect(filterByName(items, "  BUG ").map((item) => item.name)).toEqual(["Bug", "debug"]);
    expect(filterByName(items, "")).toBe(items);
  });
});

describe("sameIds", () => {
  it("compares sets regardless of order", () => {
    expect(sameIds(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameIds(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
  });
});

describe("shouldCloseOnEscape", () => {
  const escape = {
    key: "Escape",
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  };
  const page = { editable: false, insidePage: true };

  it("closes from the page but not from fields, popups, or handled events", () => {
    expect(shouldCloseOnEscape(escape, page)).toBe(true);
    expect(shouldCloseOnEscape(escape, { ...page, editable: true })).toBe(false);
    expect(shouldCloseOnEscape(escape, { ...page, insidePage: false })).toBe(false);
    expect(shouldCloseOnEscape({ ...escape, defaultPrevented: true }, page)).toBe(false);
    expect(shouldCloseOnEscape({ ...escape, key: "k" }, page)).toBe(false);
  });
});
