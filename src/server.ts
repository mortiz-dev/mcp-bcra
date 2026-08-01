import { McpServer } from "@modelcontextprotocol/server";
import { manifest } from "./manifest.js";
import type { BcraHttpClient } from "./shared/http/bcraClient.js";
import registerAllTools from "./tools/registerAllTools.js";

export type CreateServerOptions = {
  client?: BcraHttpClient;
};

export const createServer = (options: CreateServerOptions = {}): McpServer => {
  const server = new McpServer({
    name: manifest.name,
    title: manifest.title,
    version: manifest.version,
    description: manifest.description,
  });

  registerAllTools(server, options.client);
  return server;
};

export default createServer;
