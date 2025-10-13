import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manifest } from "./manifest.js";
import registerBcraTools from "./tools/bcra.js";

export const createServer = () => {
  const server = new McpServer({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
  });

  // silence node warnings that may break MCP stdout/json
  process.on("warning", () => {});

  // Register tools
  registerBcraTools(server);

  return server;
};

export default createServer;
