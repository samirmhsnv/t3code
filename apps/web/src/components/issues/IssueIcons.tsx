import type { IssuePerson, IssuePriority, IssueSource, IssueStatus } from "@t3tools/contracts";
import { BellIcon } from "lucide-react";
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

const LINEAR_MARK =
  "M1.23 61.52c-.22-.95.9-1.55 1.6-.86l36.5 36.52c.7.69.1 1.82-.86 1.6A50.07 50.07 0 0 1 1.23 61.52ZM0 46.89a1 1 0 0 0 .29.76L52.35 99.7a1 1 0 0 0 .76.3c2.37-.15 4.7-.46 6.96-.93.77-.16 1.03-1.1.48-1.65L2.58 39.45c-.55-.55-1.5-.29-1.65.48-.47 2.27-.78 4.59-.93 6.96Zm4.21-17.18a1 1 0 0 0 .21 1.1l64.78 64.77a1 1 0 0 0 1.1.21c1.78-.8 3.51-1.7 5.18-2.68.55-.33.64-1.09.18-1.54L8.44 24.34c-.46-.46-1.22-.37-1.54.18-1 1.67-1.9 3.4-2.69 5.19Zm8.45-11.64a.99.99 0 0 1-.04-1.35A49.86 49.86 0 0 1 49.95 0C77.6 0 100 22.4 100 50.05c0 14.84-6.46 28.17-16.72 37.34a.99.99 0 0 1-1.35-.05L12.66 18.07Z";

/** The tracker an issue lives in: Linear's mark, or a bell for Deckbell. */
export function IssueSourceIcon({
  source,
  className,
}: {
  readonly source: IssueSource;
  readonly className?: string;
}) {
  const classes = cn("size-3.5 shrink-0 text-muted-foreground", className);
  if (source === "deckbell") return <BellIcon aria-hidden className={classes} />;
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={classes}>
      <path d={LINEAR_MARK} fill="currentColor" />
    </svg>
  );
}
