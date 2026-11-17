import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  modelPickerJumpKeys,
  modelPickerListRows,
  retainedModelWhileProviderLocked,
} from "./ProviderModelPicker.logic";

const claude = ProviderDriverKind.make("claudeAgent");
const opus = { slug: "claude-opus-5-5", name: "Claude Opus 5.5", shortName: "Opus 5.5" };
const sonnet = { slug: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", shortName: "Sonnet 5.5" };
const retained = (enabled: boolean, isAvailable: boolean, models = [sonnet, opus]) =>
  retainedModelWhileProviderLocked({ driverKind: claude, enabled, isAvailable, models }, opus.slug);

describe("retainedModelWhileProviderLocked", () => {
  it("shows a hidden saved model while its provider cannot run", () => {
    expect(retained(false, true)).toBe(opus);
    expect(retained(true, false)).toBe(opus);
    expect(retained(false, true, [sonnet])).toEqual({ slug: opus.slug, name: opus.slug });
    expect(retained(true, true)).toBeUndefined();
    expect(retainedModelWhileProviderLocked(null, opus.slug)).toBeUndefined();
  });
});

describe("modelPickerListRows", () => {
  it("keeps headers out of the combobox items and maps each item back to its row", () => {
    const { rows, itemKeys, rowIndexByItemIndex } = modelPickerListRows([
      { key: "recent", label: "Recent", itemKeys: ["recent:b", "recent:a"] },
      { key: "main", label: "All models", itemKeys: ["a", "b", "c"] },
    ]);
    expect(rows.map((row) => (row.kind === "header" ? row.label : row.key))).toEqual([
      "Recent",
      "recent:b",
      "recent:a",
      "All models",
      "a",
      "b",
      "c",
    ]);
    expect(itemKeys).toEqual(["recent:b", "recent:a", "a", "b", "c"]);
    expect(rowIndexByItemIndex).toEqual([1, 2, 4, 5, 6]);
    for (const [index, key] of itemKeys.entries()) {
      expect(rows[rowIndexByItemIndex[index]!]).toEqual({ kind: "item", key, index });
    }
  });

  it("drops empty groups and the header of a lone group", () => {
    const { rows, rowIndexByItemIndex } = modelPickerListRows([
      { key: "recent", label: "Recent", itemKeys: [] },
      { key: "main", label: "Favorites", itemKeys: ["a", "b"] },
    ]);
    expect(rows).toEqual([
      { kind: "item", key: "a", index: 0 },
      { kind: "item", key: "b", index: 1 },
    ]);
    expect(rowIndexByItemIndex).toEqual([0, 1]);
  });
});

describe("modelPickerJumpKeys", () => {
  it("numbers each pickable model once, from its first row", () => {
    const modelKeyOf = (key: string) =>
      key.startsWith("legacy") ? null : key.replace(/^recent:/, "");
    expect(
      modelPickerJumpKeys(["recent:b", "recent:x", "a", "b", "c", "legacy", "d"], {
        limit: 3,
        modelKeyOf,
        isDisabled: (key) => key === "x",
      }),
    ).toEqual(["recent:b", "a", "c"]);
  });
});
