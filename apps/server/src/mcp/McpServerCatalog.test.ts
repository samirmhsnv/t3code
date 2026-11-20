import { describe, expect, it } from "vite-plus/test";

import { parseClaudeMcpServers, parseCodexMcpServers } from "./McpServerCatalog.ts";

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
