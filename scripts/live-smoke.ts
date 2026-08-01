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
