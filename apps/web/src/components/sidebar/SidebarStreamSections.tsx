import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "~/lib/utils";

/** A small uppercase label with a count that opens a stream section. */
export function SidebarStreamHeader(props: { label: string; count: number; trailing?: ReactNode }) {
  return (
    <li
      data-testid={`sidebar-stream-header-${props.label.toLowerCase().replaceAll(" ", "-")}`}
      className="mt-3 flex h-6 list-none items-center gap-1.5 px-(--sidebar-row-content-inset) text-2xs font-medium tracking-wider text-sidebar-muted-foreground uppercase first:mt-0"
    >
      <span>{props.label}</span>
      <span className="font-normal tabular-nums">{props.count}</span>
      {props.trailing ? (
        <span className="ml-auto font-normal tracking-normal normal-case">{props.trailing}</span>
      ) : null}
    </li>
  );
}

export interface SidebarEnvironmentFilterOption {
  readonly value: string;
  readonly label: string;
  readonly connected: boolean | null;
}

/** Client-side environment filter; shown only when threads span environments. */
export function SidebarEnvironmentFilter(props: {
  options: readonly SidebarEnvironmentFilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <li className="mb-1 list-none">
      <div
        role="radiogroup"
        aria-label="Filter threads by environment"
        className="flex flex-wrap gap-1 px-1"
      >
        {props.options.map((option) => {
          const checked = option.value === props.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => props.onChange(option.value)}
              className={cn(
                "inline-flex h-6 max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                checked
                  ? "border-sidebar-border bg-sidebar-row-active text-sidebar-foreground"
                  : "border-transparent text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
              )}
            >
              <span className="truncate">{option.label}</span>
              {option.connected === null ? null : (
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    option.connected ? "bg-success" : "bg-muted-foreground/40",
                  )}
                >
                  <span className="sr-only">{option.connected ? ", connected" : ", offline"}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </li>
  );
}

/** A chevron row that reveals more of a section in place. */
export function SidebarStreamToggleRow(props: {
  rowId: string;
  expanded: boolean;
  label: string;
  detail?: string | undefined;
  onToggle: () => void;
}) {
  return (
    <li className="list-none">
      <button
        type="button"
        data-sidebar-row={props.rowId}
        aria-expanded={props.expanded}
        onClick={props.onToggle}
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-(--sidebar-row-content-inset) text-left text-sm text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ChevronDownIcon
          aria-hidden
          className={cn("size-3.5 shrink-0", !props.expanded && "-rotate-90")}
        />
        <span className="shrink-0">{props.label}</span>
        {props.detail ? (
          <span className="min-w-0 flex-1 truncate text-right text-xs">{props.detail}</span>
        ) : null}
      </button>
    </li>
  );
}

/** Seven bars, one per day, scaled to the busiest day. */
export function SidebarActivityStrip(props: { buckets: readonly number[] }) {
  const max = Math.max(1, ...props.buckets);
  const total = props.buckets.reduce((sum, count) => sum + count, 0);
  return (
    <span
      role="img"
      aria-label={`${total} thread${total === 1 ? "" : "s"} active in the last ${props.buckets.length} days`}
      className="inline-flex h-3 shrink-0 items-end gap-px"
    >
      {props.buckets.map((count, index) => (
        <span
          // oxlint-disable-next-line react/no-array-index-key -- a fixed-length day series
          key={index}
          className={cn("w-0.5 rounded-full", count > 0 ? "bg-info/70" : "bg-muted-foreground/30")}
          style={{ height: count > 0 ? `${Math.max(25, (count / max) * 100)}%` : "1px" }}
        />
      ))}
    </span>
  );
}
