import { ProviderDriverKind, type McpServerEntry } from "@t3tools/contracts";
import { useGT, useMessages } from "gt-react";
import { RefreshCwIcon } from "lucide-react";

import { mcpServerList } from "../../state/mcpServers";
import { useEnvironmentQuery } from "../../state/query";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const PROVIDER_NAMES = { claudeAgent: "Claude", codex: "Codex" } as const;

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

function ConnectorsList() {
  const gt = useGT();
  const resolve = useMessages();
  const { environment } = useSettingsScope();
  const query = useEnvironmentQuery(
    environment ? mcpServerList({ environmentId: environment.environmentId, input: {} }) : null,
    resolve,
  );
  const servers = query.data?.servers ?? [];
  const shared = servers.filter((server) => server.scope === "user");
  const byProject = new Map<string, McpServerEntry[]>();
  for (const server of servers) {
    if (server.scope === "user") continue;
    const title = server.projectTitle ?? "";
    byProject.set(title, [...(byProject.get(title) ?? []), server]);
  }
  const refresh = (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={gt("Refresh")}
      disabled={query.isPending}
      onClick={query.refresh}
    >
      <RefreshCwIcon />
    </Button>
  );
  return (
    <SettingsPageContainer>
      <SettingsSection title={gt("Connectors")} id="connectors" headerAction={refresh}>
        <p className="text-sm text-muted-foreground">
          {gt(
            "MCP servers the agents on this environment load, read from each agent's own config. Change them with the agent's CLI, such as claude mcp add or codex mcp add.",
          )}
        </p>
        {query.error ? (
          <p className="text-sm text-destructive-foreground">{query.error}</p>
        ) : query.data === null ? (
          <p className="text-sm text-muted-foreground">{gt("Loading")}</p>
        ) : servers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {gt("No MCP servers are set up on this environment.")}
          </p>
        ) : null}
        {shared.length > 0 ? <ConnectorGroup title={gt("All projects")} servers={shared} /> : null}
        {[...byProject].map(([projectTitle, projectServers]) => (
          <ConnectorGroup key={projectTitle} title={projectTitle} servers={projectServers} />
        ))}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function ConnectorGroup(props: { title: string; servers: readonly McpServerEntry[] }) {
  return (
    <div className="space-y-1.5">
      <h3 className="px-1 text-xs font-medium text-muted-foreground">{props.title}</h3>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {props.servers.map((server) => (
          <ConnectorRow
            key={`${server.providerInstanceId}:${server.scope}:${server.projectId ?? ""}:${server.name}`}
            server={server}
          />
        ))}
      </ul>
    </div>
  );
}

function ConnectorRow({ server }: { server: McpServerEntry }) {
  const gt = useGT();
  const scopeLabel =
    server.scope === "project"
      ? gt(".mcp.json", { $context: "MCP server scope: the repo's shared config file" })
      : server.scope === "local"
        ? gt("Local", { $context: "MCP server scope: only this user, in this project" })
        : null;
  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-2">
      <ProviderInstanceIcon
        driverKind={ProviderDriverKind.make(server.provider)}
        displayName={PROVIDER_NAMES[server.provider]}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{server.name}</span>
          {scopeLabel ? (
            <Badge variant="outline" size="sm">
              {scopeLabel}
            </Badge>
          ) : null}
          {server.enabled ? null : (
            <Badge variant="secondary" size="sm">
              {gt("Disabled")}
            </Badge>
          )}
        </div>
        {server.target ? (
          <p className="truncate font-mono text-xs text-muted-foreground">{server.target}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground uppercase">{server.transport}</span>
    </li>
  );
}
