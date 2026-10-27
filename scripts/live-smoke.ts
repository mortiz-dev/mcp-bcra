import { createAnalisisApi } from "../src/domains/analisis/api.js";
import { createBcraHttpClient } from "../src/shared/http/bcraClient.js";
import { parseBcraResponse } from "../src/shared/http/responseSchema.js";

// Full Transparencia catalogs often need more than the 15s default.
process.env.BCRA_HTTP_TIMEOUT_MS ??= "45000";
const client = createBcraHttpClient();
const checks = [
  ["entities", "/cheques/v1.0/entidades", undefined],
  ["currencies", "/estadisticascambiarias/v1.0/Maestros/Divisas", undefined],
  ["variables", "/estadisticas/v4.0/Monetarias", { limit: 1 }],
  ["methodology", "/estadisticas/v4.0/metodologia", { limit: 1 }],
  ["savings", "/transparencia/v1.0/CajasAhorros", { codigoEntidad: 7 }],
  ["packages", "/transparencia/v1.0/PaquetesProductos", { codigoEntidad: 7 }],
  ["deposits", "/transparencia/v1.0/PlazosFijos", { codigoEntidad: 7 }],
  ["secured-loans", "/transparencia/v1.0/Prestamos/Prendarios", { codigoEntidad: 7 }],
  ["mortgages", "/transparencia/v1.0/Prestamos/Hipotecarios", { codigoEntidad: 7 }],
  ["personal-loans", "/transparencia/v1.0/Prestamos/Personales", { codigoEntidad: 7 }],
  ["credit-cards", "/transparencia/v1.0/TarjetasCredito", { codigoEntidad: 7 }],
] as const;

for (const [name, path, query] of checks) {
  const response = await client.getJson(path, query);
  parseBcraResponse(response, name);
  console.log(`Live smoke OK: ${name}`);
}

const analisis = createAnalisisApi(client);
const snapshot = await analisis.macroSnapshot();
const { tipoCambio, reservasInternacionales, baseMonetaria, tasaPolitica } =
  snapshot.indicadores;
console.log(
  `Live smoke OK: snapshot fx=${tipoCambio.ultimo.valor}@${tipoCambio.fechaUltimaObservacion} dias=${tipoCambio.diasDesdeUltimaObservacion} id=${tipoCambio.idVariable} reservas=${reservasInternacionales.ultimo.valor}@${reservasInternacionales.fechaUltimaObservacion} dias=${reservasInternacionales.diasDesdeUltimaObservacion} id=${reservasInternacionales.idVariable} base=${baseMonetaria.ultimo.valor}@${baseMonetaria.fechaUltimaObservacion} dias=${baseMonetaria.diasDesdeUltimaObservacion} id=${baseMonetaria.idVariable} politica=${tasaPolitica.ultimo.valor}@${tasaPolitica.fechaUltimaObservacion} dias=${tasaPolitica.diasDesdeUltimaObservacion} id=${tasaPolitica.idVariable} vigente=${tasaPolitica.vigente}`,
);

const realRate = await analisis.realFixedTermRate({ plazoDias: 30 });
console.log(
  `Live smoke OK: real-rate nominal=${realRate.tasaNominalAnual} inflacion=${realRate.inflacionPeriodo} real=${realRate.tasaRealPeriodo} cer=${realRate.series.inflacion.idVariable} ref=${realRate.series.nominal?.idVariable ?? "input"} ${realRate.desde}..${realRate.hasta}`,
);

for (const producto of [
  "plazosFijos",
  "prestamosPersonales",
  "prestamosHipotecarios",
  "prestamosPrendarios",
  "tarjetas",
] as const) {
  const ranking = await analisis.rankRates({
    producto,
    limit: 3,
    denominacion: "todas",
  });
  console.log(
    `Live smoke OK: ranking ${producto} ceros=${ranking.ofertasTasaCero} sinDenominacion=${ranking.ofertasSinDenominacion} otra=${ranking.ofertasOtraDenominacion}`,
  );
  for (const slice of ranking.rankings) {
    const top = slice.resultados
      .map(
        (row) =>
          `${row.posicion}:${row.codigoEntidad}:${row.tasas[row.campoOrden]}:${row.denominacionInferida ? "inferida" : "publicada"}:${row.nombreCorto ?? ""}`,
      )
      .join(" | ");
    const bounds = slice.limitesPlausibilidad
      .map(
        (limit) =>
          `${limit.grupo} n=${limit.n} ${limit.escala} [${limit.inferior},${limit.superior}]`,
      )
      .join(" ; ");
    const discarded = slice.valoresDescartados
      .slice(0, 8)
      .map((row) => `${row.codigoEntidad}:${row.valor}:${row.denominacion ?? ""}`)
      .join(",");
    console.log(
      `Live smoke slice ${producto} ${slice.denominacion} implicita=${slice.implicita} total=${slice.total} descartados=${slice.valoresDescartados.length} top=${top}`,
    );
    console.log(`Live smoke bounds ${producto} ${slice.denominacion}: ${bounds}`);
    console.log(
      `Live smoke discarded ${producto} ${slice.denominacion}: ${discarded}${slice.valoresDescartados.length > 8 ? ",..." : ""}`,
    );
  }
}

const comparableDeposits = await analisis.rankRates({
  producto: "plazosFijos",
  denominacion: "todas",
  plazoMinimoInvertirDesde: 1,
  plazoMinimoInvertirHasta: 1,
  limit: 1,
});
const comparableSlices = comparableDeposits.rankings
  .map((slice) => {
    const top = slice.resultados[0];
    return `${slice.denominacion} total=${slice.total} top=${top?.codigoEntidad ?? "none"} plazo=${String(top?.contexto.plazoMinimoInvertirDias ?? "")} tasa=${top ? JSON.stringify(top.tasas) : "{}"}`;
  })
  .join(" || ");
console.log(
  `Live smoke OK: ranking plazosFijos plazo=1 fuera=${comparableDeposits.ofertasFueraDePlazo} sinDenominacion=${comparableDeposits.ofertasSinDenominacion} ${comparableSlices}`,
);
