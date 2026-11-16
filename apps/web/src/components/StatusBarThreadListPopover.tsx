import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { CloudIcon, MonitorIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { useMediaQuery } from "../hooks/useMediaQuery";
import { usePrimaryEnvironment } from "../state/environments";
import { useProjects, useQuietThreadShells } from "../state/entities";
import type { SidebarThreadSummary } from "../types";
import { RelativeTime } from "./RelativeTime";
import {
  STATUS_BAR_THREAD_LIST_LIMIT,
  statusBarThreadList,
  type StatusBarThreadBucket,
} from "./statusBarThreadList.logic";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";

const BUCKET_TITLES: Record<StatusBarThreadBucket, string> = {
  "needs-you": "Needs you",
  working: "Working",
  unread: "Unread",
};

/** One status bar count that lists its threads on hover (fine pointers) or click. */
export function StatusBarThreadListPopover({
  bucket,
  count,
  countLabel,
  unreadKeys,
  keyOf,
  onOpen,
  trigger,
  children,
}: {
  bucket: StatusBarThreadBucket;
  count: number;
  /** Shown in the header after the count, such as "of 8". */
  countLabel?: string;
  unreadKeys: ReadonlyArray<string>;
  keyOf: (thread: SidebarThreadSummary) => string;
  onOpen: (ref: ScopedThreadRef) => void;
  trigger: ReactElement;
  children: ReactNode;
}) {
  const finePointer = useMediaQuery({ pointer: "fine" });
  return (
    <Popover>
      <PopoverTrigger openOnHover={finePointer} delay={150} render={trigger}>
        {children}
      </PopoverTrigger>
      <PopoverPopup side="top" align="end" padding="compact" className="w-80">
        <div className="flex items-baseline gap-1.5 px-1 pb-1.5 text-xs">
          <span className="font-medium">{BUCKET_TITLES[bucket]}</span>
          <span className="text-muted-foreground tabular-nums">
            · {count}
            {countLabel ? ` ${countLabel}` : null}
          </span>
        </div>
        {/* Mounted only while open, so the list is built on demand. */}
        <StatusBarThreadListRows
          bucket={bucket}
          unreadKeys={unreadKeys}
          keyOf={keyOf}
          onOpen={onOpen}
        />
      </PopoverPopup>
    </Popover>
  );
}

function StatusBarThreadListRows({
  bucket,
  unreadKeys,
  keyOf,
  onOpen,
}: {
  bucket: StatusBarThreadBucket;
  unreadKeys: ReadonlyArray<string>;
  keyOf: (thread: SidebarThreadSummary) => string;
  onOpen: (ref: ScopedThreadRef) => void;
}) {
  const shells = useQuietThreadShells();
  const projects = useProjects();
  const primaryEnvironmentId = usePrimaryEnvironment()?.environmentId ?? null;
  const rows = statusBarThreadList(bucket, shells, unreadKeys, keyOf);
  if (rows.length === 0) {
    return <p className="px-1 pb-1 text-xs text-muted-foreground">No threads</p>;
  }
  const projectTitles = new Map(
    projects.map((project) => [
      scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
      project.title,
    ]),
  );
  const hidden = rows.length - STATUS_BAR_THREAD_LIST_LIMIT;
  return (
    <ul className="flex flex-col">
      {rows.slice(0, STATUS_BAR_THREAD_LIST_LIMIT).map(({ thread, at }) => {
        const remote =
          primaryEnvironmentId !== null && thread.environmentId !== primaryEnvironmentId;
        const LocationIcon = remote ? CloudIcon : MonitorIcon;
        return (
          <li key={keyOf(thread)}>
            <button
              type="button"
              className="flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => onOpen({ environmentId: thread.environmentId, threadId: thread.id })}
            >
              <LocationIcon
                aria-label={remote ? "Runs on a remote machine" : "Runs on this device"}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="max-w-24 shrink-0 truncate text-muted-foreground">
                {projectTitles.get(
                  scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
                ) ?? ""}
              </span>
              <span className="min-w-0 flex-1 truncate">{thread.title}</span>
              {at === null ? null : (
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  <RelativeTime timestamp={at} />
                </span>
              )}
            </button>
          </li>
        );
      })}
      {hidden > 0 ? (
        <li className="px-1 pt-1 text-xs text-muted-foreground">+{hidden} more</li>
      ) : null}
    </ul>
  );
}
