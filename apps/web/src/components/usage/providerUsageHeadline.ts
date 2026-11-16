import type { ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";

/** The limit a provider is summed up by: its weekly window, else its first. */
export function headlineWindow(
  provider: Pick<ServerProvider, "usageLimits">,
): ServerProviderUsageWindow | null {
  const windows = provider.usageLimits?.windows ?? [];
  return windows.find((window) => window.kind === "weekly") ?? windows[0] ?? null;
}

export function formatResetsIn(resetsAt: string | undefined, now: number): string | null {
  if (resetsAt === undefined) return null;
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60_000));
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))}d`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// Above 70% is a heads-up, above 80% is a problem.
export function usageLevel(percent: number): "ok" | "warning" | "critical" {
  return percent > 80 ? "critical" : percent > 70 ? "warning" : "ok";
}

export function usageTextClass(percent: number, okClass = "text-foreground"): string {
  const level = usageLevel(percent);
  return level === "critical"
    ? "text-error-foreground"
    : level === "warning"
      ? "text-warning-foreground"
      : okClass;
}
