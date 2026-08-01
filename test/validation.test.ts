import { describe, expect, it } from "vitest";
import { clientIdSchema } from "../src/domains/centralDeudores/schemas.js";
import { reportedCheckSchema } from "../src/domains/cheques/schemas.js";
import {
  varHistorySchema,
  variablesSchema,
} from "../src/domains/estadisticas/schemas.js";
import { fxQuoteByCurrencySchema } from "../src/domains/estadisticasCambiarias/schemas.js";
import { transparenciaProductInputSchema } from "../src/domains/transparencia/schemas.js";

describe("tool input validation", () => {
  it("requires exactly 11 numeric CUIT/CUIL/CDI characters", () => {
    expect(clientIdSchema.safeParse({ clientId: "20123456789" }).success).toBe(true);
    expect(clientIdSchema.safeParse({ clientId: "20-12345678-9" }).success).toBe(false);
    expect(clientIdSchema.safeParse({ clientId: "123" }).success).toBe(false);
  });

  it("does not coerce booleans or numeric strings into numbers", () => {
    expect(
      reportedCheckSchema.safeParse({
        codigoEntidad: true,
        numeroCheque: "123",
      }).success,
    ).toBe(false);
    expect(variablesSchema.safeParse({ limit: "10", offset: "0" }).success).toBe(false);
  });

  it("rejects invalid calendar dates and inverted ranges", () => {
    expect(
      varHistorySchema.safeParse({
        idVariable: 1,
        desde: "2024-02-30",
      }).success,
    ).toBe(false);
    expect(
      varHistorySchema.safeParse({
        idVariable: 1,
        desde: "2024-03-01",
        hasta: "2024-02-29",
      }).success,
    ).toBe(false);
    expect(
      fxQuoteByCurrencySchema.safeParse({
        codMoneda: "USD",
        fechadesde: "2024-03-01",
        fechahasta: "2024-02-29",
      }).success,
    ).toBe(false);
  });

  it("bounds history pagination and currency/entity identifiers", () => {
    expect(varHistorySchema.safeParse({ idVariable: 1, limit: 3_000 }).success).toBe(
      true,
    );
    expect(varHistorySchema.safeParse({ idVariable: 1, limit: 3_001 }).success).toBe(
      false,
    );
    expect(fxQuoteByCurrencySchema.safeParse({ codMoneda: "usd" }).success).toBe(false);
    expect(
      reportedCheckSchema.safeParse({
        codigoEntidad: 2_147_483_648,
        numeroCheque: "123",
      }).success,
    ).toBe(false);
  });

  it("supports only current Transparencia products and optional entity", () => {
    expect(
      transparenciaProductInputSchema.safeParse({ producto: "plazosFijos" }).success,
    ).toBe(true);
    expect(
      transparenciaProductInputSchema.safeParse({
        producto: "cuentasCorrientes",
      }).success,
    ).toBe(false);
    expect(
      transparenciaProductInputSchema.safeParse({
        producto: "tarjetas",
        codigoEntidad: 11,
        idioma: "en-US",
      }).success,
    ).toBe(true);
  });
});
