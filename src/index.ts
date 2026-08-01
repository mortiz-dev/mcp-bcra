#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import createServer from "./server.js";

serveStdio(() => createServer(), {
  legacy: "serve",
  onerror: (error) => {
    console.error(`[mcp-bcra] ${error.message}`);
  },
});
