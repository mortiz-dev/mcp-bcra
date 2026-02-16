import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manifest } from "./manifest.js";
import registerAllTools from "./tools/registerAllTools.js";

export const createServer = () => {
  const server = new McpServer({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
  });

  registerAllTools(server);

  return server;
};

export default createServer;
