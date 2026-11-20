import {
  ClaudeSettings,
  CodexSettings,
  McpServersListError,
  ProviderDriverKind,
  ProviderInstanceId,
  resolveProviderInstanceEnabled,
  type McpServerEntry,
  type McpServerProvider,
  type McpServerTransport,
  type McpServersListResult,
  type ProjectId,
  type ProviderInstanceConfig,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as HostProcess from "@t3tools/shared/HostProcess";
import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";

import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import { resolveCodexHomeLayout } from "../provider/Drivers/CodexHomeLayout.ts";
import * as ServerSettingsService from "../serverSettings.ts";

/** The MCP servers each provider on this machine would load, read from the provider's own config. */
export class McpServerCatalog extends Context.Service<
  McpServerCatalog,
  { readonly list: Effect.Effect<McpServersListResult, McpServersListError> }
>()("t3/mcp/McpServerCatalog") {}

export interface ParsedMcpServer {
  readonly name: string;
  readonly transport: McpServerTransport;
  readonly target: string;
  readonly enabled: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Commands and URLs can carry tokens in args or queries, so only the executable or origin+path leaves.
function displayTarget(command: unknown, url: unknown): string {
  if (typeof url === "string" && url.trim().length > 0) {
    try {
      const parsed = new URL(url.trim());
      return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    } catch {
      return "";
    }
  }
  if (typeof command === "string") {
    return command.trim().split(/[\\/]/).pop() ?? "";
  }
  return "";
}

/** Reads a Claude `mcpServers` object, as found in `.claude.json` and `.mcp.json`. */
export function parseClaudeMcpServers(
  servers: unknown,
  disabledNames: ReadonlySet<string> = new Set(),
): ParsedMcpServer[] {
  if (!isRecord(servers)) return [];
  return Object.entries(servers).flatMap(([name, value]) => {
    if (name.trim().length === 0 || !isRecord(value)) return [];
    const type = value.type;
    const transport: McpServerTransport =
      type === "http" || type === "sse"
        ? type
        : typeof value.url === "string" && typeof value.command !== "string"
          ? "http"
          : "stdio";
    return [
      {
        name: name.trim(),
        transport,
        target: displayTarget(value.command, value.url),
        enabled: !disabledNames.has(name),
      },
    ];
  });
}

function unquoteTomlKey(key: string): string {
  const trimmed = key.trim();
  return (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1)
    : trimmed;
}

function tomlScalar(raw: string): string | boolean | undefined {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  const quoted = /^"((?:[^"\\]|\\.)*)"|^'([^']*)'/.exec(value);
  if (quoted) return quoted[1] ?? quoted[2] ?? "";
  return undefined;
}

/**
 * Reads `[mcp_servers.<name>]` tables from a Codex `config.toml`. Only the keys the list shows are
 * read (command, url, enabled), so this skips the rest of TOML rather than parsing it.
 */
