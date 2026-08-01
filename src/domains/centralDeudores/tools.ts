import type { McpServer } from "@modelcontextprotocol/server";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import type { CentralDeudoresApi } from "./api.js";
import { centralDeudoresResponseSchema, clientIdSchema } from "./schemas.js";

export const registerCentralDeudoresTools = (
  server: McpServer,
  api: CentralDeudoresApi,
): void => {
  registerMcpTool(
    server,
    "get-bcra-client-central-deudores",
    {
      title: "Deuda actual por CUIT/CUIL/CDI",
      description:
        "Consulta la situación crediticia actual publicada por la Central de Deudores del BCRA.",
      inputSchema: clientIdSchema,
      dataSchema: centralDeudoresResponseSchema,
    },
    ({ clientId, idioma }, context) =>
      api.getClientDebt(clientId, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );

  registerMcpTool(
    server,
    "get-bcra-client-central-deudores-historical",
    {
      title: "Historial de deuda por CUIT/CUIL/CDI",
      description:
        "Consulta el historial publicado por la Central de Deudores del BCRA.",
      inputSchema: clientIdSchema,
      dataSchema: centralDeudoresResponseSchema,
    },
    ({ clientId, idioma }, context) =>
      api.getClientDebtHistorical(clientId, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );
};

export default registerCentralDeudoresTools;
