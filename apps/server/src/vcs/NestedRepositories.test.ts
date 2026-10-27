import { describe, expect, it } from "vite-plus/test";

import {
  isQuietRepositoryStatus,
  prefixReviewDiff,
  splitNestedPath,
} from "./NestedRepositories.ts";

describe("prefixReviewDiff", () => {
  it("moves header paths under the repository folder and leaves hunk lines alone", () => {
    const diff = [
      "diff --git a/src/old.ts b/src/new.ts",
      "similarity index 90%",
      "rename from src/old.ts",
      "rename to src/new.ts",
      "--- a/src/old.ts",
      "+++ b/src/new.ts",
      "@@ -1 +1 @@",
      "--- a/not-a-header",
      "+++ b/not-a-header",
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "--- /dev/null",
      '+++ "b/sp ace.txt"',
      "Binary files a/logo.png and b/logo.png differ",
      "",
    ].join("\n");
    expect(prefixReviewDiff(diff, "api").split("\n")).toEqual([
      "diff --git a/api/src/old.ts b/api/src/new.ts",
      "similarity index 90%",
      "rename from api/src/old.ts",
      "rename to api/src/new.ts",
      "--- a/api/src/old.ts",
      "+++ b/api/src/new.ts",
      "@@ -1 +1 @@",
      "--- a/not-a-header",
      "+++ b/not-a-header",
      "diff --git a/api/new.txt b/api/new.txt",
      "new file mode 100644",
      "--- /dev/null",
      '+++ "b/api/sp ace.txt"',
      "Binary files a/api/logo.png and b/api/logo.png differ",
      "",
    ]);
  });
});

describe("splitNestedPath", () => {
  it("routes a folder-relative path to its repository", () => {
    expect(splitNestedPath(["api", "web"], "web/src/app.tsx")).toEqual({
      repository: "web",
      path: "src/app.tsx",
    });
    expect(splitNestedPath(["api", "web"], "docs/readme.md")).toBeNull();
    expect(splitNestedPath(["api"], "api")).toBeNull();
  });
});

describe("isQuietRepositoryStatus", () => {
  const header = (upstream: string, ab: string) =>
    `# branch.oid abc\n# branch.head prod\n# branch.upstream ${upstream}\n# branch.ab ${ab}\n`;

  it("is quiet only when clean and level with the remote default branch", () => {
    expect(isQuietRepositoryStatus(header("origin/prod", "+0 -0"), "origin/prod")).toBe(true);
    expect(isQuietRepositoryStatus(header("origin/prod", "+2 -0"), "origin/prod")).toBe(false);
    expect(isQuietRepositoryStatus(header("origin/feature", "+0 -0"), "origin/prod")).toBe(false);
    expect(isQuietRepositoryStatus(header("origin/prod", "+0 -0"), null)).toBe(false);
    expect(
      isQuietRepositoryStatus(`${header("origin/prod", "+0 -0")}? notes.md\n`, "origin/prod"),
    ).toBe(false);
  });
});
