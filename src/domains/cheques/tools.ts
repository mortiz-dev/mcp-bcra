import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ChequesApi } from "./api.js";
import { clientIdSchema, reportedCheckSchema } from "./schemas.js";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import { toolError, toolSuccess } from "../../shared/mcp/response.js";

export const registerChequesTools = (server: McpServer, api: ChequesApi): void => {
  registerMcpTool(
    server,
    "get-bcra-client-cheques-rechazados",
    { inputSchema: clientIdSchema },
    async (args: unknown) => {
      try {
        const { clientId } = clientIdSchema.parse(args);
        const data = await api.getRejectedChecks(clientId);
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );

  registerMcpTool(server, "get-bcra-entities", {}, async () => {
    try {
      const data = await api.getEntities();
      return toolSuccess(data);
    } catch (error) {
      return toolError(error);
    }
  });

  registerMcpTool(
    server,
    "get-bcra-cheque-denunciado",
    { inputSchema: reportedCheckSchema },
    async (args: unknown) => {
      try {
        const { codigoEntidad, numeroCheque } = reportedCheckSchema.parse(args);
        const data = await api.getReportedCheck({ codigoEntidad, numeroCheque });
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );
};

export default registerChequesTools;
