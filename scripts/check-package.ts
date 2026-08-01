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
  version: string;
  license: string;
  bin: Record<string, string>;
};
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
