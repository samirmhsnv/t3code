import {
  ClaudeSettings,
  CodexSettings,
  McpServerChangeError,
  McpServersListError,
  ProviderDriverKind,
  type McpServerAddInput,
  type McpServerChangeResult,
  type McpServerRemoveInput,
  type McpServerSignOutInput,
  ProviderInstanceId,
  resolveProviderInstanceEnabled,
  type McpServerEntry,
  type McpServerHealthEntry,
  type McpServerProvider,
  type McpServerStatus,
  type McpServerTransport,
  type McpServersHealthResult,
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

import * as ServerConfig from "../config.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ProcessRunner from "../processRunner.ts";
import {
  makeClaudeEnvironment,
  mergeClaudeProcessEnvironment,
} from "../provider/Drivers/ClaudeHome.ts";
import { resolveCodexHomeLayout } from "../provider/Drivers/CodexHomeLayout.ts";
import * as ServerSettingsService from "../serverSettings.ts";

/** The MCP servers each provider on this machine would load, read from the provider's own config. */
export class McpServerCatalog extends Context.Service<
  McpServerCatalog,
  {
    readonly list: Effect.Effect<McpServersListResult, McpServersListError>;
    /** Asks each Claude account's CLI, which also reports claude.ai and plugin servers, with live status. */
    readonly health: Effect.Effect<McpServersHealthResult, McpServersListError>;
    /** Changes go through each provider's own `mcp` command, so its config format stays its own. */
    readonly add: (
      input: McpServerAddInput,
    ) => Effect.Effect<McpServerChangeResult, McpServerChangeError>;
    readonly remove: (
      input: McpServerRemoveInput,
    ) => Effect.Effect<McpServerChangeResult, McpServerChangeError>;
    readonly signOut: (
      input: McpServerSignOutInput,
    ) => Effect.Effect<McpServerChangeResult, McpServerChangeError>;
  }
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

function claudeListStatus(text: string): McpServerStatus {
  const status = text.toLowerCase();
  if (status.includes("connected") && !status.includes("failed")) return "connected";
  if (status.includes("auth")) return "needs-auth";
  if (status.includes("failed")) return "failed";
  if (status.includes("pending")) return "pending";
  if (status.includes("not configured")) return "not-configured";
  return "unknown";
}

/**
 * Reads `claude mcp list`, which has no JSON form: one `<name>: <command or url> - <status>`
 * line per server. Plugin names contain colons, but only the separator is followed by a space.
 */
export function parseClaudeMcpList(
  stdout: string,
): Array<Omit<McpServerHealthEntry, "providerInstanceId">> {
  return stdout.split(/\r?\n/).flatMap((rawLine) => {
    const line = rawLine.trim();
    const nameEnd = line.indexOf(": ");
    const statusStart = line.lastIndexOf(" - ");
    if (nameEnd <= 0 || statusStart < nameEnd) return [];
    const rawName = line.slice(0, nameEnd).trim();
    // "Not configured" uses "-" as its icon, which leaves a second " - " before the status.
    let middle = line
      .slice(nameEnd + 2, statusStart)
      .trim()
      .replace(/\s*-$/, "");
    const statusText = line.slice(statusStart + 3).replace(/^[^\p{L}]+/u, "");
    const suffix = /\s*\((HTTP|SSE|stdio)\)$/i.exec(middle);
    if (suffix) middle = middle.slice(0, suffix.index).trim();
    const marker = suffix?.[1]?.toLowerCase();
    const isUrl = /^https?:\/\//i.test(middle);
    const transport: McpServerTransport =
      marker === "sse" ? "sse" : marker === "http" || isUrl ? "http" : "stdio";
    const source = rawName.startsWith("claude.ai ")
      ? "account"
      : rawName.startsWith("plugin:")
        ? "plugin"
        : "config";
    const name = source === "account" ? rawName.slice("claude.ai ".length).trim() : rawName;
    if (name.length === 0) return [];
    return [
      {
        name,
        source,
        transport,
        target: isUrl
          ? displayTarget(undefined, middle)
          : displayTarget(middle.split(/\s+/)[0], undefined),
        status: claudeListStatus(statusText),
      },
    ];
  });
}

/** The provider CLI's arguments for adding a server, as `claude mcp add` and `codex mcp add` take them. */
export function mcpAddArgs(input: McpServerAddInput): ReadonlyArray<string> {
  const env = input.env.flatMap((variable) => [
    input.provider === "codex" ? "--env" : "-e",
    `${variable.name}=${variable.value}`,
  ]);
  if (input.provider === "codex") {
    return input.transport === "stdio"
      ? ["mcp", "add", input.name, ...env, "--", input.target, ...input.args]
      : ["mcp", "add", input.name, "--url", input.target];
  }
  const base = ["mcp", "add", "--scope", input.scope, "--transport", input.transport, input.name];
  // `-e` and `-H` take several values, so they follow the positionals and `--` ends them.
  return input.transport === "stdio"
    ? [...base, input.target, ...env, "--", ...input.args]
    : [
        ...base,
        input.target,
        ...input.headers.flatMap((header) => ["-H", `${header.name}: ${header.value}`]),
      ];
}

const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodeClaudeSettings = Schema.decodeUnknownOption(ClaudeSettings);
const decodeCodexSettings = Schema.decodeUnknownOption(CodexSettings);

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const serverSettings = yield* ServerSettingsService.ServerSettingsService;
  const projectStore = yield* ProjectStore.ProjectStoreV2;
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const { stateDir } = yield* ServerConfig.ServerConfig;
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

  const claudeCommand = Effect.fn("McpServerCatalog.claudeCommand")(function* (
    config: ProviderInstanceConfig,
  ) {
    const decoded = decodeClaudeSettings(config.config ?? {});
    if (Option.isNone(decoded)) return Option.none();
    const baseEnv = yield* mergeClaudeProcessEnvironment(
      decoded.value,
      config.environment,
      hostEnvironment,
    ).pipe(
      Effect.provideService(HostProcess.HomeDirectory, homeDir),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
    );
    const env = yield* makeClaudeEnvironment(decoded.value, baseEnv).pipe(
      Effect.provideService(Path.Path, path),
      Effect.provideService(HostProcess.HomeDirectory, homeDir),
    );
    return Option.some({ command: expandHomePath(decoded.value.binaryPath, homeDir), env });
  });

  const codexCommand = Effect.fn("McpServerCatalog.codexCommand")(function* (
    config: ProviderInstanceConfig,
  ) {
    const decoded = decodeCodexSettings(config.config ?? {});
    if (Option.isNone(decoded)) return Option.none();
    const layout = yield* resolveCodexLayout(decoded.value, config);
    return Option.some({
      command: expandHomePath(decoded.value.binaryPath, homeDir),
      env: { ...hostEnvironment, CODEX_HOME: layout.sharedHomePath },
    });
  });

  function resolveCodexLayout(codexConfig: CodexSettings, config: ProviderInstanceConfig) {
    const codexHome = instanceVariable(config, "CODEX_HOME")?.trim();
    const codexSettings =
      codexConfig.homePath.trim().length === 0 &&
      codexConfig.shadowHomePath.trim().length === 0 &&
      codexHome
        ? { ...codexConfig, homePath: codexHome }
        : codexConfig;
    return resolveCodexHomeLayout(codexSettings).pipe(
      Effect.provideService(Path.Path, path),
      Effect.provideService(HostProcess.HomeDirectory, homeDir),
    );
  }

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
      const layout = yield* resolveCodexLayout(decoded.value, config);
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

  const health = Effect.gen(function* () {
    const settings = yield* serverSettings.getSettings.pipe(
      Effect.mapError((cause) => new McpServersListError({ operation: "read-settings", cause })),
    );
    const servers: McpServerHealthEntry[] = [];
    const seenConfigDirs = new Set<string>();
    for (const { instanceId, config } of enabledInstances(settings, "claudeAgent")) {
      const cli = yield* claudeCommand(config);
      if (Option.isNone(cli)) continue;
      const { command, env } = cli.value;
      const configKey = env.CLAUDE_CONFIG_DIR ?? "";
      if (seenConfigDirs.has(configKey)) continue;
      seenConfigDirs.add(configKey);
      const output = yield* processRunner
        .run({
          command,
          args: ["mcp", "list"],
          // Like the driver: some `claude` wrappers refuse to run from $HOME.
          cwd: stateDir,
          env,
          // It connects to every server to check it.
          timeout: "90 seconds",
          timeoutBehavior: "timedOutResult",
          maxOutputBytes: 512 * 1024,
          outputMode: "truncate",
        })
        .pipe(Effect.option);
      if (Option.isNone(output) || output.value.timedOut) continue;
      for (const server of parseClaudeMcpList(output.value.stdout)) {
        servers.push({ ...server, providerInstanceId: instanceId });
      }
    }
    return {
      servers,
      checkedAt: DateTime.formatIso(yield* DateTime.now),
    } satisfies McpServersHealthResult;
  }).pipe(Effect.withSpan("McpServerCatalog.health"));

  type ChangeOperation = McpServerChangeError["operation"];
  const changeError = (operation: ChangeOperation, detail: string) =>
    new McpServerChangeError({ operation, detail });

  const runChange = Effect.fn("McpServerCatalog.runChange")(function* (
    operation: ChangeOperation,
    target: {
      readonly provider: McpServerProvider;
      readonly providerInstanceId: ProviderInstanceId;
      readonly scope?: McpServerEntry["scope"];
      readonly projectId?: ProjectId | undefined;
    },
    args: ReadonlyArray<string>,
  ) {
    const settings = yield* serverSettings.getSettings.pipe(
      Effect.mapError(() => changeError(operation, "Couldn't read this environment's settings.")),
    );
    const instance = enabledInstances(settings, target.provider).find(
      (candidate) => candidate.instanceId === target.providerInstanceId,
    );
    if (instance === undefined) {
      return yield* changeError(operation, "That agent isn't enabled on this environment.");
    }
    if (target.provider === "codex" && target.scope !== undefined && target.scope !== "user") {
      return yield* changeError(operation, "Codex keeps MCP servers in one global config.");
    }
    // Claude files "local" and "project" servers under the directory it runs in.
    let cwd = stateDir;
    if (target.scope === "local" || target.scope === "project") {
      const projects = yield* projectStore
        .list()
        .pipe(
          Effect.mapError(() =>
            changeError(operation, "Couldn't read this environment's projects."),
          ),
        );
      const project = projects.find((candidate) => candidate.projectId === target.projectId);
      if (project === undefined) {
        return yield* changeError(operation, "Choose a project for a project-level server.");
      }
      cwd = path.resolve(expandHomePath(project.workspaceRoot, homeDir));
    }
    const cli =
      target.provider === "claudeAgent"
        ? yield* claudeCommand(instance.config)
        : yield* codexCommand(instance.config);
    if (Option.isNone(cli)) {
      return yield* changeError(operation, "That agent's settings couldn't be read.");
    }
    const output = yield* processRunner
      .run({
        command: cli.value.command,
        args: [...args],
        cwd,
        env: cli.value.env,
        timeout: "60 seconds",
        timeoutBehavior: "timedOutResult",
        maxOutputBytes: 64 * 1024,
        outputMode: "truncate",
      })
      .pipe(Effect.mapError((cause) => changeError(operation, cause.message)));
    if (output.timedOut) {
      return yield* changeError(operation, "The agent's CLI didn't answer within a minute.");
    }
    if (output.code !== 0) {
      const detail = (output.stderr.trim() || output.stdout.trim()).replace(/^Error:\s*/, "");
      return yield* changeError(operation, detail || "The agent's CLI refused the change.");
    }
    return {} satisfies McpServerChangeResult;
  });

  const add = (input: McpServerAddInput) =>
    input.provider === "codex" && (input.transport === "sse" || input.headers.length > 0)
      ? Effect.fail(changeError("add", "Codex takes stdio and HTTP servers without headers."))
      : runChange("add", input, mcpAddArgs(input));
  const remove = (input: McpServerRemoveInput) =>
    runChange(
      "remove",
      input,
      input.provider === "codex"
        ? ["mcp", "remove", input.name]
        : ["mcp", "remove", "--scope", input.scope, input.name],
    );
  const signOut = (input: McpServerSignOutInput) =>
    runChange("sign-out", input, ["mcp", "logout", input.name]);

  return McpServerCatalog.of({ list, health, add, remove, signOut });
});

export const layer = Layer.effect(McpServerCatalog, make).pipe(Layer.provide(ProcessRunner.layer));
