import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EstadisticasCambiariasApi } from "./api.js";
import {
  fxQuoteByCurrencySchema,
  fxQuotesSchema,
} from "./schemas.js";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import { toolError, toolSuccess } from "../../shared/mcp/response.js";

export const registerEstadisticasCambiariasTools = (
  server: McpServer,
  api: EstadisticasCambiariasApi
): void => {
  registerMcpTool(server, "get-bcra-fx-currencies", {}, async () => {
    try {
      const data = await api.getCurrencies();
      return toolSuccess(data);
    } catch (error) {
      return toolError(error);
    }
  });

  registerMcpTool(
    server,
    "get-bcra-fx-quotes",
    { inputSchema: fxQuotesSchema },
    async (args: unknown) => {
      try {
        const { fecha } = fxQuotesSchema.parse(args ?? {});
        const data = await api.getQuotes({ fecha });
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );

  registerMcpTool(
    server,
    "get-bcra-fx-quote-by-currency",
    { inputSchema: fxQuoteByCurrencySchema },
    async (args: unknown) => {
      try {
        const { codMoneda, fechadesde, fechahasta, limit, offset } =
          fxQuoteByCurrencySchema.parse(args);
        const data = await api.getQuoteByCurrency({
          codMoneda,
          fechadesde,
          fechahasta,
          limit,
          offset,
        });
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    }
  );
};

export default registerEstadisticasCambiariasTools;
