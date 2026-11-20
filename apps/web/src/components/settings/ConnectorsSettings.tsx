import {
  ProviderDriverKind,
  type McpServerEntry,
  type McpServerHealthEntry,
  type McpServerProvider,
  type McpServerStatus,
  type McpServerTransport,
} from "@t3tools/contracts";
import { useGT, useMessages } from "gt-react";
import { RefreshCwIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { mcpServerHealth, mcpServerList } from "../../state/mcpServers";
import { useEnvironmentQuery } from "../../state/query";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const PROVIDER_NAMES = { claudeAgent: "Claude", codex: "Codex" } as const;

interface ConnectorRowModel {
  readonly key: string;
  readonly name: string;
  readonly provider: McpServerProvider;
  readonly scope: McpServerEntry["scope"] | null;
  readonly enabled: boolean;
  readonly target: string;
  readonly transport: McpServerTransport;
  // Undefined when nothing reports a status, such as Codex servers.
  readonly status: McpServerStatus | "checking" | undefined;
}

export function ConnectorsSettings() {
  const gt = useGT();
  const { environment, scope } = useSettingsScope();
  if (scope.kind !== "environment" || !environment) {
    return (
      <SettingsPageContainer>
        <SettingsSection title={gt("Connectors")} id="connectors">
          <SettingsScopeNotice target="environment">
            {gt("Choose one environment to see the MCP servers its agents load.")}
          </SettingsScopeNotice>
        </SettingsSection>
      </SettingsPageContainer>
    );
  }
  return <ConnectorsList key={environment.environmentId} />;
}

const healthKey = (instanceId: string, name: string) => `${instanceId}\0${name}`;

function fromHealth(entry: McpServerHealthEntry): ConnectorRowModel {
  return {
    key: `health:${entry.providerInstanceId}:${entry.name}`,
    name: entry.name.replace(/^plugin:/, ""),
    provider: "claudeAgent",
    scope: null,
    enabled: true,
    target: entry.target,
    transport: entry.transport,
    status: entry.status,
  };
}

function ConnectorsList() {
  const gt = useGT();
  const resolve = useMessages();
  const { environment } = useSettingsScope();
  const target = environment ? { environmentId: environment.environmentId, input: {} } : null;
  const query = useEnvironmentQuery(target ? mcpServerList(target) : null, resolve);
  const healthQuery = useEnvironmentQuery(target ? mcpServerHealth(target) : null, resolve);
  const servers = query.data?.servers ?? [];
  const health = healthQuery.data?.servers ?? [];
  const healthByName = new Map(
    health.map((entry) => [healthKey(entry.providerInstanceId, entry.name), entry]),
  );
  const checking = healthQuery.data === null && healthQuery.error === null;
  const toRow = (server: McpServerEntry): ConnectorRowModel => {
    const reported = healthByName.get(healthKey(server.providerInstanceId, server.name));
    return {
      key: `${server.providerInstanceId}:${server.scope}:${server.projectId ?? ""}:${server.name}`,
      name: server.name,
      provider: server.provider,
      scope: server.scope,
      enabled: server.enabled,
      target: server.target,
      transport: server.transport,
      status:
        server.provider !== "claudeAgent"
          ? undefined
          : (reported?.status ?? (checking ? "checking" : undefined)),
    };
  };
  const listedNames = new Set(
    servers.map((server) => healthKey(server.providerInstanceId, server.name)),
  );
  const account = health.filter((entry) => entry.source === "account").map(fromHealth);
  const plugins = health.filter((entry) => entry.source === "plugin").map(fromHealth);
  // Claude can load servers no file here names, such as managed or enterprise config.
  const unlistedConfig = health
    .filter(
      (entry) =>
        entry.source === "config" &&
        !listedNames.has(healthKey(entry.providerInstanceId, entry.name)),
    )
    .map(fromHealth);
  const shared = [
    ...servers.filter((server) => server.scope === "user").map(toRow),
    ...unlistedConfig,
  ];
  const byProject = new Map<string, ConnectorRowModel[]>();
  for (const server of servers) {
    if (server.scope === "user") continue;
    const title = server.projectTitle ?? "";
    byProject.set(title, [...(byProject.get(title) ?? []), toRow(server)]);
  }
  const refreshing = query.isPending || healthQuery.isPending;
  const refresh = (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={gt("Refresh")}
      disabled={refreshing}
      onClick={() => {
        query.refresh();
        healthQuery.refresh();
      }}
    >
      <RefreshCwIcon />
    </Button>
  );
  const empty =
    query.data !== null && servers.length === 0 && healthQuery.data !== null && health.length === 0;
  return (
    <SettingsPageContainer>
      <SettingsSection
        title={gt("Connectors")}
        id="connectors"
        headerAction={refresh}
        variant="plain"
        className="space-y-4"
      >
        <p className="text-sm text-muted-foreground">
          {gt(
            "MCP servers the agents on this environment load, read from each agent's own config. Change them with the agent's CLI, such as claude mcp add or codex mcp add.",
          )}
        </p>
        {query.error ? (
          <p className="text-sm text-destructive-foreground">
            {gt(
              "Couldn't load connectors: {error} An environment on an older T3 Code needs an update first.",
              { error: query.error },
            )}
          </p>
        ) : query.data === null ? (
          <p className="text-sm text-muted-foreground">{gt("Loading")}</p>
        ) : empty ? (
          <p className="text-sm text-muted-foreground">
            {gt("No MCP servers are set up on this environment.")}
          </p>
        ) : null}
        {account.length > 0 ? (
          <ConnectorGroup title={gt("Claude account")} rows={account} />
        ) : checking ? (
          <p className="text-xs text-muted-foreground">
            {gt("Checking Claude's connectors and server status…")}
          </p>
        ) : healthQuery.error && !query.error ? (
          <p className="text-xs text-muted-foreground">
            {gt("Couldn't check server status: {error}", { error: healthQuery.error })}
          </p>
        ) : null}
        {shared.length > 0 ? <ConnectorGroup title={gt("All projects")} rows={shared} /> : null}
        {[...byProject].map(([projectTitle, rows]) => (
          <ConnectorGroup key={projectTitle} title={projectTitle} rows={rows} />
        ))}
        {plugins.length > 0 ? <ConnectorGroup title={gt("Plugins")} rows={plugins} /> : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function ConnectorGroup(props: { title: string; rows: readonly ConnectorRowModel[] }) {
  return (
    <div className="space-y-1.5">
      <h3 className="px-1 text-xs font-medium text-muted-foreground">{props.title}</h3>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {props.rows.map((row) => (
          <ConnectorRow key={row.key} row={row} />
        ))}
      </ul>
    </div>
  );
}

function ConnectorStatus({ status }: { status: ConnectorRowModel["status"] }) {
  const gt = useGT();
  if (status === undefined || status === "unknown") return null;
  const [label, dot] =
    status === "checking"
      ? [gt("Checking…"), "bg-muted-foreground/40"]
      : status === "connected"
        ? [gt("Connected"), "bg-success"]
        : status === "needs-auth"
          ? [gt("Needs sign-in"), "bg-warning"]
          : status === "failed"
            ? [gt("Failed"), "bg-destructive"]
            : status === "pending"
              ? [gt("Pending approval"), "bg-warning"]
              : [gt("Not configured"), "bg-muted-foreground/40"];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function ConnectorRow({ row }: { row: ConnectorRowModel }) {
  const gt = useGT();
  const scopeLabel =
    row.scope === "project"
      ? gt(".mcp.json", { $context: "MCP server scope: the repo's shared config file" })
      : row.scope === "local"
        ? gt("Local", { $context: "MCP server scope: only this user, in this project" })
        : null;
  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-2">
      <ProviderInstanceIcon
        driverKind={ProviderDriverKind.make(row.provider)}
        displayName={PROVIDER_NAMES[row.provider]}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{row.name}</span>
          {scopeLabel ? (
            <Badge variant="outline" size="sm">
              {scopeLabel}
            </Badge>
          ) : null}
          {row.enabled ? null : (
            <Badge variant="secondary" size="sm">
              {gt("Disabled")}
            </Badge>
          )}
        </div>
        {row.target ? (
          <p className="truncate font-mono text-xs text-muted-foreground">{row.target}</p>
        ) : null}
      </div>
      <ConnectorStatus status={row.status} />
      <span className="w-10 shrink-0 text-end text-xs text-muted-foreground uppercase">
        {row.transport}
      </span>
    </li>
  );
}
