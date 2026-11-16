/** The tracker's options, with the issue's current value first when the options lack it. */
export function withCurrent<T extends { readonly id?: string | undefined }>(
  options: ReadonlyArray<T>,
  current: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const missing = current.filter(
    (item) => !options.some((option) => (option.id ?? null) === (item.id ?? null)),
  );
  return missing.length === 0 ? options : [...missing, ...options];
}

export function filterByName<T extends { readonly name: string }>(
  items: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<T> {
  const needle = query.trim().toLowerCase();
  return needle === "" ? items : items.filter((item) => item.name.toLowerCase().includes(needle));
}

export function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** Escape closes the issue unless it belongs to a field, a popup, or a dialog. */
export function shouldCloseOnEscape(
  event: Pick<KeyboardEvent, "key" | "defaultPrevented" | "metaKey" | "ctrlKey" | "altKey">,
  target: { readonly editable: boolean; readonly insidePage: boolean },
): boolean {
  return (
    event.key === "Escape" &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !target.editable &&
    target.insidePage
  );
}
