import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftRightIcon, Columns2Icon, XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import { useSplitViewStore } from "../splitViewStore";
import { useQuietThreadShell } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import ChatView from "./ChatView";
import { BackgroundThreadContext } from "./chat/backgroundThread";
import {
  THREAD_CONTEXT_DROP_EVENT,
  threadContextDropTargetProps,
  useThreadContextDragActive,
} from "./chat/threadContextDrag";
import { Button } from "./ui/button";

const PANE_MOTION = { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" } as const;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Shown over the routed thread while a sidebar thread is dragged out; dropping opens the split. */
export function SplitViewDropZone({
  primaryThreadRef,
}: {
  primaryThreadRef: ScopedThreadRef | null;
}) {
  const active = useThreadContextDragActive();
  const zoneRef = useRef<HTMLDivElement>(null);
  const openSplit = useSplitViewStore((store) => store.openSplit);
  const primaryKey = primaryThreadRef ? scopedThreadKey(primaryThreadRef) : null;

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const onDrop = (event: Event) => {
      const [ref] = (event as CustomEvent<ReadonlyArray<ScopedThreadRef>>).detail;
      if (ref && scopedThreadKey(ref) !== primaryKey) openSplit(ref);
    };
    zone.addEventListener(THREAD_CONTEXT_DROP_EVENT, onDrop);
    return () => zone.removeEventListener(THREAD_CONTEXT_DROP_EVENT, onDrop);
  }, [openSplit, primaryKey]);

  return (
    <div
      ref={zoneRef}
      aria-hidden="true"
      // Always mounted so the drop listener exists; hidden zones are skipped by elementFromPoint.
      {...threadContextDropTargetProps()}
      className={cn(
        "absolute inset-y-3 right-3 z-40 flex w-[min(40%,22rem)] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/70 text-sm text-secondary-label backdrop-blur-sm transition-opacity duration-150",
        "data-[thread-context-over=true]:border-primary data-[thread-context-over=true]:bg-primary/10 data-[thread-context-over=true]:text-foreground",
        active ? "opacity-100" : "pointer-events-none invisible opacity-0",
      )}
    >
      <Columns2Icon className="size-5" />
      Open in split view
    </div>
  );
}

/** A thread beside the routed one. Its global shortcuts stand down so they act once. */
export function SplitThreadPane({
  threadRef,
  primaryThreadRef,
}: {
  threadRef: ScopedThreadRef;
  primaryThreadRef: ScopedThreadRef | null;
}) {
  const navigate = useNavigate();
  const thread = useQuietThreadShell(threadRef);
  const replaceSplit = useSplitViewStore((store) => store.replaceSplit);
  const closeSplit = useSplitViewStore((store) => store.closeSplit);
  const paneRef = useRef<HTMLElement>(null);
  const threadKey = scopedThreadKey(threadRef);

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    paneRef.current?.animate(
      [
        { flexGrow: 0, opacity: 0 },
        { flexGrow: 1, opacity: 1 },
      ],
      PANE_MOTION,
    );
  }, []);

  const close = () => {
    const pane = paneRef.current;
    if (!pane || prefersReducedMotion()) {
      closeSplit(threadKey);
      return;
    }
    const animation = pane.animate(
      [
        { flexGrow: 1, opacity: 1 },
        { flexGrow: 0, opacity: 0 },
      ],
      { ...PANE_MOTION, fill: "forwards" },
    );
    animation.onfinish = () => closeSplit(threadKey);
  };

  const makePrimary = () => {
    // Swap before navigating: the route change closes any pane showing the new main thread.
    if (primaryThreadRef) replaceSplit(threadKey, primaryThreadRef);
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(threadRef) });
  };

  if (thread === null || thread.deletedAt != null) return null;

  return (
    <main
      ref={paneRef}
      className="relative flex h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-y-none border-s border-border bg-background surface-grain md:h-dvh"
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border ps-3 pe-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-secondary-label">
          {thread.title}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Make this the main thread"
          title="Make this the main thread"
          onClick={makePrimary}
        >
          <ArrowLeftRightIcon />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Close split view"
          title="Close split view"
          onClick={close}
        >
          <XIcon />
        </Button>
      </div>
      {/* Contains ChatView's fixed header controls below this bar instead of the window edge. */}
      <div className="relative flex min-h-0 flex-1 flex-col [contain:layout]">
        <BackgroundThreadContext value>
          <ChatView
            key={threadKey}
            environmentId={threadRef.environmentId}
            threadId={threadRef.threadId}
            routeKind="server"
          />
        </BackgroundThreadContext>
      </div>
    </main>
  );
}
