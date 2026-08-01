import type { McpServer } from "@modelcontextprotocol/server";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import type { EstadisticasApi } from "./api.js";
import {
  estadisticasResponseSchema,
  methodologySchema,
  varHistorySchema,
  variablesSchema,
} from "./schemas.js";

export const registerEstadisticasTools = (
  server: McpServer,
  api: EstadisticasApi,
): void => {
  registerMcpTool(
    server,
    "get-bcra-variables",
    {
      title: "Variables monetarias",
      description:
        "Lista y filtra las variables monetarias publicadas por Estadísticas v4 del BCRA.",
      inputSchema: variablesSchema,
      dataSchema: estadisticasResponseSchema,
    },
    ({ idioma, ...params }, context) =>
      api.getVariables(params, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );

  registerMcpTool(
    server,
    "get-bcra-var-hist",
    {
      title: "Historia de variable monetaria",
      description:
        "Consulta la serie histórica de una variable monetaria del BCRA, con rango de fechas y paginación.",
      inputSchema: varHistorySchema,
      dataSchema: estadisticasResponseSchema,
    },
    ({ idioma, ...params }, context) =>
      api.getVariableHistory(params, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );

  registerMcpTool(
    server,
    "get-bcra-metodologia",
    {
      title: "Metodología de variables monetarias",
      description:
        "Consulta la metodología oficial de las variables monetarias publicadas por el BCRA.",
      inputSchema: methodologySchema,
      dataSchema: estadisticasResponseSchema,
    },
    ({ idioma, ...params }, context) =>
      api.getMethodology(params, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );
};

export default registerEstadisticasTools;
