import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { useParams } from "@tanstack/react-router";
import type { EnvironmentId, ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";
import { CpuIcon, MemoryStickIcon } from "lucide-react";
import { type ComponentProps, useContext, useEffect } from "react";

import { cn } from "~/lib/utils";
import { useNowMinute } from "../hooks/useNowMinute";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { primaryServerProvidersAtom, serverEnvironment } from "../state/server";
import { ProviderInstanceIcon } from "./chat/ProviderInstanceIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const HOST_STATS_REFRESH_MS = 10_000;

/** The limit the bar shows for a provider: its weekly window, else its first. */
function headlineWindow(provider: ServerProvider): ServerProviderUsageWindow | null {
  const windows = provider.usageLimits?.windows ?? [];
  return windows.find((window) => window.kind === "weekly") ?? windows[0] ?? null;
}

function formatResetsIn(resetsAt: string | undefined, now: number): string | null {
  if (resetsAt === undefined) return null;
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60_000));
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))}d`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/** Provider limits on the left, machine load on the right. */
export function StatusBar() {
  const providers = useAtomValue(primaryServerProvidersAtom);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const routeEnvironmentId = useParams({
    strict: false,
    select: (params) => (params as { environmentId?: EnvironmentId }).environmentId ?? null,
  });
  const { presentationById } = useEnvironments();
  const now = Date.parse(useNowMinute());
  const limited = providers.filter(
    (provider) => provider.enabled && provider.installed && headlineWindow(provider) !== null,
  );
  // A thread on another machine (a devbox) shows that machine's load beside this one.
  const remoteEnvironmentId =
    routeEnvironmentId !== null && routeEnvironmentId !== primaryEnvironmentId
      ? routeEnvironmentId
      : null;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-2 overflow-hidden border-t border-border/60 bg-background px-3 text-2xs text-muted-foreground tabular-nums">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {limited.map((provider) => (
          <ProviderLimit key={provider.instanceId} provider={provider} now={now} />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {primaryEnvironmentId !== null ? (
          <HostStats environmentId={primaryEnvironmentId} label={null} />
        ) : null}
        {remoteEnvironmentId !== null ? (
          <HostStats
            environmentId={remoteEnvironmentId}
            label={presentationById.get(remoteEnvironmentId)?.entry.target.label ?? "Remote"}
          />
        ) : null}
      </div>
    </footer>
  );
}

function ProviderLimit({ provider, now }: { provider: ServerProvider; now: number }) {
  const window = headlineWindow(provider)!;
  const used = Math.round(window.usedPercent);
  const resetsIn = formatResetsIn(window.resetsAt, now);
  const name = provider.displayName ?? provider.driver;
  return (
    <Tooltip>
      <TooltipTrigger render={<StatusItem />}>
        <ProviderInstanceIcon
          driverKind={provider.driver}
          displayName={name}
          accentColor={provider.accentColor}
          size="compact"
        />
        <UsageMeter percent={used} />
        <span className={cn("font-medium", usageTextClass(used))}>{used}%</span>
        {resetsIn !== null ? <span>{resetsIn}</span> : null}
      </TooltipTrigger>
      <TooltipPopup side="top">
        <div className="flex min-w-44 flex-col gap-1.5">
          <span className="font-medium">{name}</span>
          {(provider.usageLimits?.windows ?? []).map((limit) => {
            const limitUsed = Math.round(limit.usedPercent);
            const limitResetsIn = formatResetsIn(limit.resetsAt, now);
            return (
              <span key={limit.id} className="flex items-center gap-2 tabular-nums">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{limit.label}</span>
                <UsageMeter percent={limitUsed} />
                <span className={usageTextClass(limitUsed)}>{limitUsed}%</span>
                {limitResetsIn !== null ? (
                  <span className="text-muted-foreground">resets in {limitResetsIn}</span>
                ) : null}
              </span>
            );
          })}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}

function usageTextClass(percent: number): string {
  return percent >= 90 ? "text-warning-foreground" : "text-foreground";
}

/** A hoverable bar segment; tooltips anchor to it. */
function StatusItem(props: ComponentProps<"span">) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex h-5 shrink-0 cursor-default items-center gap-1.5 rounded px-1 hover:bg-accent hover:text-foreground",
        props.className,
      )}
    />
  );
}

function UsageMeter({ percent }: { percent: number }) {
  return (
    <span aria-hidden className="h-1 w-6 shrink-0 overflow-hidden rounded-full bg-muted">
      <span
        className={cn(
          "block h-full rounded-full",
          percent >= 90 ? "bg-warning" : "bg-foreground/60",
        )}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </span>
  );
}

function formatGigabytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function HostStats({
  environmentId,
  label,
}: {
  environmentId: EnvironmentId;
  label: string | null;
}) {
  const registry = useContext(RegistryContext);
  const atom = serverEnvironment.hostResources({ environmentId, input: {} });
  const result = useAtomValue(atom);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls the host's load while the bar is mounted
  useEffect(() => {
    const timer = setInterval(() => registry.refresh(atom), HOST_STATS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [registry, atom]);
  if (result._tag !== "Success") return null;
  const { cpuUtilization, cpuCount, availableMemoryBytes, totalMemoryBytes } = result.value;
  const machine = label ?? "This machine";
  const usedMemoryBytes = totalMemoryBytes - availableMemoryBytes;
  const memory =
    totalMemoryBytes > 0 ? Math.round((usedMemoryBytes / totalMemoryBytes) * 100) : null;
  const cpu = cpuUtilization === null ? null : Math.round(cpuUtilization * 100);
  return (
    <span className="inline-flex items-center gap-1">
      {label !== null ? <span className="px-1 text-foreground">{label}</span> : null}
      {cpu !== null ? (
        <Tooltip>
          <TooltipTrigger render={<StatusItem />}>
            <CpuIcon aria-label="CPU" className="size-3" />
            <span className={usageTextClass(cpu)}>{cpu}%</span>
          </TooltipTrigger>
          <TooltipPopup side="top">
            {machine} CPU: {cpu}% across {cpuCount} cores
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {memory !== null ? (
        <Tooltip>
          <TooltipTrigger render={<StatusItem />}>
            <MemoryStickIcon aria-label="Memory" className="size-3" />
            <span className={usageTextClass(memory)}>{memory}%</span>
          </TooltipTrigger>
          <TooltipPopup side="top">
            {machine} memory: {formatGigabytes(usedMemoryBytes)} of{" "}
            {formatGigabytes(totalMemoryBytes)} used
          </TooltipPopup>
        </Tooltip>
      ) : null}
    </span>
  );
}
