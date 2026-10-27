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
        "Úsala para comparar bancos: quién paga más un plazo fijo o cobra menos un préstamo o una tarjeta. Ordena las tasas de Transparencia dentro de una sola denominación. El default es pesos. denominacion acepta pesos, uva, dolares, euros o todas. todas devuelve un ranking separado por moneda en rankings y deja resultados vacío. En plazos fijos denominacion viene vacía: se infiere del nombre del producto (UVA; dolar, dólar, USD o u$s; euro, euros, EUR o €; si no, pesos), la fila lleva denominacionInferida true y se ve el nombre usado. Una denominacion publicada gana. Si esa publicada no coincide con el nombre, posibleInconsistenciaDenominacion es true y se informa el motivo. En préstamos, una fila sin denominacion no es pesos. Las tarjetas no publican denominacion: el catálogo entero es pesos con implicita true. Por defecto excluye tasas nulas y ceros del campo de orden; incluirTasasCero las vuelve a incluir. Un CFT distinto de cero se conserva aunque otra tasa de la misma oferta sea 0. También aparta, dentro de la denominación, tasas fuera de un intervalo de plausibilidad (z modificado 3.5; si la MAD es 0, IQR o desviación media) y las lista en valoresDescartados. Una tasa igual a una cota mínima positiva (el piso 1 de préstamos y tarjetas) es atípica. incluirValoresAtipicos las incluye con atipico true. En plazos fijos, plazoMinimoInvertirDesde y plazoMinimoInvertirHasta filtran el entero publicado en plazoMinimoInvertirDias. Ese entero no es una cantidad de días: el catálogo vivo trae 0 a 5 y esta tool no lo traduce. No hay filtro por tipo de entidad.",
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
        "Úsala para saber si un plazo fijo le gana a la inflación. Compara una TNA (informada o la referencia de depósitos a 30 días, serie 12) con la inflación medida por el CER (serie 30) en un período. Devuelve nominal, inflación, tasa real, series y fórmula. No usa el IPC mensual ni TAMAR ni BADLAR.",
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
        "Úsala para el dólar oficial de hoy, las reservas, la base monetaria y la tasa de política. Resume el tipo de cambio mayorista de referencia (serie 5), las reservas internacionales (serie 1), la base monetaria (serie 15) y la tasa de política monetaria (serie 160, TNA). Cada indicador trae la fecha de la última observación, los días desde esa fecha, el valor anterior, la variación y vigente (true si la última observación tiene como máximo 21 días). La serie 160 está discontinuada aguas arriba: el BCRA dejó de actualizarla el 2025-07-10. Esta tool no la sustituye por TAMAR, BADLAR ni tasas de pases.",
      inputSchema: snapshotInputSchema,
      dataSchema: snapshotResponseSchema,
    },
    ({ idioma }, context) =>
      api.macroSnapshot({ idioma, signal: context.mcpReq.signal }),
  );
};

export default registerAnalisisTools;
