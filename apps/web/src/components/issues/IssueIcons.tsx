import type { IssuePerson, IssuePriority, IssueStatus } from "@t3tools/contracts";
import { useState } from "react";

import { cn } from "~/lib/utils";

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  none: "No priority",
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_BARS: Partial<Record<IssuePriority, number>> = { high: 3, medium: 2, low: 1 };

/** Linear's priority glyphs: three bars filled by level, an alert square, or a dashed line. */
export function IssuePriorityIcon({
  priority,
  className,
}: {
  readonly priority: IssuePriority;
  readonly className?: string;
}) {
  const classes = cn("size-3.5 shrink-0", className);
  if (priority === "urgent")
    return (
      <svg viewBox="0 0 16 16" aria-hidden className={cn(classes, "text-warning")}>
        <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
        <rect x="7.25" y="4" width="1.5" height="5" rx="0.75" className="fill-background" />
        <rect x="7.25" y="10.5" width="1.5" height="1.5" rx="0.75" className="fill-background" />
      </svg>
    );
  if (priority === "none")
    return (
      <svg viewBox="0 0 16 16" aria-hidden className={cn(classes, "text-muted-foreground/60")}>
        {[2, 7, 12].map((x) => (
          <rect key={x} x={x} y="7.25" width="2.5" height="1.5" rx="0.5" fill="currentColor" />
        ))}
      </svg>
    );
  const filled = PRIORITY_BARS[priority] ?? 0;
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn(classes, "text-muted-foreground")}>
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1.5 + bar * 5}
          y={10 - bar * 3.5}
          width="3"
          height={4.5 + bar * 3.5}
          rx="1"
          fill="currentColor"
          fillOpacity={bar < filled ? 1 : 0.3}
        />
      ))}
    </svg>
  );
}

/** Linear's status glyphs, in the tracker's own status color. */
export function IssueStatusIcon({
  status,
  className,
}: {
  readonly status: Pick<IssueStatus, "category" | "color">;
  readonly className?: string;
}) {
  const color = status.color ? { color: status.color } : undefined;
  const classes = cn("size-3.5 shrink-0 text-muted-foreground", className);
  switch (status.category) {
    case "triage":
    case "backlog":
      return (
        <svg viewBox="0 0 16 16" aria-hidden className={classes} style={color}>
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2.2 2"
          />
        </svg>
      );
    case "unstarted":
      return (
        <svg viewBox="0 0 16 16" aria-hidden className={classes} style={color}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "started":
      return (
        <svg viewBox="0 0 16 16" aria-hidden className={classes} style={color}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5 A3.5 3.5 0 0 1 8 11.5 Z" fill="currentColor" />
        </svg>
      );
    case "completed":
      return (
        <svg viewBox="0 0 16 16" aria-hidden className={classes} style={color}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5 8.2 7.1 10.2 11 6"
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-background"
          />
        </svg>
      );
    case "canceled":
      return (
        <svg viewBox="0 0 16 16" aria-hidden className={classes} style={color}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5.75 5.75 10.25 10.25 M10.25 5.75 5.75 10.25"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="stroke-background"
          />
        </svg>
      );
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export function IssueAvatar({
  person,
  className,
}: {
  readonly person: IssuePerson | undefined;
  readonly className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const classes = cn("size-4 shrink-0 rounded-full", className);
  if (person === undefined)
    return (
      <span
        aria-hidden
        className={cn(classes, "border border-dashed border-muted-foreground/50")}
      />
    );
  if (person.avatarUrl !== undefined && failed !== person.avatarUrl)
    return (
      <img
        src={person.avatarUrl}
        alt=""
        aria-hidden
        className={cn(classes, "object-cover")}
        onError={() => setFailed(person.avatarUrl ?? null)}
      />
    );
  return (
    <span
      aria-hidden
      className={cn(
        classes,
        "flex items-center justify-center bg-muted text-3xs font-medium text-muted-foreground",
      )}
    >
      {initials(person.name)}
    </span>
  );
}
