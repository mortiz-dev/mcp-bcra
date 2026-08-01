import { describe, expect, it, vi } from "vitest";
import { createCentralDeudoresApi } from "../src/domains/centralDeudores/api.js";
import { createChequesApi } from "../src/domains/cheques/api.js";
import { createEstadisticasApi } from "../src/domains/estadisticas/api.js";
import { createEstadisticasCambiariasApi } from "../src/domains/estadisticasCambiarias/api.js";
import { createTransparenciaApi } from "../src/domains/transparencia/api.js";
import type { BcraHttpClient } from "../src/shared/http/bcraClient.js";

const upstreamResponse = { status: 200, results: [] };

const mockClient = () => {
  const getJson = vi.fn().mockResolvedValue(upstreamResponse);
  return { client: { getJson } satisfies BcraHttpClient, getJson };
};

describe("domain API modules", () => {
  it("builds Central de Deudores paths and forwards locale/signal", async () => {
    const { client, getJson } = mockClient();
    const signal = new AbortController().signal;
    const api = createCentralDeudoresApi(client);

    await api.getClientDebt("20123456789", { idioma: "en-US", signal });
    await api.getClientDebtHistorical("20123456789");

    expect(getJson).toHaveBeenNthCalledWith(
      1,
      "/CentralDeDeudores/v1.0/Deudas/20123456789",
      undefined,
      { locale: "en-US", signal },
    );
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      "/CentralDeDeudores/v1.0/Deudas/Historicas/20123456789",
      undefined,
      undefined,
    );
  });

  it("builds cheque paths", async () => {
    const { client, getJson } = mockClient();
    const api = createChequesApi(client);

    await api.getRejectedChecks("30123456789");
    await api.getEntities();
    await api.getReportedCheck({ codigoEntidad: 11, numeroCheque: "000123" });

    expect(getJson).toHaveBeenNthCalledWith(
      1,
      "/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/30123456789",
      undefined,
      undefined,
    );
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      "/cheques/v1.0/entidades",
      undefined,
      undefined,
    );
    expect(getJson).toHaveBeenNthCalledWith(
      3,
      "/cheques/v1.0/denunciados/11/000123",
      undefined,
      undefined,
    );
  });

  it("forwards every Estadísticas v4 filter and methodology query", async () => {
    const { client, getJson } = mockClient();
    const api = createEstadisticasApi(client);

    await api.getVariables({
      idVariable: 1,
      categoria: "Principales Variables",
      tipoSerie: "Saldos",
      periodicidad: "D",
      unidadExpresion: "Millones",
      limit: 10,
      offset: 5,
    });
    await api.getVariableHistory({
      idVariable: 7,
      desde: "2024-01-01",
      hasta: "2024-01-31",
      limit: 20,
      offset: 10,
    });
    await api.getMethodology({ idVariable: 7, limit: 1, offset: 0 });

    expect(getJson).toHaveBeenNthCalledWith(
      1,
      "/estadisticas/v4.0/Monetarias",
      {
        idVariable: 1,
        categoria: "Principales Variables",
        tipoSerie: "Saldos",
        periodicidad: "D",
        unidadExpresion: "Millones",
        limit: 10,
        offset: 5,
      },
      undefined,
    );
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      "/estadisticas/v4.0/Monetarias/7",
      {
        desde: "2024-01-01",
        hasta: "2024-01-31",
        limit: 20,
        offset: 10,
      },
      undefined,
    );
    expect(getJson).toHaveBeenNthCalledWith(
      3,
      "/estadisticas/v4.0/metodologia",
      { idVariable: 7, limit: 1, offset: 0 },
      undefined,
    );
  });

  it("builds currency endpoints and query params", async () => {
    const { client, getJson } = mockClient();
    const api = createEstadisticasCambiariasApi(client);

    await api.getCurrencies();
    await api.getQuotes({ fecha: "2024-01-31" });
    await api.getQuoteByCurrency({
      codMoneda: "USD",
      fechadesde: "2024-02-01",
      fechahasta: "2024-02-29",
      limit: 10,
      offset: 1,
    });

    expect(getJson).toHaveBeenNthCalledWith(
      1,
      "/estadisticascambiarias/v1.0/Maestros/Divisas",
      undefined,
      undefined,
    );
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      "/estadisticascambiarias/v1.0/Cotizaciones",
      { fecha: "2024-01-31" },
      undefined,
    );
    expect(getJson).toHaveBeenNthCalledWith(
      3,
      "/estadisticascambiarias/v1.0/Cotizaciones/USD",
      {
        fechadesde: "2024-02-01",
        fechahasta: "2024-02-29",
        limit: 10,
        offset: 1,
      },
      undefined,
    );
  });

  it.each([
    ["cajasAhorros", "CajasAhorros"],
    ["paquetes", "PaquetesProductos"],
    ["plazosFijos", "PlazosFijos"],
    ["prestamosPrendarios", "Prestamos/Prendarios"],
    ["prestamosHipotecarios", "Prestamos/Hipotecarios"],
    ["prestamosPersonales", "Prestamos/Personales"],
    ["tarjetas", "TarjetasCredito"],
  ] as const)("maps Transparencia %s to %s", async (producto, path) => {
    const { client, getJson } = mockClient();
    const api = createTransparenciaApi(client);

    await api.getProduct({ producto });
    expect(getJson).toHaveBeenCalledWith(
      `/transparencia/v1.0/${path}`,
      { codigoEntidad: undefined },
      undefined,
    );
  });

  it("rejects an unexpected successful upstream shape", async () => {
    const client: BcraHttpClient = {
      getJson: vi.fn().mockResolvedValue({ unexpected: true }),
    };
    await expect(createChequesApi(client).getEntities()).rejects.toMatchObject({
      kind: "UPSTREAM_SCHEMA_MISMATCH",
    });
  });
});
