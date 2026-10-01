import type { McpServer } from "@modelcontextprotocol/server";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import type { SeriesExcelApi } from "./api.js";
import { seriesExcelInputSchema, seriesExcelResponseSchema } from "./schemas.js";

export const registerSeriesExcelTools = (
  server: McpServer,
  api: SeriesExcelApi,
): void => {
  registerMcpTool(
    server,
    "get-bcra-series-excel-catalog",
    {
      title: "Catálogo de series en Excel",
      description:
        "Lee el listado XLSX oficial de variables de Series.xlsm del BCRA. Filtra por identificador o descripción y devuelve la fuente.",
      inputSchema: seriesExcelInputSchema,
      dataSchema: seriesExcelResponseSchema,
    },
    ({ idioma, ...params }, context) =>
      api.getCatalog(params, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );
};
