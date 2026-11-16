import { Toolbar } from "@base-ui/react/toolbar";
import { type ProviderInstanceId } from "@t3tools/contracts";
import { HistoryIcon, StarIcon } from "lucide-react";
import { Fragment, memo, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  isProviderInstancePickerReady,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { headlineWindow, usageTextClass } from "../usage/providerUsageHeadline";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

export type ModelPickerTab = ProviderInstanceId | "favorites" | "recent";

function describeUnavailableInstance(entry: ProviderInstanceEntry): string {
  const label = entry.displayName;
  // An unavailable instance (a driver this build lacks or the policy leaves out) says why instead.
  if ((!entry.enabled && entry.isAvailable) || entry.status === "disabled") {
    return `${label}: Disabled in settings.`;
  }
  if (entry.status === "ready" && entry.isAvailable) {
    return label;
  }
  const kind =
    entry.status === "error" ? "Unavailable" : entry.status === "warning" ? "Limited" : "Not ready";
  const msg = entry.snapshot.message?.trim();
  return msg ? `${label}: ${kind}. ${msg}` : `${label}: ${kind}.`;
}

const RAIL_ITEM =
  "flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.09] aria-pressed:bg-foreground/[0.09] aria-pressed:text-foreground max-md:w-auto";

function RailCount(props: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "ms-auto shrink-0 ps-1 text-muted-foreground text-xs tabular-nums",
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}

/**
 * Favorites, Recent and each provider by name with its headline usage. Below `md` it becomes a
 * scrolling strip over the list, so the picker collapses to one column.
 */
export const ModelPickerRail = memo(function ModelPickerRail(props: {
  selectedTab: ModelPickerTab;
  onSelectTab: (tab: ModelPickerTab) => void;
  onFocusSearch: () => void;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  favoriteCount: number;
  recentCount: number;
  disabledInstanceIds?: ReadonlySet<ProviderInstanceId>;
  selectableUnavailableInstanceIds?: ReadonlySet<ProviderInstanceId>;
  getDisabledInstanceTooltip?: (entry: ProviderInstanceEntry) => string;
}) {
  const narrow = useMediaQuery("max-md");
  return (
    <Toolbar.Root
      className="flex shrink-0 flex-col overflow-hidden md:w-44 md:border-e md:border-border/70 max-md:border-b max-md:border-border/70"
      data-model-picker-sidebar="true"
      aria-label="Providers"
      orientation={narrow ? "horizontal" : "vertical"}
      onKeyDown={(event) => {
        if (narrow || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          props.onFocusSearch();
        }
      }}
    >
      <div className="flex min-h-0 flex-1 gap-0.5 overscroll-contain p-1.5 md:flex-col md:overflow-y-auto max-md:overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            ["favorites", "Favorites", props.favoriteCount],
            ["recent", "Recent", props.recentCount],
          ] as const
        ).map(([tab, label, count]) => (
          <Toolbar.Button
            key={tab}
            type="button"
            className={RAIL_ITEM}
            data-model-picker-provider={tab}
            aria-label={label}
            aria-pressed={props.selectedTab === tab}
            onClick={() => props.onSelectTab(tab)}
          >
            {tab === "favorites" ? (
              <StarIcon aria-hidden className="size-4 shrink-0 fill-current text-warning" />
            ) : (
              <HistoryIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{label}</span>
            <RailCount>{count}</RailCount>
          </Toolbar.Button>
        ))}
        <div className="px-2 pt-2.5 pb-1 text-muted-foreground text-xs max-md:hidden">
          Providers
        </div>
        {props.instanceEntries.map((entry) => {
          const isUnavailable = !isProviderInstancePickerReady(entry);
          const isContextDisabled = props.disabledInstanceIds?.has(entry.instanceId) ?? false;
          const reachable = props.selectableUnavailableInstanceIds?.has(entry.instanceId) ?? false;
          const isDisabled = (isUnavailable && !reachable) || isContextDisabled;
          const tooltip = isUnavailable
            ? describeUnavailableInstance(entry)
            : isContextDisabled
              ? (props.getDisabledInstanceTooltip?.(entry) ?? null)
              : null;
          const window = isUnavailable ? null : headlineWindow(entry.snapshot);
          const used = window ? Math.round(window.usedPercent) : null;
          const button = (
            <Toolbar.Button
              type="button"
              className={cn(
                RAIL_ITEM,
                isDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
              data-model-picker-provider={entry.instanceId}
              data-provider-accent-color={entry.accentColor}
              onClick={() => !isDisabled && props.onSelectTab(entry.instanceId)}
              disabled={isDisabled}
              focusableWhenDisabled={!isDisabled}
              aria-pressed={props.selectedTab === entry.instanceId}
              aria-label={tooltip ?? entry.displayName}
            >
              <ProviderInstanceIcon
                driverKind={entry.driverKind}
                displayName={entry.displayName}
                accentColor={entry.accentColor}
                acpRegistryAgentId={entry.acpRegistryAgentId}
                acpRegistryIconUrl={entry.acpRegistryIconUrl}
                showBadge={shouldShowInstanceBadge(entry, props.instanceEntries)}
                className="size-4"
                iconClassName="size-4"
                indicatorBackground="var(--popover)"
                badgeClassName="right-[-0.125rem] bottom-[-0.125rem] h-3 min-w-3 px-0.5 text-5xs"
              />
              <span className="truncate">{entry.displayName}</span>
              {isUnavailable && reachable ? (
                <RailCount>Set up</RailCount>
              ) : used !== null ? (
                <RailCount className={usageTextClass(used, "text-muted-foreground")}>
                  {used}%
                </RailCount>
              ) : null}
            </Toolbar.Button>
          );
          return tooltip ? (
            <Tooltip key={entry.instanceId}>
              <TooltipTrigger
                render={isDisabled ? <span className="block shrink-0">{button}</span> : button}
              />
              <TooltipPopup side="left" sideOffset={8} align="center">
                {tooltip}
              </TooltipPopup>
            </Tooltip>
          ) : (
            <Fragment key={entry.instanceId}>{button}</Fragment>
          );
        })}
      </div>
    </Toolbar.Root>
  );
});
