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
        "Consulta productos publicados en el régimen de transparencia del BCRA, para todas las entidades o una entidad específica.",
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
