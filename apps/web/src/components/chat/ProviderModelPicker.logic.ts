import type { ProviderDriverKind } from "@t3tools/contracts";

import type { ModelEsque } from "./providerIconUtils";

/** Keeps a hidden model visible while its provider is locked or turned off. */
export function retainedModelWhileProviderLocked(
  entry: {
    readonly driverKind: ProviderDriverKind;
    readonly enabled: boolean;
    readonly isAvailable: boolean;
    readonly models: ReadonlyArray<Pick<ModelEsque, "slug" | "name" | "shortName" | "subProvider">>;
  } | null,
  model: string,
): ModelEsque | undefined {
  if (!entry || (entry.enabled && entry.isAvailable) || !model) return undefined;
  if (entry.driverKind === "opencode" || entry.driverKind === "antigravity") return undefined;
  return entry.models.find((candidate) => candidate.slug === model) ?? { slug: model, name: model };
}

export type ModelPickerListRow =
  | { readonly kind: "header"; readonly key: string; readonly label: string }
  | { readonly kind: "item"; readonly key: string; readonly index: number };

/**
 * Lays groups out as list rows. Headers are rows but not combobox items, so the combobox's
 * active index, arrow keys and jump shortcuts only ever count models; `rowIndexByItemIndex`
 * maps an item back to its row for scrolling. A lone group gets no header.
 */
export function modelPickerListRows(
  groups: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly itemKeys: ReadonlyArray<string>;
  }>,
) {
  const shown = groups.filter((group) => group.itemKeys.length > 0);
  const rows: ModelPickerListRow[] = [];
  const itemKeys: string[] = [];
  const rowIndexByItemIndex: number[] = [];
  for (const group of shown) {
    if (shown.length > 1) {
      rows.push({ kind: "header", key: `group:${group.key}`, label: group.label });
    }
    for (const key of group.itemKeys) {
      rowIndexByItemIndex.push(rows.length);
      rows.push({ kind: "item", key, index: itemKeys.length });
      itemKeys.push(key);
    }
  }
  return { rows, itemKeys, rowIndexByItemIndex };
}

/** The first `limit` pickable rows, counting a model listed in two groups once. */
export function modelPickerJumpKeys(
  itemKeys: ReadonlyArray<string>,
  input: {
    readonly limit: number;
    readonly modelKeyOf: (itemKey: string) => string | null;
    readonly isDisabled: (modelKey: string) => boolean;
  },
): ReadonlyArray<string> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const itemKey of itemKeys) {
    if (out.length === input.limit) break;
    const modelKey = input.modelKeyOf(itemKey);
    if (modelKey === null || seen.has(modelKey) || input.isDisabled(modelKey)) continue;
    seen.add(modelKey);
    out.push(itemKey);
  }
  return out;
}
