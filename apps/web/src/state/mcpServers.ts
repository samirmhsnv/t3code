import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

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

export const mcpServerAdd = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:mcp-servers:add",
  tag: WS_METHODS.mcpServersAdd,
});

export const mcpServerRemove = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:mcp-servers:remove",
  tag: WS_METHODS.mcpServersRemove,
});

export const mcpServerSignOut = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:mcp-servers:sign-out",
  tag: WS_METHODS.mcpServersSignOut,
});
