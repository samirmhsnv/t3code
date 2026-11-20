import type {
  EnvironmentId,
  OrchestrationV2CreationSource,
  OrchestrationV2DelegatedFrom,
  OrchestrationV2ThreadShell,
  ThreadId,
} from "@t3tools/contracts";

export type ThreadRole = "main" | "impl" | "rev" | "tri";

export interface ThreadRoleInput {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
  readonly title: string;
  readonly lineage: OrchestrationV2ThreadShell["lineage"];
  readonly delegatedFrom: OrchestrationV2DelegatedFrom | null | undefined;
  readonly creationSource: OrchestrationV2CreationSource | undefined;
}

const REVIEW_TITLE = /\b(review(ing|er)?|code[- ]review|audit)\b/i;
const TRIAGE_TITLE = /\b(triage|investigat(e|ion)|bug report|repro(duce)?)\b/i;

function roleKey(environmentId: EnvironmentId, threadId: ThreadId): string {
  return `${environmentId}:${threadId}`;
}

/** An agent or another thread started it, not someone typing in a client. */
function launchedByAgent(thread: ThreadRoleInput): boolean {
  return (
    thread.delegatedFrom != null ||
    thread.creationSource === "mcp" ||
    thread.creationSource === "provider" ||
    thread.creationSource === "server"
  );
}

/** Threads that launched at least one other listed thread, keyed `environmentId:threadId`. */
export function launchingThreadKeys(threads: Iterable<ThreadRoleInput>): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const thread of threads) {
    if (thread.lineage.relationshipToParent === "subagent" || !launchedByAgent(thread)) continue;
    if (thread.delegatedFrom != null) {
      keys.add(roleKey(thread.delegatedFrom.environmentId, thread.delegatedFrom.threadId));
    } else if (thread.lineage.parentThreadId !== null) {
      keys.add(roleKey(thread.environmentId, thread.lineage.parentThreadId));
    }
  }
  return keys;
}

/** Title keywords name review and triage work; lineage tells a coordinator from its workers. */
export function threadRole(
  thread: ThreadRoleInput,
  launchingKeys: ReadonlySet<string>,
): ThreadRole | null {
  if (REVIEW_TITLE.test(thread.title)) return "rev";
  if (TRIAGE_TITLE.test(thread.title)) return "tri";
  if (launchingKeys.has(roleKey(thread.environmentId, thread.id))) return "main";
  if (launchedByAgent(thread)) return "impl";
  return null;
}
