import { createAnalisisApi } from "../src/domains/analisis/api.js";
import { createBcraHttpClient } from "../src/shared/http/bcraClient.js";
import { parseBcraResponse } from "../src/shared/http/responseSchema.js";

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
  `Live smoke OK: snapshot fx=${tipoCambio.ultimo.valor}@${tipoCambio.ultimo.fecha} id=${tipoCambio.idVariable} reservas=${reservasInternacionales.ultimo.valor}@${reservasInternacionales.ultimo.fecha} id=${reservasInternacionales.idVariable} base=${baseMonetaria.ultimo.valor}@${baseMonetaria.ultimo.fecha} id=${baseMonetaria.idVariable} politica=${tasaPolitica.ultimo.valor}@${tasaPolitica.ultimo.fecha} id=${tasaPolitica.idVariable} vigente=${tasaPolitica.vigente}`,
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
  const ranking = await analisis.rankRates({ producto, limit: 1 });
  const top = ranking.resultados[0];
  console.log(
    `Live smoke OK: ranking ${producto} total=${ranking.total} campo=${ranking.campoOrden} top=${top?.codigoEntidad ?? "none"} tasa=${top ? JSON.stringify(top.tasas) : "{}"}`,
  );
}
