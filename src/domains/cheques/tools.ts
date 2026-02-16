import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ChequesApi } from "./api.js";
import { clientIdInput } from "./schemas.js";
import { toolError, toolSuccess } from "../../shared/mcp/response.js";

export const registerChequesTools = (server: McpServer, api: ChequesApi): void => {
  server.tool(
    "get-bcra-client-cheques-rechazados",
    clientIdInput,
    async ({ clientId }: { clientId: string }) => {
      try {
        const data = await api.getRejectedChecks(clientId);
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool("get-bcra-entities", async () => {
    try {
      const data = await api.getEntities();
      return toolSuccess(data);
    } catch (error) {
      return toolError(error);
    }
  });
};

export default registerChequesTools;
