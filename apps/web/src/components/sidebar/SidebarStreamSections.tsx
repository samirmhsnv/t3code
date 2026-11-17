import type { ReactNode } from "react";

/** A quiet label with a count that opens a stream section. */
export function SidebarStreamHeader(props: { label: string; count: number; trailing?: ReactNode }) {
  return (
    <li
      data-testid={`sidebar-stream-header-${props.label.toLowerCase().replaceAll(" ", "-")}`}
      className="mt-3 flex h-6 list-none items-center gap-1.5 px-(--sidebar-row-content-inset) text-xs font-medium text-sidebar-muted-foreground first:mt-0"
    >
      <span>{props.label}</span>
      <span className="font-normal tabular-nums opacity-70">{props.count}</span>
      {props.trailing ? <span className="ml-auto font-normal">{props.trailing}</span> : null}
    </li>
  );
}
