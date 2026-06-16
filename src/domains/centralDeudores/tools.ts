import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CentralDeudoresApi } from "./api.js";
import { clientIdSchema } from "./schemas.js";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import { toolError, toolSuccess } from "../../shared/mcp/response.js";

export const registerCentralDeudoresTools = (
  server: McpServer,
  api: CentralDeudoresApi
): void => {
  registerMcpTool(
    server,
    "get-bcra-client-central-deudores",
    { inputSchema: clientIdSchema },
    async (args: unknown) => {
      try {
        const { clientId } = clientIdSchema.parse(args);
        const data = await api.getClientDebt(clientId);
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );

  registerMcpTool(
    server,
    "get-bcra-client-central-deudores-historical",
    { inputSchema: clientIdSchema },
    async (args: unknown) => {
      try {
        const { clientId } = clientIdSchema.parse(args);
        const data = await api.getClientDebtHistorical(clientId);
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );
};

export default registerCentralDeudoresTools;
