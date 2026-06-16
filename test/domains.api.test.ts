import { describe, expect, it, vi } from "vitest";
import { createCentralDeudoresApi } from "../src/domains/centralDeudores/api.js";
import { createChequesApi } from "../src/domains/cheques/api.js";
import { createEstadisticasApi } from "../src/domains/estadisticas/api.js";
import { createEstadisticasCambiariasApi } from "../src/domains/estadisticasCambiarias/api.js";
import { createTransparenciaApi } from "../src/domains/transparencia/api.js";
import { BcraHttpClient } from "../src/shared/http/bcraClient.js";

describe("domain api modules", () => {
  it("central deudores builds expected endpoints", async () => {
    const getJson = vi.fn().mockResolvedValue({});
    const client: BcraHttpClient = { getJson };
    const api = createCentralDeudoresApi(client);

    await api.getClientDebt("20-1");
    await api.getClientDebtHistorical("20-1");

    expect(getJson).toHaveBeenNthCalledWith(
      1,
      "/CentralDeDeudores/v1.0/Deudas/20-1"
    );
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      "/CentralDeDeudores/v1.0/Deudas/Historicas/20-1"
    );
  });

  it("cheques builds expected endpoints", async () => {
    const getJson = vi.fn().mockResolvedValue({});
    const client: BcraHttpClient = { getJson };
    const api = createChequesApi(client);

    await api.getRejectedChecks("301234");
    await api.getEntities();
    await api.getReportedCheck({ codigoEntidad: 11, numeroCheque: "000123" });

    expect(getJson).toHaveBeenNthCalledWith(
      1,
      "/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/301234"
    );
    expect(getJson).toHaveBeenNthCalledWith(2, "/cheques/v1.0/entidades");
    expect(getJson).toHaveBeenNthCalledWith(
      3,
      "/cheques/v1.0/denunciados/11/000123"
    );
  });

  it("estadisticas v4 builds endpoint and query params", async () => {
    const getJson = vi.fn().mockResolvedValue({});
    const client: BcraHttpClient = { getJson };
    const api = createEstadisticasApi(client);

    await api.getVariables({ limit: 10, offset: 5 });
    await api.getVariableHistory({
      idVariable: 7,
      desde: "2024-01-01",
      hasta: "2024-01-31",
      limit: 20,
      offset: 10,
    });

    expect(getJson).toHaveBeenNthCalledWith(1, "/estadisticas/v4.0/Monetarias", {
      limit: 10,
      offset: 5,
    });
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      "/estadisticas/v4.0/Monetarias/7",
      {
        desde: "2024-01-01",
        hasta: "2024-01-31",
        limit: 20,
        offset: 10,
      }
    );
  });

  it("estadisticas cambiarias builds endpoints and query params", async () => {
    const getJson = vi.fn().mockResolvedValue({});
    const client: BcraHttpClient = { getJson };
    const api = createEstadisticasCambiariasApi(client);

    await api.getCurrencies();
    await api.getQuotes({
      fecha: "2024-01-31",
    });
    await api.getQuoteByCurrency({
      codMoneda: "USD",
      fechadesde: "2024-02-01",
      fechahasta: "2024-02-29",
      limit: 11,
      offset: 1,
    });

    expect(getJson).toHaveBeenNthCalledWith(
      1,
      "/estadisticascambiarias/v1.0/Maestros/Divisas"
    );
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      "/estadisticascambiarias/v1.0/Cotizaciones",
      {
        fecha: "2024-01-31",
      }
    );
    expect(getJson).toHaveBeenNthCalledWith(
      3,
      "/estadisticascambiarias/v1.0/Cotizaciones/USD",
      {
        fechadesde: "2024-02-01",
        fechahasta: "2024-02-29",
        limit: 11,
        offset: 1,
      }
    );
  });

  it("transparencia builds product endpoint and query params", async () => {
    const getJson = vi.fn().mockResolvedValue({});
    const client: BcraHttpClient = { getJson };
    const api = createTransparenciaApi(client);

    await api.getProduct({ producto: "prestamosPersonales", codigoEntidad: 11 });

    expect(getJson).toHaveBeenCalledWith(
      "/transparencia/v1.0/PrestamosPersonales",
      { codigoEntidad: 11 }
    );
  });
});
