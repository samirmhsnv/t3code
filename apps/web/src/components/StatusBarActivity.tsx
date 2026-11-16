import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { useRouter } from "@tanstack/react-router";
import { executeAtomQuery } from "@t3tools/client-runtime/state/runtime";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { BotIcon, CircleAlertIcon, MailIcon } from "lucide-react";
import { Atom } from "effect/reactivity";
import { type ComponentProps, useContext, useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { useEnvironments } from "../state/environments";
import { useQuietThreadShells } from "../state/entities";
import { useUiStateStore } from "../uiStateStore";
import { useClientSettings } from "../hooks/useSettings";
import { StatusBarThreadListPopover } from "./StatusBarThreadListPopover";
import { threadNeedsYou } from "./statusBarThreadList.logic";
import { hasUnseenCompletion, resolveThreadLastVisitedAt } from "./Sidebar.logic";
import { serverEnvironment } from "../state/server";
import { environmentThreadShells } from "../state/threads";
import { buildThreadRouteParams } from "../threadRoutes";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const CONNECTION_PROBE_MS = 3_000;
const SLOW_CONNECTION_MS = 300;

interface ThreadActivity {
  readonly needsYou: number;
  readonly working: number;
}

// Counts only: the bar re-renders when a number changes, not on every shell update.
const threadActivityAtom = Atom.make((get): ThreadActivity => {
  let needsYou = 0;
  let working = 0;
  for (const thread of get(environmentThreadShells.quietThreadShellsAtom)) {
    if (threadNeedsYou(thread)) needsYou += 1;
    else if (isThreadWorking(thread)) working += 1;
  }
  return { needsYou, working };
}).pipe(
  Atom.withEquality(
    (previous: ThreadActivity, next: ThreadActivity) =>
      previous.needsYou === next.needsYou && previous.working === next.working,
  ),
);

function ActivityItem(props: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded px-1 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        props.className,
      )}
    />
  );
}

function shellKey(thread: { environmentId: EnvironmentId; id: ThreadId }): string {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

function threadRef(thread: { environmentId: EnvironmentId; id: ThreadId }): ScopedThreadRef {
  return { environmentId: thread.environmentId, threadId: thread.id };
}

// Finished runs the user has not opened since, newest first.
function useUnreadThreads(): readonly ScopedThreadRef[] {
  const shells = useQuietThreadShells();
  const localVisits = useUiStateStore((state) => state.threadLastVisitedAtById);
  return shells
    .filter((thread) =>
      hasUnseenCompletion({
        ...thread,
        lastVisitedAt: resolveThreadLastVisitedAt(
          thread.lastVisitedAt,
          localVisits[scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))],
        ),
      }),
    )
    .toSorted((left, right) =>
      (right.latestRun?.completedAt ?? "").localeCompare(left.latestRun?.completedAt ?? ""),
    )
    .map(threadRef);
}

/** Threads waiting on you, agents working, and unread results, across every machine. */
export function StatusBarThreadActivity() {
  const router = useRouter();
  const { needsYou, working } = useAtomValue(threadActivityAtom);
  const capacity = useClientSettings((settings) => settings.agentCapacityLimit);
  const unread = useUnreadThreads();
  const open = (ref: ScopedThreadRef) => {
    void router.navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
  const unreadKeys = unread.map(scopedThreadKey);
  const shared = { unreadKeys, keyOf: shellKey, onOpen: open };
  return (
    <>
      <StatusBarThreadListPopover
        bucket="needs-you"
        count={needsYou}
        {...shared}
        trigger={
          <ActivityItem
            className={cn(needsYou > 0 && "text-warning-foreground")}
            disabled={needsYou === 0}
          />
        }
      >
        <CircleAlertIcon aria-hidden className="size-3" />
        {needsYou}
      </StatusBarThreadListPopover>
      <StatusBarThreadListPopover
        bucket="working"
        count={working}
        countLabel={`of ${capacity}`}
        {...shared}
        trigger={<ActivityItem aria-label={`${working} of ${capacity} agents working`} />}
      >
        <BotIcon aria-hidden className="size-3" />
        {working}/{capacity}
      </StatusBarThreadListPopover>
      <StatusBarThreadListPopover
        bucket="unread"
        count={unread.length}
        {...shared}
        trigger={
          <ActivityItem
            className={cn(unread.length > 0 && "text-success-foreground")}
            disabled={unread.length === 0}
          />
        }
      >
        <MailIcon aria-hidden className="size-3" />
        {unread.length}
      </StatusBarThreadListPopover>
    </>
  );
}

/** A remote machine's link: connected, slow or down, timed by the host-stats request. */
export function StatusBarConnectionHealth({ environmentId }: { environmentId: EnvironmentId }) {
  const registry = useContext(RegistryContext);
  const { presentationById } = useEnvironments();
  const presentation = presentationById.get(environmentId);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- times a request to the remote machine on an interval
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const startedAt = performance.now();
      const result = await executeAtomQuery(
        registry,
        serverEnvironment.hostResources({ environmentId, input: {} }),
        { refresh: true, reportFailure: false, signal: AbortSignal.timeout(5_000) },
      );
      if (cancelled) return;
      setLatencyMs(result._tag === "Success" ? Math.round(performance.now() - startedAt) : null);
    };
    void probe();
    const timer = setInterval(() => void probe(), CONNECTION_PROBE_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [registry, environmentId]);

  const phase = presentation?.connection.phase ?? "offline";
  const label = presentation?.entry.target.label ?? "Remote";
  const connected = phase === "connected";
  const dotClassName = !connected
    ? "bg-error"
    : latencyMs !== null && latencyMs >= SLOW_CONNECTION_MS
      ? "bg-warning"
      : "bg-success";
  return (
    <Tooltip>
      <TooltipTrigger render={<ActivityItem className="cursor-default" />}>
        <span aria-hidden className={cn("size-1.5 rounded-full", dotClassName)} />
        {connected && latencyMs !== null ? `${latencyMs} ms` : null}
      </TooltipTrigger>
      <TooltipPopup side="top">
        {label}: {connected ? "connected" : phase}
        {connected && latencyMs !== null ? `, ${latencyMs} ms round trip` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}
