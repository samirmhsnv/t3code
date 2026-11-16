import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { useParams } from "@tanstack/react-router";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentId,
  GitHubBillingProductUsage,
  ServerProvider,
  ServerProviderUsageWindow,
  ThreadId,
} from "@t3tools/contracts";
import { CpuIcon, MemoryStickIcon } from "lucide-react";
import { type ComponentProps, useContext, useEffect } from "react";

import { cn } from "~/lib/utils";
import { useNowMinute } from "../hooks/useNowMinute";
import { getSourceControlPresentationForKind } from "../sourceControlPresentation";
import { useProject, useQuietThreadShell } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { useGitHubBillingUsage } from "../state/githubBilling";
import { primaryServerProvidersAtom, serverEnvironment } from "../state/server";
import { ProviderInstanceIcon } from "./chat/ProviderInstanceIcon";
import { StatusBarConnectionHealth, StatusBarThreadActivity } from "./StatusBarActivity";
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
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params as { threadId?: ThreadId }).threadId ?? null,
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
        {routeEnvironmentId !== null && routeThreadId !== null ? (
          <GitHubUsage environmentId={routeEnvironmentId} threadId={routeThreadId} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBarThreadActivity />
        {primaryEnvironmentId !== null ? (
          <HostStats environmentId={primaryEnvironmentId} label={null} polls />
        ) : null}
        {remoteEnvironmentId !== null ? (
          <>
            {/* The connection probe refreshes the remote stats, so they don't poll too. */}
            <StatusBarConnectionHealth environmentId={remoteEnvironmentId} />
            <HostStats
              environmentId={remoteEnvironmentId}
              label={presentationById.get(remoteEnvironmentId)?.entry.target.label ?? "Remote"}
              polls={false}
            />
          </>
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

const GitHubMark = getSourceControlPresentationForKind("github").Icon;

function formatDollars(amount: number, fractionDigits = 2): string {
  return `$${amount.toFixed(fractionDigits)}`;
}

function formatQuantity({ grossQuantity, unitType }: GitHubBillingProductUsage): string {
  const unit = unitType === "minutes" ? "min" : unitType;
  return `${grossQuantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
}

function formatMonth(year: number, month: number): string {
  return new Date(year, month - 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

// A fork identifies by its upstream; its own CI bills to the origin remote's owner.
function ownerOfCanonicalKey(canonicalKey: string | undefined): string | null {
  return canonicalKey?.split("/")[1] ?? null;
}

/** Billing for the GitHub owner of the open thread's project, read by that environment's `gh`. */
function GitHubUsage({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const thread = useQuietThreadShell(scopeThreadRef(environmentId, threadId));
  const project = useProject(
    thread === null ? null : scopeProjectRef(environmentId, thread.projectId),
  );
  const identity = project?.repositoryIdentity;
  const owner =
    identity?.provider === "github"
      ? (ownerOfCanonicalKey(identity.origin?.canonicalKey) ?? identity.owner ?? null)
      : null;
  const { data } = useGitHubBillingUsage(environmentId, owner);
  if (owner === null || data === null) return null;
  if (data._tag !== "Ok") {
    return (
      <Tooltip>
        <TooltipTrigger render={<StatusItem />}>
          <GitHubMark aria-label="GitHub" className="size-3 opacity-50" />
        </TooltipTrigger>
        <TooltipPopup side="top">{data.reason}</TooltipPopup>
      </Tooltip>
    );
  }
  const { headline } = data;
  return (
    <Tooltip>
      <TooltipTrigger render={<StatusItem />}>
        <GitHubMark aria-label="GitHub" className="size-3" />
        {headline._tag === "Budget" ? (
          <BudgetHeadline spent={headline.spent} budget={headline.budget} />
        ) : (
          <>
            <span className="text-foreground">
              {Math.round(headline.minutes).toLocaleString()} min
            </span>
            {headline.spent > 0 ? <span>{formatDollars(headline.spent)}</span> : null}
          </>
        )}
      </TooltipTrigger>
      <TooltipPopup side="top">
        <div className="flex min-w-52 flex-col gap-1.5">
          <span className="flex items-baseline gap-2">
            <span className="font-medium">{data.owner}</span>
            <span className="text-muted-foreground">
              {data.kind === "user" ? "Personal" : "Organization"} ·{" "}
              {formatMonth(data.year, data.month)}
            </span>
          </span>
          {data.products.length === 0 ? (
            <span className="text-muted-foreground">No usage this month</span>
          ) : null}
          {data.products.map((product) => (
            <span
              key={`${product.product}:${product.unitType}`}
              className="flex items-center gap-2 tabular-nums"
            >
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {product.product}
              </span>
              <span>{formatQuantity(product)}</span>
              <span className="w-14 text-right">{formatDollars(product.netAmount)}</span>
            </span>
          ))}
          {data.budgets.map((budget) => (
            <span
              key={`${budget.sku ?? "all"}:${budget.amount}`}
              className="flex items-center gap-2 tabular-nums"
            >
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                Budget · {budget.sku ?? "all products"}
              </span>
              <span>{formatDollars(budget.amount, 0)}</span>
            </span>
          ))}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}

function BudgetHeadline({ spent, budget }: { spent: number; budget: number }) {
  const percent = Math.round((spent / budget) * 100);
  return (
    <>
      <UsageMeter percent={percent} />
      <span className={cn("font-medium", usageTextClass(percent))}>
        {formatDollars(spent, 0)} / {formatDollars(budget, 0)}
      </span>
      <span>{percent}%</span>
    </>
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
  polls,
}: {
  environmentId: EnvironmentId;
  label: string | null;
  polls: boolean;
}) {
  const registry = useContext(RegistryContext);
  const atom = serverEnvironment.hostResources({ environmentId, input: {} });
  const result = useAtomValue(atom);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls the host's load while the bar is mounted
  useEffect(() => {
    if (!polls) return;
    const timer = setInterval(() => registry.refresh(atom), HOST_STATS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [registry, atom, polls]);
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
