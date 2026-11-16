import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { useRouter } from "@tanstack/react-router";
import { executeAtomQuery } from "@t3tools/client-runtime/state/runtime";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { BotIcon, CircleAlertIcon } from "lucide-react";
import { Atom } from "effect/reactivity";
import { type ComponentProps, useContext, useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { useEnvironments } from "../state/environments";
import { serverEnvironment } from "../state/server";
import { environmentThreadShells } from "../state/threads";
import { buildThreadRouteParams } from "../threadRoutes";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const CONNECTION_PROBE_MS = 3_000;
const SLOW_CONNECTION_MS = 300;

interface ThreadActivity {
  readonly needsYou: number;
  readonly nextNeedsYou: ScopedThreadRef | null;
  readonly working: number;
}

// Counts only: the bar re-renders when a number changes, not on every shell update.
const threadActivityAtom = Atom.make((get): ThreadActivity => {
  let needsYou = 0;
  let nextNeedsYou: ScopedThreadRef | null = null;
  let working = 0;
  for (const thread of get(environmentThreadShells.quietThreadShellsAtom)) {
    if (
      thread.hasPendingApprovals ||
      thread.hasPendingUserInput ||
      thread.pendingSubagentRequest != null ||
      (thread.pendingGuestMessageCount ?? 0) > 0
    ) {
      needsYou += 1;
      nextNeedsYou ??= { environmentId: thread.environmentId, threadId: thread.id };
    } else if (isThreadWorking(thread)) {
      working += 1;
    }
  }
  return { needsYou, nextNeedsYou, working };
}).pipe(
  Atom.withEquality(
    (previous: ThreadActivity, next: ThreadActivity) =>
      previous.needsYou === next.needsYou &&
      previous.working === next.working &&
      previous.nextNeedsYou?.threadId === next.nextNeedsYou?.threadId,
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

/** Threads waiting on you, and agents working, across every machine. */
export function StatusBarThreadActivity() {
  const router = useRouter();
  const { needsYou, nextNeedsYou, working } = useAtomValue(threadActivityAtom);
  return (
    <>
      {needsYou > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <ActivityItem
                className="text-warning-foreground"
                onClick={() => {
                  if (nextNeedsYou === null) return;
                  void router.navigate({
                    to: "/$environmentId/$threadId",
                    params: buildThreadRouteParams(nextNeedsYou),
                  });
                }}
              />
            }
          >
            <CircleAlertIcon aria-hidden className="size-3" />
            {needsYou}
          </TooltipTrigger>
          <TooltipPopup side="top">
            {needsYou === 1 ? "1 thread needs" : `${needsYou} threads need`} your approval or input.
            Click to open the next one.
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {working > 0 ? (
        <Tooltip>
          <TooltipTrigger render={<ActivityItem className="cursor-default" />}>
            <BotIcon aria-hidden className="size-3" />
            {working}
          </TooltipTrigger>
          <TooltipPopup side="top">
            {working === 1 ? "1 agent" : `${working} agents`} working
          </TooltipPopup>
        </Tooltip>
      ) : null}
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
