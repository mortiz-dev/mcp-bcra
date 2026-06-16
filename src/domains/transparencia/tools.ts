import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TransparenciaApi } from "./api.js";
import { transparenciaProductInputSchema } from "./schemas.js";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import { toolError, toolSuccess } from "../../shared/mcp/response.js";

export const registerTransparenciaTools = (
  server: McpServer,
  api: TransparenciaApi
): void => {
  registerMcpTool(
    server,
    "get-bcra-transparencia-producto",
    { inputSchema: transparenciaProductInputSchema },
    async (args: unknown) => {
      try {
        const { producto, codigoEntidad } =
          transparenciaProductInputSchema.parse(args);
        const data = await api.getProduct({ producto, codigoEntidad });
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );
};

export default registerTransparenciaTools;
