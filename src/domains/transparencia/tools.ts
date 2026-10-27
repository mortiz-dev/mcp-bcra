import type { McpServer } from "@modelcontextprotocol/server";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import type { TransparenciaApi } from "./api.js";
import {
  transparenciaProductInputSchema,
  transparenciaResponseSchema,
} from "./schemas.js";

export const registerTransparenciaTools = (
  server: McpServer,
  api: TransparenciaApi,
): void => {
  registerMcpTool(
    server,
    "get-bcra-transparencia-producto",
    {
      title: "Producto financiero comparable",
      description:
        "Devuelve el detalle crudo de un producto del régimen de transparencia, para todas las entidades o una. Para ordenar quién paga o cobra más, usá get-bcra-ranking-tasas.",
      inputSchema: transparenciaProductInputSchema,
      dataSchema: transparenciaResponseSchema,
    },
    ({ idioma, ...params }, context) =>
      api.getProduct(params, {
        idioma,
        signal: context.mcpReq.signal,
      }),
  );
};

export default registerTransparenciaTools;
