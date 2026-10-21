#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { resolveTransport } from "./http/config.js";
import createServer from "./server.js";

const report = (error: unknown, fallback: string): void => {
  const message = error instanceof Error ? error.message : fallback;
  console.error(`[mcp-bcra] ${message}`);
  process.exit(1);
};

try {
  const transport = resolveTransport(process.env);
  if (transport === "http") {
    void import("./http/server.js")
      .then(({ startHttpServer }) => startHttpServer(process.env))
      .catch((error: unknown) => {
        report(error, "HTTP server failed to start");
      });
  } else {
    serveStdio(() => createServer(), {
      legacy: "serve",
      onerror: (error) => {
        console.error(`[mcp-bcra] ${error.message}`);
      },
    });
  }
} catch (error) {
  report(error, "Invalid configuration");
}
