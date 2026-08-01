import type { McpServer } from "@modelcontextprotocol/server";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import type { ChequesApi } from "./api.js";
import {
  chequesResponseSchema,
  clientIdSchema,
  emptyChequesInputSchema,
  reportedCheckSchema,
} from "./schemas.js";

export const registerChequesTools = (server: McpServer, api: ChequesApi): void => {
  registerMcpTool(
    server,
    "get-bcra-client-cheques-rechazados",
    {
      title: "Cheques rechazados por CUIT/CUIL/CDI",
      description:
        "Consulta cheques rechazados asociados a una identificación en la Central de Deudores del BCRA.",
      inputSchema: clientIdSchema,
      dataSchema: chequesResponseSchema,
    },
    ({ clientId, idioma }, context) =>
      api.getRejectedChecks(clientId, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );

  registerMcpTool(
    server,
    "get-bcra-entities",
    {
      title: "Entidades financieras",
      description:
        "Lista las entidades disponibles en la API de cheques denunciados del BCRA.",
      inputSchema: emptyChequesInputSchema,
      dataSchema: chequesResponseSchema,
    },
    ({ idioma }, context) => api.getEntities({ idioma, signal: context.mcpReq.signal }),
  );

  registerMcpTool(
    server,
    "get-bcra-cheque-denunciado",
    {
      title: "Cheque denunciado",
      description:
        "Verifica un número de cheque denunciado para una entidad financiera del BCRA.",
      inputSchema: reportedCheckSchema,
      dataSchema: chequesResponseSchema,
    },
    ({ codigoEntidad, numeroCheque, idioma }, context) =>
      api.getReportedCheck(
        { codigoEntidad, numeroCheque },
        { idioma, signal: context.mcpReq.signal },
      ),
  );
};

export default registerChequesTools;
