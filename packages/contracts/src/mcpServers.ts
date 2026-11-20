import * as Schema from "effect/Schema";
import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const McpServerProvider = Schema.Literals(["claudeAgent", "codex"]);
export type McpServerProvider = typeof McpServerProvider.Type;

/** Where the provider reads the server from: its own home, its per-project entry, or the repo. */
export const McpServerScope = Schema.Literals(["user", "local", "project"]);
export type McpServerScope = typeof McpServerScope.Type;

export const McpServerTransport = Schema.Literals(["stdio", "http", "sse"]);
export type McpServerTransport = typeof McpServerTransport.Type;

export const McpServerEntry = Schema.Struct({
  name: TrimmedNonEmptyString,
  provider: McpServerProvider,
  providerInstanceId: ProviderInstanceId,
  scope: McpServerScope,
  transport: McpServerTransport,
  // The executable's name or the URL's origin and path; args, env, headers and queries stay on the server.
  target: Schema.String,
  enabled: Schema.Boolean,
  projectId: Schema.optional(ProjectId),
  projectTitle: Schema.optional(Schema.String),
});
export type McpServerEntry = typeof McpServerEntry.Type;

export const McpServersListInput = Schema.Struct({});
export type McpServersListInput = typeof McpServersListInput.Type;

export const McpServersListResult = Schema.Struct({
  servers: Schema.Array(McpServerEntry),
  scannedAt: IsoDateTime,
});
export type McpServersListResult = typeof McpServersListResult.Type;

export class McpServersListError extends Schema.TaggedError<McpServersListError>()(
  "McpServersListError",
  {
    operation: Schema.Literals(["read-settings", "read-projects"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to list MCP servers during ${this.operation}.`;
  }
}

export const McpServerStatus = Schema.Literals([
  "connected",
  "needs-auth",
  "failed",
  "pending",
  "not-configured",
  "unknown",
]);
export type McpServerStatus = typeof McpServerStatus.Type;

/** Where Claude got a server it reports: the claude.ai account, a plugin, or a config file. */
export const McpServerHealthSource = Schema.Literals(["account", "plugin", "config"]);
export type McpServerHealthSource = typeof McpServerHealthSource.Type;

export const McpServerHealthEntry = Schema.Struct({
  name: TrimmedNonEmptyString,
  providerInstanceId: ProviderInstanceId,
  source: McpServerHealthSource,
  transport: McpServerTransport,
  target: Schema.String,
  status: McpServerStatus,
});
export type McpServerHealthEntry = typeof McpServerHealthEntry.Type;

export const McpServersHealthResult = Schema.Struct({
  servers: Schema.Array(McpServerHealthEntry),
  checkedAt: IsoDateTime,
});
export type McpServersHealthResult = typeof McpServersHealthResult.Type;

const McpServerName = TrimmedNonEmptyString.check(Schema.isPattern(/^[A-Za-z0-9_.-]+$/));

export const McpServerVariable = Schema.Struct({
  name: TrimmedNonEmptyString,
  value: Schema.String,
});
export type McpServerVariable = typeof McpServerVariable.Type;

export const McpServerAddInput = Schema.Struct({
  provider: McpServerProvider,
  providerInstanceId: ProviderInstanceId,
  name: McpServerName,
  // Codex has one global config, so it takes "user" only.
  scope: McpServerScope,
  // Required for "local" and "project": their config belongs to the project's root.
  projectId: Schema.optional(ProjectId),
  transport: McpServerTransport,
  // The executable for stdio, the URL otherwise.
  target: TrimmedNonEmptyString,
  args: Schema.Array(Schema.String),
  env: Schema.Array(McpServerVariable),
  headers: Schema.Array(McpServerVariable),
});
export type McpServerAddInput = typeof McpServerAddInput.Type;

export const McpServerRemoveInput = Schema.Struct({
  provider: McpServerProvider,
  providerInstanceId: ProviderInstanceId,
  name: TrimmedNonEmptyString,
  scope: McpServerScope,
  projectId: Schema.optional(ProjectId),
});
export type McpServerRemoveInput = typeof McpServerRemoveInput.Type;

export const McpServerSignOutInput = Schema.Struct({
  provider: McpServerProvider,
  providerInstanceId: ProviderInstanceId,
  name: TrimmedNonEmptyString,
});
export type McpServerSignOutInput = typeof McpServerSignOutInput.Type;

export const McpServerChangeResult = Schema.Struct({});
export type McpServerChangeResult = typeof McpServerChangeResult.Type;

export class McpServerChangeError extends Schema.TaggedError<McpServerChangeError>()(
  "McpServerChangeError",
  {
    operation: Schema.Literals(["add", "remove", "sign-out"]),
    // The CLI's own explanation, such as a name that is already taken.
    detail: Schema.String,
  },
) {
  override get message(): string {
    return this.detail;
  }
}
