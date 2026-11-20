import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  McpServerEntry,
  McpServerHealthEntry,
  McpServerHealthSource,
  McpServerProvider,
  McpServerStatus,
  McpServerTransport,
  ProjectId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { T, useGT, useMessages } from "gt-react";
import {
  ArrowUpRightIcon,
  EllipsisIcon,
  LogOutIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import {
  mcpServerAdd,
  mcpServerHealth,
  mcpServerList,
  mcpServerRemove,
  mcpServerSignOut,
} from "../../state/mcpServers";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Spinner } from "../ui/spinner";
import { ConnectorAddDialog } from "./ConnectorAddDialog";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors";
const PROVIDER_NAMES = { claudeAgent: "Claude", codex: "Codex" } as const;
const COLLAPSED_ROWS = 6;

interface ConnectorRowModel {
  readonly key: string;
  readonly name: string;
  // The plugin a server came with, shown beside it.
  readonly plugin: string | null;
  readonly provider: McpServerProvider;
  readonly providerInstanceId: ProviderInstanceId;
  readonly source: McpServerHealthSource;
  readonly scope: McpServerEntry["scope"] | null;
  readonly projectId: ProjectId | undefined;
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
  return (
    <ConnectorsList key={environment.environmentId} environmentId={environment.environmentId} />
  );
}

const healthKey = (instanceId: string, name: string) => `${instanceId}\0${name}`;

function fromHealth(entry: McpServerHealthEntry): ConnectorRowModel {
  const pluginName = entry.source === "plugin" ? entry.name.replace(/^plugin:/, "") : null;
  const split = pluginName?.lastIndexOf(":") ?? -1;
  return {
    key: `health:${entry.providerInstanceId}:${entry.name}`,
    name: pluginName !== null && split > 0 ? pluginName.slice(split + 1) : entry.name,
    plugin: pluginName !== null && split > 0 ? pluginName.slice(0, split) : null,
    provider: "claudeAgent",
    providerInstanceId: entry.providerInstanceId,
    source: entry.source,
    scope: null,
    projectId: undefined,
    enabled: true,
    target: entry.target,
    transport: entry.transport,
    status: entry.status,
  };
}

