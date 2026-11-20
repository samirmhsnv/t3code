import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const mcpServerList = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:mcp-servers:list",
  tag: WS_METHODS.mcpServersList,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

// Connects to every server to check it, so it refreshes rarely.
export const mcpServerHealth = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:mcp-servers:health",
  tag: WS_METHODS.mcpServersHealth,
  staleTimeMs: 5 * 60_000,
  idleTtlMs: 10 * 60_000,
});
