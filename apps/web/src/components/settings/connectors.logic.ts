import type { McpServerVariable } from "@t3tools/contracts";

/** Splits a command line the way a shell would for plain words and quotes, without expansion. */
export function splitCommandLine(line: string): string[] {
  const words: string[] = [];
  let current = "";
  let inWord = false;
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (char === "\\" && quote === '"' && index + 1 < line.length) current += line[++index];
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      inWord = true;
    } else if (char === "\\" && index + 1 < line.length) {
      current += line[++index];
      inWord = true;
    } else if (/\s/.test(char)) {
      if (inWord) words.push(current);
      current = "";
      inWord = false;
    } else {
      current += char;
      inWord = true;
    }
  }
  if (inWord) words.push(current);
  return words;
}

/**
 * Reads one `NAME=value` (or `Name: value` for headers) per line. Returns the 1-based number of
 * the first line it can't read instead, so the form can point at it.
 */
export function parseVariableLines(
  text: string,
  separator: "=" | ":",
): { readonly variables: McpServerVariable[] } | { readonly badLine: number } {
  const variables: McpServerVariable[] = [];
  const lines = text.split("\n");
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const at = line.indexOf(separator);
    const name = at > 0 ? line.slice(0, at).trim() : "";
    if (name.length === 0 || /\s/.test(name)) return { badLine: index + 1 };
    variables.push({ name, value: line.slice(at + 1).trim() });
  }
  return { variables };
}
