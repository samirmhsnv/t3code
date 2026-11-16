import { UsageDay, UsageProviderKind } from "@t3tools/contracts";
import type { ProviderTotals } from "@t3tools/shared/usageMerge";
import * as Schema from "effect/Schema";

import { useNowMinute } from "../hooks/useNowMinute";
import { useUsage } from "../state/usage";
import { PROVIDER_PRESENTATION } from "./usage/usageProviders";

const USAGE_WINDOW_DAYS = 30;
const isUsageProviderKind = Schema.is(UsageProviderKind);

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Cost and tokens per provider driver over the last 30 days, merged across environments.
 * The window only changes at midnight, so this reads each server's cached scan once a day.
 */
export function useThirtyDayProviderUsage(): ReadonlyMap<string, ProviderTotals> {
  const today = new Date(Date.parse(useNowMinute()));
  const since = new Date(today);
  since.setDate(since.getDate() - (USAGE_WINDOW_DAYS - 1));
  const { merged } = useUsage({
    sinceDay: UsageDay.make(localDay(since)),
    untilDay: UsageDay.make(localDay(today)),
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    provisional: true,
  });
  const byDriver = new Map<string, ProviderTotals>();
  for (const totals of merged.providers) {
    if (!isUsageProviderKind(totals.provider)) continue;
    byDriver.set(PROVIDER_PRESENTATION[totals.provider].driverKind, totals);
  }
  return byDriver;
}

export function formatUsageCost(costUsd: number): string {
  if (costUsd >= 1e6) return `$${(costUsd / 1e6).toFixed(1)}M`;
  if (costUsd >= 1e3) return `$${(costUsd / 1e3).toFixed(costUsd >= 1e4 ? 1 : 2)}K`;
  return costUsd >= 100 ? `$${Math.round(costUsd)}` : `$${costUsd.toFixed(2)}`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(1)}B`;
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`;
  if (tokens >= 1e3) return `${Math.round(tokens / 1e3)}K`;
  return String(tokens);
}

/** The label a usage provider kind is shown under, for providers without a limit item. */
export function usageProviderLabel(driverKind: string): string {
  for (const presentation of Object.values(PROVIDER_PRESENTATION)) {
    if (presentation.driverKind === driverKind) return presentation.label;
  }
  return driverKind;
}
