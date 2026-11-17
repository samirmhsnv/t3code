// Fallback for models whose provider reports no description: names the well-known families.
// First match wins, so narrower patterns come first.
const MODEL_DESCRIPTORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\[1m\]|-1m\b|\b1m\b/, "Very large context"],
  [/opus/, "Most capable"],
  [/sonnet/, "Balanced, everyday coding"],
  [/haiku/, "Fastest, lowest cost"],
  [/fable/, "Long autonomous tasks"],
  [/codex-spark|spark/, "Near-instant edits"],
  [/codex/, "Agentic coding"],
  [/mini|nano|luna|flash/, "Fast, lower cost"],
  [/composer/, "Fast edits"],
];

export function modelDescriptor(slug: string): string | null {
  const key = slug.toLowerCase();
  return MODEL_DESCRIPTORS.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}
