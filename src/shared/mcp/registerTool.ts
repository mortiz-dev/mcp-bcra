import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolHandlerResult } from "./response.js";

type ToolRegistrationConfig = {
  inputSchema?: unknown;
};

type ToolRegistrationCallback = (
  args: unknown
) => ToolHandlerResult | Promise<ToolHandlerResult>;

type ToolRegistrar = {
  registerTool(
    name: string,
    config: ToolRegistrationConfig,
    callback: ToolRegistrationCallback
  ): unknown;
};

export const registerMcpTool = (
  server: McpServer,
  name: string,
  config: ToolRegistrationConfig,
  callback: ToolRegistrationCallback
): void => {
  const registrar = server as unknown as ToolRegistrar;
  registrar.registerTool(name, config, callback);
};
