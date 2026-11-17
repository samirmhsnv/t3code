import { sha1 } from "@noble/hashes/legacy";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type { OrchestrationV2PlanArtifact } from "@t3tools/contracts";

export interface ThreadNowNext {
  readonly now: string | null;
  readonly next: string | null;
  /** The agent waits on the user rather than working. */
  readonly waitingOnYou: boolean;
}

/**
 * What the agent is doing and will do next: a pending request outranks the plan,
 * then the newest checklist's running step (or its first pending one) and the step after it.
 */
export function threadNowNext(input: {
  readonly plans: ReadonlyArray<OrchestrationV2PlanArtifact>;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly working: boolean;
}): ThreadNowNext {
  const checklist = input.plans.findLast(
    (plan) => plan.kind === "todo_list" && plan.status !== "superseded",
  );
  const steps = checklist?.kind === "todo_list" ? checklist.steps : [];
  const runningIndex = steps.findIndex((step) => step.status === "running");
  const currentIndex =
    runningIndex !== -1 ? runningIndex : steps.findIndex((step) => step.status === "pending");
  const current = currentIndex === -1 ? null : steps[currentIndex]!;
  const next =
    currentIndex === -1
      ? null
      : (steps.slice(currentIndex + 1).find((step) => step.status === "pending")?.text ?? null);
  if (input.hasPendingApprovals || input.hasPendingUserInput) {
    return {
      now: input.hasPendingApprovals ? "Waiting for your approval" : "Waiting for your answer",
      next: current?.text ?? next,
      waitingOnYou: true,
    };
  }
  if (current === null) {
    return { now: input.working ? "Working" : null, next: null, waitingOnYou: false };
  }
  return {
    now: input.working || current.status === "running" ? current.text : null,
    next: input.working || current.status === "running" ? next : current.text,
    waitingOnYou: false,
  };
}

export interface UncommittedFile {
  readonly path: string;
  readonly name: string;
  readonly additions: number;
  readonly deletions: number;
}

function splitPath(path: string): { directory: string; name: string } {
  const slash = path.lastIndexOf("/");
  return slash === -1
    ? { directory: "", name: path }
    : { directory: path.slice(0, slash + 1), name: path.slice(slash + 1) };
}

/** The working tree's uncommitted files, grouped by folder in path order. */
export function groupUncommittedFiles(
  files: ReadonlyArray<{
    readonly path: string;
    readonly insertions: number;
    readonly deletions: number;
  }>,
) {
  const directories = new Map<string, UncommittedFile[]>();
  for (const file of files.toSorted((left, right) => left.path.localeCompare(right.path))) {
    const { directory, name } = splitPath(file.path);
    const list = directories.get(directory) ?? [];
    list.push({ path: file.path, name, additions: file.insertions, deletions: file.deletions });
    directories.set(directory, list);
  }
  return [...directories].map(([directory, list]) => ({ directory, files: list }));
}

/** A file's share of the largest change, in quarters, so tiny edits still show a sliver. */
export function changeBarQuarters(lines: number, largest: number): number {
  if (lines <= 0 || largest <= 0) return 0;
  return Math.max(1, Math.round((lines / largest) * 4));
}

export interface PatchFileStat {
  readonly path: string;
  readonly kind: "added" | "deleted" | "renamed" | "modified";
  readonly additions: number;
  readonly deletions: number;
}

