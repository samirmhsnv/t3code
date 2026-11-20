import { describe, expect, it } from "vite-plus/test";

import { parseVariableLines, splitCommandLine } from "./connectors.logic";

describe("splitCommandLine", () => {
  it("keeps quoted words and escapes whole", () => {
    expect(splitCommandLine(`npx -y "@scope/server name" --dir='a b' c\\ d ""`)).toEqual([
      "npx",
      "-y",
      "@scope/server name",
      "--dir=a b",
      "c d",
      "",
    ]);
    expect(splitCommandLine("   ")).toEqual([]);
  });
});

describe("parseVariableLines", () => {
  it("reads env and header lines and points at the first bad one", () => {
    expect(parseVariableLines("A=1\n\n B = x=y ", "=")).toEqual({
      variables: [
        { name: "A", value: "1" },
        { name: "B", value: "x=y" },
      ],
    });
    expect(parseVariableLines("Authorization: Bearer t", ":")).toEqual({
      variables: [{ name: "Authorization", value: "Bearer t" }],
    });
    expect(parseVariableLines("A=1\nno separator", "=")).toEqual({ badLine: 2 });
    expect(parseVariableLines("=value", "=")).toEqual({ badLine: 1 });
  });
});
