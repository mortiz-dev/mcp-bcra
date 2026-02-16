import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CentralDeudoresApi } from "./api.js";
import { clientIdInput } from "./schemas.js";
import { toolError, toolSuccess } from "../../shared/mcp/response.js";

export const registerCentralDeudoresTools = (
  server: McpServer,
  api: CentralDeudoresApi
): void => {
  server.tool(
    "get-bcra-client-central-deudores",
    clientIdInput,
    async ({ clientId }: { clientId: string }) => {
      try {
        const data = await api.getClientDebt(clientId);
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "get-bcra-client-central-deudores-historical",
    clientIdInput,
    async ({ clientId }: { clientId: string }) => {
      try {
        const data = await api.getClientDebtHistorical(clientId);
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );
};

export default registerCentralDeudoresTools;
