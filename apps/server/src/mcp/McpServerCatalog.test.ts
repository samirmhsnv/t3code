import { describe, expect, it } from "vite-plus/test";

import {
  parseClaudeMcpList,
  parseClaudeMcpServers,
  parseCodexMcpServers,
} from "./McpServerCatalog.ts";

describe("parseClaudeMcpServers", () => {
  it("reads transports and never exposes args, env, headers or query strings", () => {
    const servers = parseClaudeMcpServers(
      {
        linear: { type: "http", url: "https://mcp.linear.app/mcp?token=secret", headers: { a: 1 } },
        events: { type: "sse", url: "https://example.com/sse" },
        local: { command: "/usr/local/bin/node", args: ["--key", "secret"], env: { K: "v" } },
        bare: { url: "https://example.com/" },
        broken: "not an object",
      },
      new Set(["local"]),
    );
    expect(servers).toEqual([
      { name: "linear", transport: "http", target: "https://mcp.linear.app/mcp", enabled: true },
      { name: "events", transport: "sse", target: "https://example.com/sse", enabled: true },
      { name: "local", transport: "stdio", target: "node", enabled: false },
      { name: "bare", transport: "http", target: "https://example.com", enabled: true },
    ]);
    expect(parseClaudeMcpServers(undefined)).toEqual([]);
  });
});

describe("parseCodexMcpServers", () => {
  it("reads mcp_servers tables and skips the rest of the file", () => {
    const toml = [
      'model = "gpt-5"',
      "[mcp_servers.docs]",
      'command = "npx" # trailing comment',
      'args = ["-y", "secret"]',
      "[mcp_servers.docs.env]",
      'TOKEN = "secret"',
      '[mcp_servers."remote.api"]',
      "url = 'https://api.example.com/mcp?k=1'",
      "enabled = false",
      "[profiles.fast]",
      'command = "ignored"',
    ].join("\n");
    expect(parseCodexMcpServers(toml)).toEqual([
      { name: "docs", transport: "stdio", target: "npx", enabled: true },
      {
        name: "remote.api",
        transport: "http",
        target: "https://api.example.com/mcp",
        enabled: false,
      },
    ]);
  });
});

describe("parseClaudeMcpList", () => {
  it("reads account, plugin and config servers with their status", () => {
    const stdout = [
      "Checking MCP server health…",
      "",
      "claude.ai Linear: https://mcp.linear.app/mcp - ✔ Connected",
      "claude.ai Cloudflare API: https://mcp.cloudflare.com/mcp - ! Needs authentication",
      "plugin:pdf-viewer:pdf: npx -y @modelcontextprotocol/server-pdf --stdio - ✔ Connected",
      "plugin:engineering:slack: https://mcp.slack.com/mcp?team=x (HTTP) - ! Needs authentication",
      "plugin:engineering:gmail:  (HTTP) - - Not configured",
      "docs: /usr/local/bin/docs-mcp --token secret - ✗ Failed to connect",
      "repo: node server.js - ⏸ Pending approval",
    ].join("\n");
    expect(parseClaudeMcpList(stdout)).toEqual([
      {
        name: "Linear",
        source: "account",
        transport: "http",
        target: "https://mcp.linear.app/mcp",
        status: "connected",
      },
      {
        name: "Cloudflare API",
        source: "account",
        transport: "http",
        target: "https://mcp.cloudflare.com/mcp",
        status: "needs-auth",
      },
      {
        name: "plugin:pdf-viewer:pdf",
        source: "plugin",
        transport: "stdio",
        target: "npx",
        status: "connected",
      },
      {
        name: "plugin:engineering:slack",
        source: "plugin",
        transport: "http",
        target: "https://mcp.slack.com/mcp",
        status: "needs-auth",
      },
      {
        name: "plugin:engineering:gmail",
        source: "plugin",
        transport: "http",
        target: "",
        status: "not-configured",
      },
      { name: "docs", source: "config", transport: "stdio", target: "docs-mcp", status: "failed" },
      { name: "repo", source: "config", transport: "stdio", target: "node", status: "pending" },
    ]);
  });
});
