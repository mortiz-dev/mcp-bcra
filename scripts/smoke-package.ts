import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = process.cwd();
const workspace = mkdtempSync(join(tmpdir(), "mcp-bcra-package-smoke-"));
const consumer = join(workspace, "consumer");
const npmCache = join(workspace, "npm-cache");
mkdirSync(consumer);
mkdirSync(npmCache);

const run = (command: string, args: string[], cwd: string) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: npmCache },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout;
};

try {
  const packOutput = run(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", workspace],
    root,
  );
  const packed = JSON.parse(packOutput) as Array<{ filename: string }>;
  const filename = packed[0]?.filename;
  if (!filename) {
    throw new Error("npm pack did not return a tarball filename");
  }

  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "mcp-bcra-smoke-consumer", private: true }),
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(workspace, filename),
    ],
    consumer,
  );

  const executable = join(consumer, "node_modules", ".bin", "mcp-bcra");
  accessSync(executable, constants.X_OK);
  const transport = new StdioClientTransport({
    command: "node",
    args: [join(consumer, "node_modules", "mcp-bcra", "dist", "index.js")],
    cwd: consumer,
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const client = new Client(
    { name: "package-smoke", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    if (
      tools.length !== 12 ||
      !tools.some((tool) => tool.name === "get-bcra-metodologia")
    ) {
      throw new Error(`Unexpected packaged tool catalog (${tools.length} tools)`);
    }
  } finally {
    await client.close();
  }
  if (stderr !== "") {
    throw new Error(`Packaged server wrote to stderr: ${stderr}`);
  }
  console.log("Packaged binary smoke OK: modern MCP, 12 tools");
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
