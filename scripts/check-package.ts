import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type PackFile = { path: string; size: number };
type PackResult = {
  size: number;
  unpackedSize: number;
  files: PackFile[];
};

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  version: string;
  license: string;
  mcpName?: string;
  bin: Record<string, string>;
  engines?: { node?: string };
};
const serverJson = JSON.parse(readFileSync("server.json", "utf8")) as {
  $schema?: string;
  name?: string;
  description?: string;
  version?: string;
  repository?: { url?: string; source?: string };
  packages?: Array<{
    registryType?: string;
    identifier?: string;
    version?: string;
    registryBaseUrl?: string;
    transport?: { type?: string };
  }>;
};

const SERVER_SCHEMA =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const MCP_NAME = "io.github.mortiz-dev/mcp-bcra";

if (packageJson.mcpName !== MCP_NAME) {
  throw new Error(`package.json mcpName must be ${MCP_NAME}`);
}
if (packageJson.engines?.node !== ">=22") {
  throw new Error("package.json engines.node must be >=22");
}
if (packageJson.bin["mcp-bcra"] !== "./dist/index.js") {
  throw new Error("package.json bin mcp-bcra must point at ./dist/index.js");
}
if (serverJson.$schema !== SERVER_SCHEMA) {
  throw new Error(`server.json must use schema ${SERVER_SCHEMA}`);
}
if (serverJson.name !== packageJson.mcpName) {
  throw new Error(
    `server.json name (${serverJson.name ?? "missing"}) must match package.json mcpName`,
  );
}
if (!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(serverJson.name ?? "")) {
  throw new Error(`server.json name does not match the registry pattern`);
}
if (serverJson.version !== packageJson.version) {
  throw new Error(
    `server.json version (${serverJson.version ?? "missing"}) must match package.json`,
  );
}
if (
  typeof serverJson.description !== "string" ||
  serverJson.description.length < 1 ||
  serverJson.description.length > 100
) {
  throw new Error("server.json description must be 1–100 characters");
}
const npmPackage = serverJson.packages?.[0];
if (
  serverJson.packages?.length !== 1 ||
  npmPackage?.registryType !== "npm" ||
  npmPackage.identifier !== packageJson.name ||
  npmPackage.version !== packageJson.version ||
  npmPackage.registryBaseUrl !== "https://registry.npmjs.org" ||
  npmPackage.transport?.type !== "stdio"
) {
  throw new Error("server.json npm package entry does not match the stdio contract");
}
if (
  serverJson.repository?.url !== "https://github.com/mortiz-dev/mcp-bcra" ||
  serverJson.repository.source !== "github"
) {
  throw new Error("server.json repository must point at the GitHub source");
}
const manifestSource = readFileSync("src/manifest.ts", "utf8");
const manifestVersion = manifestSource.match(/version:\s*"([^"]+)"/)?.[1];

if (manifestVersion !== packageJson.version) {
  throw new Error(
    `Version mismatch: package=${packageJson.version}, manifest=${manifestVersion ?? "missing"}`,
  );
}
if (packageJson.license !== "MIT") {
  throw new Error(`Expected MIT license, received ${packageJson.license}`);
}

const npmCache = mkdtempSync(join(tmpdir(), "mcp-bcra-npm-cache-"));
const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: npmCache },
});
rmSync(npmCache, { recursive: true, force: true });
if (packed.status !== 0) {
  throw new Error(packed.stderr || "npm pack --dry-run failed");
}

const output = JSON.parse(packed.stdout) as PackResult[];
const result = output[0];
if (!result) {
  throw new Error("npm pack returned no package information");
}

const paths = new Set(result.files.map((file) => file.path));
const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/index.js",
  "dist/server.js",
  "dist/server.d.ts",
  ...Object.values(packageJson.bin),
].map((path) => path.replace(/^\.\//, ""));
for (const path of required) {
  if (!paths.has(path)) {
    throw new Error(`Required package file is missing: ${path}`);
  }
}

const forbidden = [
  "src/",
  "test/",
  "scripts/",
  ".env",
  "AGENTS.md",
  "GEMINI.md",
  "tsconfig.json",
  "bun.lock",
];
for (const path of paths) {
  if (forbidden.some((entry) => path === entry || path.startsWith(entry))) {
    throw new Error(`Forbidden package file was included: ${path}`);
  }
}

if (result.unpackedSize > 500 * 1024) {
  throw new Error(
    `Package is too large: ${result.unpackedSize} bytes unpacked (limit 512000)`,
  );
}

if (
  process.env.GITHUB_REF_TYPE === "tag" &&
  process.env.GITHUB_REF_NAME !== `v${packageJson.version}`
) {
  throw new Error(
    `Tag ${process.env.GITHUB_REF_NAME} does not match v${packageJson.version}`,
  );
}

console.log(
  `Package contract OK: ${result.files.length} files, ${result.unpackedSize} bytes unpacked`,
);
