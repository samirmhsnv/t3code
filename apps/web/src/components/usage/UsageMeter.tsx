import { cn } from "~/lib/utils";
import { usageLevel } from "./providerUsageHeadline";

export function UsageMeter({ percent, className }: { percent: number; className?: string }) {
  const level = usageLevel(percent);
  return (
    <span
      aria-hidden
      className={cn("h-1 w-6 shrink-0 overflow-hidden rounded-full bg-muted", className)}
    >
      <span
        className={cn(
          "block h-full rounded-full",
          level === "critical"
            ? "bg-error"
            : level === "warning"
              ? "bg-warning"
              : "bg-foreground/60",
        )}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </span>
  );
}
