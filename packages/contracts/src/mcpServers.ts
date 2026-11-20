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
