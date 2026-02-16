import { describe, expect, it, vi } from "vitest";
import { createCentralDeudoresApi } from "../src/domains/centralDeudores/api.js";
import { createChequesApi } from "../src/domains/cheques/api.js";
import { createEstadisticasApi } from "../src/domains/estadisticas/api.js";
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

    expect(getJson).toHaveBeenNthCalledWith(
      1,
      "/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/301234"
    );
    expect(getJson).toHaveBeenNthCalledWith(2, "/cheques/v1.0/entidades");
  });

  it("estadisticas v4 builds endpoint and query params", async () => {
    const getJson = vi.fn().mockResolvedValue({});
    const client: BcraHttpClient = { getJson };
    const api = createEstadisticasApi(client);

    await api.getVariables();
    await api.getVariableHistory({
      idVariable: 7,
      desde: "2024-01-01",
      hasta: "2024-01-31",
    });

    expect(getJson).toHaveBeenNthCalledWith(1, "/estadisticas/v4.0/Monetarias");
    expect(getJson).toHaveBeenNthCalledWith(
      2,
      "/estadisticas/v4.0/Monetarias/7",
      {
        desde: "2024-01-01",
        hasta: "2024-01-31",
      }
    );
  });
});
