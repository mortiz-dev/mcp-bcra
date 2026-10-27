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
        "Ordena las tasas publicadas por Transparencia para plazos fijos, préstamos personales, hipotecarios, prendarios o tarjetas, dentro de una sola denominación. El default es pesos, el texto publicado «Pesos». denominacion acepta pesos, uva («UVA»), dolares («Dólares estadounidenses» o «Dolares estadounidenses») o todas. todas devuelve un ranking separado por moneda en rankings y deja resultados vacío: no mezcla monedas en una lista ordenada. Una fila sin denominacion no cuenta como pesos (en plazos fijos el campo viene nulo) y se informa en ofertasSinDenominacion. Las tarjetas no publican denominacion: el catálogo entero es pesos con implicita true. Por defecto excluye tasas nulas y ceros del campo de orden; incluirTasasCero las vuelve a incluir. Un CFT distinto de cero se conserva aunque otra tasa de la misma oferta sea 0. También aparta, por defecto y dentro de la denominación pedida, tasas fuera de un intervalo de plausibilidad (z modificado 3.5) y las lista en valoresDescartados; incluirValoresAtipicos las incluye con atipico true. Devuelve entidad, tasas, fecha y fuente. En plazos fijos, plazoMinimoInvertirDesde y plazoMinimoInvertirHasta filtran el entero publicado en plazoMinimoInvertirDias. Ese entero no es una cantidad de días: el catálogo vivo trae 0 a 5 y esta tool no lo traduce a 30, 60, 90, 180 o 360. Un 1 no es un plazo de un día. No hay filtro por tipo de entidad: Transparencia y el padrón de entidades no publican clase ni grupo.",
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
        "Resume tipo de cambio mayorista de referencia (serie 5), reservas internacionales (serie 1), base monetaria (serie 15) y la tasa de política monetaria (serie 160, TNA). Cada indicador trae la fecha de la última observación, los días desde esa fecha, el valor anterior, la variación y vigente (true si la última observación tiene como máximo 21 días). La serie 160 está discontinuada aguas arriba: el BCRA dejó de actualizarla el 2025-07-10. Esta tool no la sustituye por TAMAR, BADLAR ni tasas de pases.",
      inputSchema: snapshotInputSchema,
      dataSchema: snapshotResponseSchema,
    },
    ({ idioma }, context) =>
      api.macroSnapshot({ idioma, signal: context.mcpReq.signal }),
  );
};

export default registerAnalisisTools;
