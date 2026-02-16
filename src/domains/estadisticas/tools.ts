import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EstadisticasApi } from "./api.js";
import { varHistoryInput } from "./schemas.js";
import { toolError, toolSuccess } from "../../shared/mcp/response.js";

export const registerEstadisticasTools = (
  server: McpServer,
  api: EstadisticasApi
): void => {
  server.tool("get-bcra-variables", async () => {
    try {
      const data = await api.getVariables();
      return toolSuccess(data);
    } catch (error) {
      return toolError(error);
    }
  });

  server.tool(
    "get-bcra-var-hist",
    varHistoryInput,
    async ({
      idVariable,
      desde,
      hasta,
    }: {
      idVariable: number;
      desde?: string;
      hasta?: string;
    }) => {
      try {
        const data = await api.getVariableHistory({ idVariable, desde, hasta });
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );
};

export default registerEstadisticasTools;
