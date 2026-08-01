import type { McpServer } from "@modelcontextprotocol/server";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import type { EstadisticasCambiariasApi } from "./api.js";
import {
  emptyFxInputSchema,
  estadisticasCambiariasResponseSchema,
  fxQuoteByCurrencySchema,
  fxQuotesSchema,
} from "./schemas.js";

export const registerEstadisticasCambiariasTools = (
  server: McpServer,
  api: EstadisticasCambiariasApi,
): void => {
  registerMcpTool(
    server,
    "get-bcra-fx-currencies",
    {
      title: "Maestro de monedas",
      description:
        "Lista las monedas publicadas por la API de estadísticas cambiarias del BCRA.",
      inputSchema: emptyFxInputSchema,
      dataSchema: estadisticasCambiariasResponseSchema,
    },
    ({ idioma }, context) =>
      api.getCurrencies({ idioma, signal: context.mcpReq.signal }),
  );

  registerMcpTool(
    server,
    "get-bcra-fx-quotes",
    {
      title: "Cotizaciones cambiarias",
      description:
        "Consulta las cotizaciones de monedas publicadas por el BCRA para una fecha opcional.",
      inputSchema: fxQuotesSchema,
      dataSchema: estadisticasCambiariasResponseSchema,
    },
    ({ idioma, ...params }, context) =>
      api.getQuotes(params, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );

  registerMcpTool(
    server,
    "get-bcra-fx-quote-by-currency",
    {
      title: "Cotización por moneda",
      description:
        "Consulta la serie de cotizaciones de una moneda del BCRA con rango y paginación.",
      inputSchema: fxQuoteByCurrencySchema,
      dataSchema: estadisticasCambiariasResponseSchema,
    },
    ({ idioma, ...params }, context) =>
      api.getQuoteByCurrency(params, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );
};

export default registerEstadisticasCambiariasTools;