const displayTarget = (target: string) => target.replace(/^https?:\/\//, "");

function ConnectorsList({ environmentId }: { environmentId: EnvironmentId }) {
  const gt = useGT();
  const resolve = useMessages();
  const target = { environmentId, input: {} };
  const query = useEnvironmentQuery(mcpServerList(target), resolve);
  const healthQuery = useEnvironmentQuery(mcpServerHealth(target), resolve);
  const canManage = useAtomValue(mcpServerAdd.permissionAtom(environmentId));
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<ConnectorRowModel | null>(null);

  const refresh = () => {
    query.refresh();
    healthQuery.refresh();
  };

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
      plugin: null,
      provider: server.provider,
      providerInstanceId: server.providerInstanceId,
      source: "config",
      scope: server.scope,
      projectId: server.projectId,
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
  const allRows = [...account, ...shared, ...[...byProject.values()].flat(), ...plugins];
  const mixedProviders = new Set(allRows.map((row) => row.provider)).size > 1;
  const needle = search.trim().toLowerCase();
  const matches = (row: ConnectorRowModel) =>
    needle.length === 0 ||
    row.name.toLowerCase().includes(needle) ||
    row.target.toLowerCase().includes(needle) ||
    (row.plugin?.toLowerCase().includes(needle) ?? false);

  const counts = {
    connected: allRows.filter((row) => row.status === "connected").length,
    attention: allRows.filter((row) => row.status === "needs-auth" || row.status === "pending")
      .length,
    failed: allRows.filter((row) => row.status === "failed").length,
  };
  const refreshing = query.isPending || healthQuery.isPending;
  const empty =
    query.data !== null && servers.length === 0 && healthQuery.data !== null && health.length === 0;

  const groups: Array<{
    readonly key: string;
    readonly title: string;
    readonly rows: readonly ConnectorRowModel[];
    readonly action?: React.ReactNode;
  }> = [
    {
      key: "account",
      title: gt("Claude account"),
      rows: account,
      action: (
        <a
          href={CLAUDE_CONNECTORS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <T>Manage on claude.ai</T>
          <ArrowUpRightIcon aria-hidden className="size-3" />
        </a>
      ),
    },
    { key: "shared", title: gt("All projects"), rows: shared },
    ...[...byProject].map(([title, rows]) => ({ key: `project:${title}`, title, rows })),
    { key: "plugins", title: gt("Plugins"), rows: plugins },
  ];

  return (
    <SettingsPageContainer>
      <SettingsSection
        title={gt("Connectors")}
        id="connectors"
        variant="plain"
        className="space-y-4"
        headerAction={
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={gt("Refresh")}
              disabled={refreshing}
              onClick={refresh}
            >
              <RefreshCwIcon />
            </Button>
            {canManage ? (
              <Button size="xs" variant="outline" onClick={() => setAddOpen(true)}>
                <PlusIcon />
                <T>Add server</T>
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-3 px-3 sm:px-4">
          <p className="text-sm text-muted-foreground">
            <T>
              MCP servers give agents on this environment tools like issue trackers, docs and
              browsers. Claude and Codex read them from their own config.
            </T>
          </p>
          {allRows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <InputGroup className="w-full max-w-64">
                <InputGroupAddon>
                  <SearchIcon aria-hidden className="size-3" />
                </InputGroupAddon>
                <InputGroupInput
                  size="sm"
                  type="search"
                  value={search}
                  placeholder={gt("Search servers")}
                  aria-label={gt("Search servers")}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
              </InputGroup>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {counts.connected > 0 ? (
                  <StatusCount
                    dot="bg-success"
                    label={gt("{n} connected", { n: counts.connected })}
                  />
                ) : null}
                {counts.attention > 0 ? (
                  <StatusCount
                    dot="bg-warning"
                    label={gt("{n} need attention", { n: counts.attention })}
                  />
                ) : null}
                {counts.failed > 0 ? (
                  <StatusCount
                    dot="bg-destructive"
                    label={gt("{n} failed", { n: counts.failed })}
                  />
                ) : null}
                {checking ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner size="sm" />
                    <T>Checking status…</T>
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
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
          ) : healthQuery.error ? (
            <p className="text-xs text-muted-foreground">
              {gt("Couldn't check server status: {error}", { error: healthQuery.error })}
            </p>
          ) : null}
        </div>

        {groups.map((group) => {
          const rows = group.rows.filter(matches);
          if (rows.length === 0) return null;
          return (
            <ConnectorGroup
              key={group.key}
              title={group.title}
              action={group.action}
              rows={rows}
              collapsible={needle.length === 0}
              renderRow={(row) => (
                <ConnectorRow
                  key={row.key}
                  row={row}
                  environmentId={environmentId}
                  canManage={canManage}
                  showProvider={mixedProviders}
                  onChanged={refresh}
                  onRemove={() => setPendingRemoval(row)}
                />
              )}
            />
          );
        })}
        {needle.length > 0 && allRows.length > 0 && !allRows.some(matches) ? (
          <p className="px-3 text-sm text-muted-foreground sm:px-4">
            <T>No servers match.</T>
          </p>
        ) : null}
      </SettingsSection>
      <ConnectorAddDialog
        environmentId={environmentId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={refresh}
      />
      <RemoveConnectorDialog
        environmentId={environmentId}
        row={pendingRemoval}
        onClose={() => setPendingRemoval(null)}
        onRemoved={refresh}
      />
    </SettingsPageContainer>
  );
}

function StatusCount(props: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-1.5 rounded-full", props.dot)} />
      {props.label}
    </span>
  );
}

function ConnectorGroup(props: {
  title: string;
  action?: React.ReactNode;
  rows: readonly ConnectorRowModel[];
  collapsible: boolean;
  renderRow: (row: ConnectorRowModel) => React.ReactNode;
}) {
  const gt = useGT();
  const [expanded, setExpanded] = useState(false);
  // One or two hidden rows cost more to reveal than to show.
  const collapse = props.collapsible && !expanded && props.rows.length > COLLAPSED_ROWS + 2;
  const shown = collapse ? props.rows.slice(0, COLLAPSED_ROWS) : props.rows;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 px-3 sm:px-4">
        <h3 className="text-xs font-medium text-muted-foreground">
          {props.title}
          <span className="ms-1.5 tabular-nums text-muted-foreground/60">{props.rows.length}</span>
        </h3>
        {props.action}
      </div>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
        {shown.map(props.renderRow)}
        {collapse ? (
          <li>
            <button
              type="button"
              className="w-full px-4 py-2 text-start text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              onClick={() => setExpanded(true)}
            >
              {gt("Show {n} more", { n: props.rows.length - COLLAPSED_ROWS })}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ConnectorStatus({ status }: { status: ConnectorRowModel["status"] }) {
  const gt = useGT();
  if (status === undefined || status === "unknown") return null;
  const [label, dot, tone] =
    status === "checking"
      ? [gt("Checking…"), "bg-muted-foreground/40", "text-muted-foreground"]
      : status === "connected"
        ? [gt("Connected"), "bg-success", "text-muted-foreground"]
        : status === "needs-auth"
          ? [gt("Needs sign-in"), "bg-warning", "text-warning-foreground"]
          : status === "failed"
            ? [gt("Failed"), "bg-destructive", "text-destructive-foreground"]
            : status === "pending"
              ? [gt("Pending approval"), "bg-warning", "text-warning-foreground"]
              : [gt("Not configured"), "bg-muted-foreground/40", "text-muted-foreground"];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs", tone)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function ConnectorRow(props: {
  row: ConnectorRowModel;
  environmentId: EnvironmentId;
  canManage: boolean;
  showProvider: boolean;
  onChanged: () => void;
  onRemove: () => void;
}) {
  const { row } = props;
  const gt = useGT();
  const signOut = useAtomCommand(mcpServerSignOut, { label: `sign out of ${row.name}` });
  const [busy, setBusy] = useState(false);
  const scopeLabel =
    row.scope === "project"
      ? gt(".mcp.json", { $context: "MCP server scope: the repo's shared config file" })
      : row.scope === "local"
        ? gt("Only you", { $context: "MCP server scope: only this user, in this project" })
        : null;
  const meta = [
    props.showProvider ? PROVIDER_NAMES[row.provider] : null,
    row.plugin,
    row.transport === "stdio" ? gt("Command") : row.transport.toUpperCase(),
    row.target ? displayTarget(row.target) : null,
  ].filter((part): part is string => part !== null && part.length > 0);
  const isConfig = row.scope !== null;
  // Codex signs out of streamable HTTP servers only.
  const canSignOut =
    isConfig && (row.provider === "codex" ? row.transport === "http" : row.transport !== "stdio");
  const isAccount = row.source === "account";
  const hasMenu = isAccount || (props.canManage && isConfig);

  const runSignOut = async () => {
    setBusy(true);
    await signOut({
      environmentId: props.environmentId,
      input: { provider: row.provider, providerInstanceId: row.providerInstanceId, name: row.name },
    });
    setBusy(false);
    props.onChanged();
  };

  return (
    <li className="group/connector flex min-h-12 items-center gap-3 px-3 py-2 sm:px-4">
      <span
        aria-hidden
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground uppercase"
      >
        {row.name.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "truncate text-sm font-medium text-foreground",
              !row.enabled && "text-muted-foreground",
            )}
          >
            {row.name}
          </span>
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
        {meta.length > 0 ? (
          <p className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
        ) : null}
      </div>
      {isAccount && row.status === "needs-auth" ? (
        <Button
          size="xs"
          variant="outline"
          render={<a href={CLAUDE_CONNECTORS_URL} target="_blank" rel="noreferrer" />}
        >
          <T>Sign in</T>
          <ArrowUpRightIcon />
        </Button>
      ) : (
        <ConnectorStatus status={row.status} />
      )}
      {busy ? <Spinner size="sm" /> : null}
      {hasMenu ? (
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={gt("Actions for {name}", { name: row.name })}
                disabled={busy}
              />
            }
          >
            <EllipsisIcon />
          </MenuTrigger>
          <MenuPopup align="end">
            {isAccount ? (
              <MenuItem
                render={<a href={CLAUDE_CONNECTORS_URL} target="_blank" rel="noreferrer" />}
              >
                <ArrowUpRightIcon />
                <T>Manage on claude.ai</T>
              </MenuItem>
            ) : null}
            {props.canManage && canSignOut ? (
              <MenuItem onClick={() => void runSignOut()}>
                <LogOutIcon />
                <T>Sign out</T>
              </MenuItem>
            ) : null}
            {props.canManage && isConfig ? (
              <>
                {canSignOut ? <MenuSeparator /> : null}
                <MenuItem variant="destructive" onClick={props.onRemove}>
                  <Trash2Icon />
                  <T>Remove…</T>
                </MenuItem>
              </>
            ) : null}
          </MenuPopup>
        </Menu>
      ) : null}
    </li>
  );
}

function RemoveConnectorDialog(props: {
  environmentId: EnvironmentId;
  row: ConnectorRowModel | null;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const gt = useGT();
  const remove = useAtomCommand(mcpServerRemove, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const row = props.row;

  const confirm = async () => {
    if (row === null || row.scope === null) return;
    setBusy(true);
    setFailure(null);
    const result = await remove({
      environmentId: props.environmentId,
      input: {
        provider: row.provider,
        providerInstanceId: row.providerInstanceId,
        name: row.name,
        scope: row.scope,
        ...(row.projectId ? { projectId: row.projectId } : {}),
      },
    });
    setBusy(false);
    if (result._tag === "Success") {
      props.onRemoved();
      props.onClose();
      return;
    }
    const error = squashAtomCommandFailure(result);
    setFailure(error instanceof Error ? error.message : gt("The server couldn't be removed."));
  };

  return (
    <AlertDialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) {
          setFailure(null);
          props.onClose();
        }
      }}
    >
      {row ? (
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{gt("Remove {name}?", { name: row.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {row.scope === "project"
                ? gt(
                    "It comes out of the repo's .mcp.json, so everyone who uses the repo loses it.",
                  )
                : gt("Agents stop loading it when their next session starts.")}
            </AlertDialogDescription>
            {failure ? <p className="text-sm text-destructive-foreground">{failure}</p> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose disabled={busy} render={<Button variant="outline" disabled={busy} />}>
              <T>Cancel</T>
            </AlertDialogClose>
            <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
              {busy ? <Spinner size="sm" /> : null}
              <T>Remove</T>
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      ) : null}
    </AlertDialog>
  );
}
