import type { ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";
import { formatResetsIn } from "@t3tools/shared/usageLimits";
import { memo, useState } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { barColor } from "../usage/UsageLimits";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

const SHORT_LABEL: Record<ServerProviderUsageWindow["kind"], string | null> = {
  session: "5h",
  weekly: "W",
  monthly: "Mo",
  other: null,
};

/** The main allowance per kind; Claude's model-scoped weekly rows follow its main weekly row. */
function mainWindows(provider: ServerProvider): ServerProviderUsageWindow[] {
  const seen = new Set<string>();
  return (provider.usageLimits?.windows ?? []).filter((window) => {
    if (SHORT_LABEL[window.kind] === null || seen.has(window.kind)) return false;
    seen.add(window.kind);
    return true;
  });
}

function providerName(provider: ServerProvider): string {
  return provider.displayName ?? provider.instanceId;
}

function UsageTooltipBody({
  provider,
  windows,
}: {
  readonly provider: ServerProvider;
  readonly windows: readonly ServerProviderUsageWindow[];
}) {
  // Mounted when the tooltip opens, so the reset times are current for that opening.
  const [now] = useState(() => Date.now());
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{providerName(provider)}</span>
      {windows.map((window) => {
        const resetsIn = formatResetsIn(window, now);
        return (
          <span key={window.id}>
            {window.label}: {Math.round(window.usedPercent)}% used{resetsIn ? `, ${resetsIn}` : ""}
          </span>
        );
      })}
    </div>
  );
}

function WindowMeter({
  window,
  color,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly color: string;
}) {
  const used = Math.round(window.usedPercent);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground/60">{SHORT_LABEL[window.kind]}</span>
      <span className="relative h-1 w-8 overflow-hidden rounded-full bg-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${used}%`,
            backgroundColor: used >= 90 ? "var(--destructive)" : color,
          }}
        />
      </span>
      <span className={cn("tabular-nums", used >= 90 && "text-destructive")}>{used}%</span>
    </span>
  );
}

/** One line of every enabled provider's current subscription limits. */
export const ComposerUsageStrip = memo(function ComposerUsageStrip({
  providers,
}: {
  readonly providers: readonly ServerProvider[];
}) {
  const entries = providers.flatMap((provider) => {
    if (!provider.enabled || provider.usageLimits?.unavailable) return [];
    const windows = mainWindows(provider);
    return windows.length > 0 ? [{ provider, windows }] : [];
  });
  if (entries.length === 0) return null;

  return (
    <div className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground/70 sm:flex">
      {entries.map(({ provider, windows }) => (
        <Tooltip key={provider.instanceId}>
          <TooltipTrigger
            render={
              <span
                role="img"
                aria-label={`${providerName(provider)} usage`}
                className="inline-flex items-center gap-1.5"
              />
            }
          >
            <ProviderInstanceIcon
              driverKind={provider.driver}
              displayName={providerName(provider)}
              accentColor={provider.accentColor}
              className="size-3.5"
              iconClassName="size-3.5"
              showBadge={false}
            />
            {windows.map((window) => (
              <WindowMeter key={window.id} window={window} color={barColor(provider.driver)} />
            ))}
          </TooltipTrigger>
          <TooltipPopup side="top">
            <UsageTooltipBody provider={provider} windows={windows} />
          </TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
});