export function parseCodexMcpServers(toml: string): ParsedMcpServer[] {
  const servers = new Map<string, { command?: string; url?: string; enabled: boolean }>();
  let current: { command?: string; url?: string; enabled: boolean } | null = null;
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const header = /^\[([^[\]]+)\]$/.exec(line);
    if (header) {
      const match = /^mcp_servers\.("[^"]+"|'[^']+'|[A-Za-z0-9_-]+)$/.exec(header[1]!.trim());
      if (match) {
        const name = unquoteTomlKey(match[1]!);
        current = servers.get(name) ?? { enabled: true };
        servers.set(name, current);
      } else {
        current = null;
      }
      continue;
    }
    if (current === null || line.startsWith("[")) continue;
    const assignment = /^([A-Za-z0-9_"'-]+)\s*=\s*(.+)$/.exec(line);
    if (!assignment) continue;
    const key = unquoteTomlKey(assignment[1]!);
    const value = tomlScalar(assignment[2]!);
    if (key === "command" && typeof value === "string") current.command = value;
    else if (key === "url" && typeof value === "string") current.url = value;
    else if (key === "enabled" && typeof value === "boolean") current.enabled = value;
  }
  return [...servers].map(([name, server]) => ({
    name,
    transport: server.url !== undefined && server.command === undefined ? "http" : "stdio",
    target: displayTarget(server.command, server.url),
    enabled: server.enabled,
  }));
}

const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodeClaudeSettings = Schema.decodeUnknownOption(ClaudeSettings);
const decodeCodexSettings = Schema.decodeUnknownOption(CodexSettings);

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const serverSettings = yield* ServerSettingsService.ServerSettingsService;
  const projectStore = yield* ProjectStore.ProjectStoreV2;
  const hostEnvironment = yield* HostProcess.Environment;
  const homeDir = yield* HostProcess.HomeDirectory;

  const readJson = (filePath: string) =>
    fileSystem.readFileString(filePath).pipe(Effect.flatMap(decodeJson), Effect.option);
  const readText = (filePath: string) => fileSystem.readFileString(filePath).pipe(Effect.option);

  const enabledInstances = (
    settings: ServerSettings,
    driver: McpServerProvider,
  ): Array<{
    readonly instanceId: ProviderInstanceId;
    readonly config: ProviderInstanceConfig;
  }> => {
    const instances = Object.entries(settings.providerInstances)
      .filter(
        ([, instance]) => instance.driver === driver && resolveProviderInstanceEnabled(instance),
      )
      .map(([instanceId, config]) => ({ instanceId: ProviderInstanceId.make(instanceId), config }));
    if (!Object.hasOwn(settings.providerInstances, driver)) {
      const config = { driver: ProviderDriverKind.make(driver) };
      if (resolveProviderInstanceEnabled(config)) {
        instances.unshift({ instanceId: ProviderInstanceId.make(driver), config });
      }
    }
    return instances;
  };

  const instanceVariable = (config: ProviderInstanceConfig, name: string) => {
    const configured = config.environment?.findLast((variable) => variable.name === name)?.value;
    return typeof configured === "string" ? configured : hostEnvironment[name];
  };

  const list = Effect.gen(function* () {
    const settings = yield* serverSettings.getSettings.pipe(
      Effect.mapError((cause) => new McpServersListError({ operation: "read-settings", cause })),
    );
    const projects = yield* projectStore
      .list()
      .pipe(
        Effect.mapError((cause) => new McpServersListError({ operation: "read-projects", cause })),
      );
    const projectRoots = projects.map((project) => ({
      projectId: project.projectId,
      title: project.title,
      root: path.resolve(expandHomePath(project.workspaceRoot, homeDir)),
    }));
    const servers: McpServerEntry[] = [];
    const push = (
      parsed: ReadonlyArray<ParsedMcpServer>,
      base: {
        readonly provider: McpServerProvider;
        readonly providerInstanceId: ProviderInstanceId;
        readonly scope: McpServerEntry["scope"];
        readonly project?: { readonly projectId: ProjectId; readonly title: string };
      },
    ) => {
      for (const server of parsed) {
        servers.push({
          ...server,
          provider: base.provider,
          providerInstanceId: base.providerInstanceId,
          scope: base.scope,
          ...(base.project
            ? { projectId: base.project.projectId, projectTitle: base.project.title }
            : {}),
        });
      }
    };

    const seenClaudeFiles = new Set<string>();
    const claudeInstances = enabledInstances(settings, "claudeAgent");
    for (const { instanceId, config } of claudeInstances) {
      const decoded = decodeClaudeSettings(config.config ?? {});
      if (Option.isNone(decoded)) continue;
      const customDir =
        decoded.value.homePath.trim() || instanceVariable(config, "CLAUDE_CONFIG_DIR")?.trim();
      // Claude keeps `.claude.json` beside a custom config dir, and in the home directory otherwise.
      const configFile = customDir
        ? path.join(path.resolve(expandHomePath(customDir, homeDir)), ".claude.json")
        : path.join(homeDir, ".claude.json");
      if (seenClaudeFiles.has(configFile)) continue;
      seenClaudeFiles.add(configFile);
      const json = yield* readJson(configFile);
      if (Option.isNone(json) || !isRecord(json.value)) continue;
      const base = { provider: "claudeAgent", providerInstanceId: instanceId } as const;
      push(parseClaudeMcpServers(json.value.mcpServers), { ...base, scope: "user" });
      const projectEntries = isRecord(json.value.projects) ? json.value.projects : {};
      for (const project of projectRoots) {
        const entry = projectEntries[project.root];
        if (!isRecord(entry)) continue;
        push(parseClaudeMcpServers(entry.mcpServers), { ...base, scope: "local", project });
      }
    }

    // `.mcp.json` belongs to the repo, so it is listed once, under the default Claude account.
    const projectClaudeInstance = claudeInstances[0]?.instanceId;
    if (projectClaudeInstance !== undefined) {
      for (const project of projectRoots) {
        const json = yield* readJson(path.join(project.root, ".mcp.json"));
        if (Option.isNone(json) || !isRecord(json.value)) continue;
        push(parseClaudeMcpServers(json.value.mcpServers), {
          provider: "claudeAgent",
          providerInstanceId: projectClaudeInstance,
          scope: "project",
          project,
        });
      }
    }

    const seenCodexHomes = new Set<string>();
    for (const { instanceId, config } of enabledInstances(settings, "codex")) {
      const decoded = decodeCodexSettings(config.config ?? {});
      if (Option.isNone(decoded)) continue;
      const codexHome = instanceVariable(config, "CODEX_HOME")?.trim();
      const codexSettings =
        decoded.value.homePath.trim().length === 0 &&
        decoded.value.shadowHomePath.trim().length === 0 &&
        codexHome
          ? { ...decoded.value, homePath: codexHome }
          : decoded.value;
      const layout = yield* resolveCodexHomeLayout(codexSettings).pipe(
        Effect.provideService(Path.Path, path),
        Effect.provideService(HostProcess.HomeDirectory, homeDir),
      );
      if (seenCodexHomes.has(layout.sharedHomePath)) continue;
      seenCodexHomes.add(layout.sharedHomePath);
      const toml = yield* readText(path.join(layout.sharedHomePath, "config.toml"));
      if (Option.isNone(toml)) continue;
      push(parseCodexMcpServers(toml.value), {
        provider: "codex",
        providerInstanceId: instanceId,
        scope: "user",
      });
    }

    return {
      servers,
      scannedAt: DateTime.formatIso(yield* DateTime.now),
    } satisfies McpServersListResult;
  }).pipe(Effect.withSpan("McpServerCatalog.list"));

  return McpServerCatalog.of({ list });
});

export const layer = Layer.effect(McpServerCatalog, make);
