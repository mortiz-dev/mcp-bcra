import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { describe, expect, it } from "vitest";

const runStdio = process.env.MCP_RUN_STDIO_E2E === "1";

describe.runIf(runStdio)("packaged stdio transport", () => {
  it.each([
    ["legacy", undefined],
    ["modern", { mode: { pin: "2026-07-28" } as const }],
  ])("negotiates %s and lists tools", async (_name, versionNegotiation) => {
    const transport = new StdioClientTransport({
      command: process.env.MCP_E2E_COMMAND ?? "node",
      args: ["dist/index.js"],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const client = new Client(
      { name: "stdio-e2e", version: "1.0.0" },
      versionNegotiation ? { versionNegotiation } : undefined,
    );

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(12);
      expect(tools.some((tool) => tool.name === "get-bcra-metodologia")).toBe(true);
    } finally {
      await client.close();
    }
    expect(stderr).toBe("");
  });
});
