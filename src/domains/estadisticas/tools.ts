import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EstadisticasApi } from "./api.js";
import { variablesSchema, varHistorySchema } from "./schemas.js";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import { toolError, toolSuccess } from "../../shared/mcp/response.js";

export const registerEstadisticasTools = (
  server: McpServer,
  api: EstadisticasApi
): void => {
  registerMcpTool(
    server,
    "get-bcra-variables",
    { inputSchema: variablesSchema },
    async (args: unknown) => {
      try {
        const { limit, offset } = variablesSchema.parse(args ?? {});
        const data = await api.getVariables({ limit, offset });
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );

  registerMcpTool(
    server,
    "get-bcra-var-hist",
    { inputSchema: varHistorySchema },
    async (args: unknown) => {
      try {
        const { idVariable, desde, hasta, limit, offset } =
          varHistorySchema.parse(args);
        const data = await api.getVariableHistory({
          idVariable,
          desde,
          hasta,
          limit,
          offset,
        });
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );
};

export default registerEstadisticasTools;
