import type { McpServer } from "@modelcontextprotocol/server";
import { registerMcpTool } from "../../shared/mcp/registerTool.js";
import type { AnalisisApi } from "./api.js";
import {
  rankingInputSchema,
  rankingResponseSchema,
  realRateInputSchema,
  realRateResponseSchema,
  snapshotInputSchema,
  snapshotResponseSchema,
} from "./schemas.js";

export const registerAnalisisTools = (server: McpServer, api: AnalisisApi): void => {
  registerMcpTool(
    server,
    "get-bcra-ranking-tasas",
    {
      title: "Ranking de tasas por entidad",
      description:
        "Ordena las tasas publicadas por Transparencia para plazos fijos, préstamos personales, hipotecarios, prendarios o tarjetas. Devuelve entidad, tasa relevante, fecha y fuente.",
      inputSchema: rankingInputSchema,
      dataSchema: rankingResponseSchema,
    },
    ({ idioma, ...params }, context) =>
      api.rankRates(params, { idioma, signal: context.mcpReq.signal }),
  );

  registerMcpTool(
    server,
    "get-bcra-tasa-real-plazo-fijo",
    {
      title: "Tasa real de un plazo fijo",
      description:
        "Compara una TNA (informada o la referencia de depósitos a 30 días) con la inflación medida por el CER en un período. Devuelve nominal, inflación, tasa real, series y fórmula.",
      inputSchema: realRateInputSchema,
      dataSchema: realRateResponseSchema,
    },
    ({ idioma, ...params }, context) =>
      api.realFixedTermRate(params, { idioma, signal: context.mcpReq.signal }),
  );

  registerMcpTool(
    server,
    "get-bcra-snapshot-macro",
    {
      title: "Snapshot macro diario",
      description:
        "Resume tipo de cambio mayorista de referencia, reservas internacionales, base monetaria y tasa de política monetaria, con último valor, anterior, variación y serie usada.",
      inputSchema: snapshotInputSchema,
      dataSchema: snapshotResponseSchema,
    },
    ({ idioma }, context) =>
      api.macroSnapshot({ idioma, signal: context.mcpReq.signal }),
  );
};

export default registerAnalisisTools;