function patchPath(raw: string): string | null {
  const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  if (unquoted === "/dev/null") return null;
  return unquoted.replace(/^[ab]\//, "");
}

/**
 * Per-file line counts from a unified diff. Hunk headers bound each hunk so a removed line that
 * starts with `--` is never mistaken for the next file's header.
 */
export function parsePatchFileStats(
  patch: string,
  omitted: ReadonlyArray<{ path: string; additions: number; deletions: number }> = [],
): ReadonlyArray<PatchFileStat> {
  type Entry = { path: string; kind: PatchFileStat["kind"]; additions: number; deletions: number };
  const files: Entry[] = [];
  let current: Entry | null = null;
  let currentHasHunk = false;
  let oldLeft = 0;
  let newLeft = 0;
  for (const line of patch.split("\n")) {
    if (current !== null && (oldLeft > 0 || newLeft > 0)) {
      if (line.startsWith("+")) {
        current.additions += 1;
        newLeft -= 1;
      } else if (line.startsWith("-")) {
        current.deletions += 1;
        oldLeft -= 1;
      } else if (!line.startsWith("\\")) {
        oldLeft -= 1;
        newLeft -= 1;
      }
      continue;
    }
    const gitHeader = line.startsWith("diff --git ") ? line.slice("diff --git ".length) : null;
    // Plain unified diffs have no `diff --git` line, so their `---` header opens the next file.
    if (gitHeader !== null || (line.startsWith("--- ") && (current === null || currentHasHunk))) {
      const split = gitHeader?.lastIndexOf(" b/") ?? -1;
      current = {
        path:
          gitHeader === null
            ? ""
            : (patchPath(split === -1 ? gitHeader : gitHeader.slice(split + 1)) ?? ""),
        kind: "modified",
        additions: 0,
        deletions: 0,
      };
      currentHasHunk = false;
      files.push(current);
      if (gitHeader !== null) continue;
    }
    if (current === null) continue;
    if (line.startsWith("--- ")) {
      const path = patchPath(line.slice(4).trim());
      if (path === null) current.kind = "added";
      else if (current.path === "") current.path = path;
    } else if (line.startsWith("+++ ")) {
      const path = patchPath(line.slice(4).trim());
      if (path === null) current.kind = "deleted";
      else current.path = path;
    } else if (line.startsWith("new file mode")) {
      current.kind = "added";
    } else if (line.startsWith("deleted file mode")) {
      current.kind = "deleted";
    } else if (line.startsWith("rename to ")) {
      current.kind = "renamed";
      current.path = line.slice("rename to ".length);
    } else if (line.startsWith("@@")) {
      const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
      currentHasHunk = true;
      oldLeft = hunk === null ? 0 : Number(hunk[1] ?? 1);
      newLeft = hunk === null ? 0 : Number(hunk[2] ?? 1);
    }
  }
  const listed = new Set(files.map((file) => file.path));
  for (const file of omitted) {
    if (!listed.has(file.path)) files.push({ ...file, kind: "modified" });
  }
  return files.filter((file) => file.path !== "");
}

export interface ThreadPullRequestFileGroup<Link> {
  readonly link: Link;
  readonly key: string;
  readonly expandedByDefault: boolean;
}

type FileGroupLink = {
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly linkedAt: string;
  readonly source: string;
  readonly snapshot: {
    readonly state: string;
    readonly isDraft: boolean;
    readonly updatedAt: string | null;
  } | null;
};

function pullRequestRank(link: FileGroupLink): number {
  const state = link.snapshot?.state ?? "open";
  if (state === "open") return link.snapshot?.isDraft === true ? 1 : 0;
  return state === "merged" ? 2 : 3;
}

function updatedAtMs(link: FileGroupLink): number {
  const ms = Date.parse(link.snapshot?.updatedAt ?? link.linkedAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Open pull requests first and expanded, then drafts, merged, and closed, newest first in each. */
export function threadPullRequestFileGroups<Link extends FileGroupLink>(
  links: ReadonlyArray<Link>,
  limit: number,
): { readonly groups: ReadonlyArray<ThreadPullRequestFileGroup<Link>>; readonly hidden: number } {
  const ordered = links
    .filter((link) => link.source !== "stack-dismissed")
    .toSorted(
      (left, right) =>
        pullRequestRank(left) - pullRequestRank(right) || updatedAtMs(right) - updatedAtMs(left),
    );
  return {
    groups: ordered.slice(0, limit).map((link) => ({
      link,
      key: `${link.host.toLowerCase()}/${link.repository.toLowerCase()}#${link.number}`,
      expandedByDefault: pullRequestRank(link) <= 1,
    })),
    hidden: Math.max(0, ordered.length - limit),
  };
}

/**
 * A pull request link that names one file, in the anchors the PR panel reveals: GitHub's
 * `files#diff-<sha256>` and GitLab's `diffs?file=<sha1>`. Other hosts get the pull request itself.
 */
export function pullRequestFileUrl(pullRequestUrl: string, path: string): string {
  let url: URL;
  try {
    url = new URL(pullRequestUrl);
  } catch {
    return pullRequestUrl;
  }
  const base = url.pathname.replace(/\/+$/, "");
  if (/\/pull\/\d+$/.test(base)) {
    url.pathname = `${base}/files`;
    url.hash = `diff-${bytesToHex(sha256(utf8ToBytes(path)))}`;
    return url.toString();
  }
  if (/\/-\/merge_requests\/\d+$/.test(base)) {
    url.pathname = `${base}/diffs`;
    url.search = `?file=${bytesToHex(sha1(utf8ToBytes(path)))}`;
    url.hash = "";
    return url.toString();
  }
  return pullRequestUrl;
}
