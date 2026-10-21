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

const listToolNames = async (entry: string, cwd: string): Promise<string[]> => {
  const transport = new StdioClientTransport({
    command: "node",
    args: [entry],
    cwd,
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
  let names: string[];
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    names = tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
  }
  if (stderr !== "") {
    throw new Error(`Server ${entry} wrote to stderr: ${stderr}`);
  }
  return names;
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

  // The expected catalog comes from the checkout's own build, so adding a tool
  // does not require editing this script.
  const expected = await listToolNames(join(root, "dist", "index.js"), root);
  const packaged = await listToolNames(
    join(consumer, "node_modules", "mcp-bcra", "dist", "index.js"),
    consumer,
  );
  if (
    expected.length === 0 ||
    packaged.join("\n") !== expected.join("\n") ||
    !packaged.includes("get-bcra-metodologia")
  ) {
    throw new Error(
      `Unexpected packaged tool catalog (${packaged.length} tools, expected ${expected.length})`,
    );
  }
  console.log(`Packaged binary smoke OK: modern MCP, ${packaged.length} tools`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
