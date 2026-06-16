import { describe, expect, it, vi } from "vitest";
import { registerCentralDeudoresTools } from "../src/domains/centralDeudores/tools.js";
import { CentralDeudoresApi } from "../src/domains/centralDeudores/api.js";
import { registerChequesTools } from "../src/domains/cheques/tools.js";
import { ChequesApi } from "../src/domains/cheques/api.js";
import { registerEstadisticasTools } from "../src/domains/estadisticas/tools.js";
import { EstadisticasApi } from "../src/domains/estadisticas/api.js";
import { registerEstadisticasCambiariasTools } from "../src/domains/estadisticasCambiarias/tools.js";
import { EstadisticasCambiariasApi } from "../src/domains/estadisticasCambiarias/api.js";
import { registerTransparenciaTools } from "../src/domains/transparencia/tools.js";
import { TransparenciaApi } from "../src/domains/transparencia/api.js";
import { DomainApiError } from "../src/shared/http/errors.js";
import { FakeServer, parseToolResult } from "./helpers/fakeServer.js";

describe("domain tools", () => {
  it("central deudores tool returns success payload", async () => {
    const fakeServer = new FakeServer();
    const api: CentralDeudoresApi = {
      getClientDebt: vi.fn().mockResolvedValue({ id: "ok" }),
      getClientDebtHistorical: vi.fn().mockResolvedValue({}),
    };

    registerCentralDeudoresTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-client-central-deudores")?.handler;

    expect(handler).toBeTypeOf("function");
    const result = await handler!({ clientId: "301" });

    expect(parseToolResult(result)).toEqual({ ok: true, data: { id: "ok" } });
  });

  it("cheques tool maps errors to MCP error payload", async () => {
    const fakeServer = new FakeServer();
    const api: ChequesApi = {
      getRejectedChecks: vi.fn().mockRejectedValue(
        new DomainApiError({
          kind: "HTTP_ERROR",
          message: "boom",
          source: "bcra",
          statusCode: 500,
        })
      ),
      getEntities: vi.fn().mockResolvedValue({}),
      getReportedCheck: vi.fn().mockResolvedValue({}),
    };

    registerChequesTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-client-cheques-rechazados")?.handler;
    const result = await handler!({ clientId: "301" });

    expect(parseToolResult(result)).toEqual({
      ok: false,
      error: {
        kind: "HTTP_ERROR",
        message: "boom",
        source: "bcra",
        statusCode: 500,
      },
    });
  });

  it("estadisticas v4 tool expects idVariable and optional dates", async () => {
    const fakeServer = new FakeServer();
    const api: EstadisticasApi = {
      getVariables: vi.fn().mockResolvedValue({}),
      getVariableHistory: vi.fn().mockResolvedValue({ serie: [] }),
    };

    registerEstadisticasTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-var-hist")?.handler;

    const result = await handler!({
      idVariable: 1,
      desde: "2024-01-01",
      hasta: "2024-01-31",
      limit: 10,
      offset: 0,
    });

    expect(api.getVariableHistory).toHaveBeenCalledWith({
      idVariable: 1,
      desde: "2024-01-01",
      hasta: "2024-01-31",
      limit: 10,
      offset: 0,
    });
    expect(parseToolResult(result)).toEqual({ ok: true, data: { serie: [] } });
  });

  it("estadisticas v4 variables tool accepts pagination", async () => {
    const fakeServer = new FakeServer();
    const api: EstadisticasApi = {
      getVariables: vi.fn().mockResolvedValue({ results: [] }),
      getVariableHistory: vi.fn().mockResolvedValue({}),
    };

    registerEstadisticasTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-variables")?.handler;

    const result = await handler!({ limit: 5, offset: 10 });

    expect(api.getVariables).toHaveBeenCalledWith({ limit: 5, offset: 10 });
    expect(parseToolResult(result)).toEqual({ ok: true, data: { results: [] } });
  });

  it("estadisticas v4 variables tool accepts no arguments", async () => {
    const fakeServer = new FakeServer();
    const api: EstadisticasApi = {
      getVariables: vi.fn().mockResolvedValue({ results: [] }),
      getVariableHistory: vi.fn().mockResolvedValue({}),
    };

    registerEstadisticasTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-variables")?.handler;

    const result = await handler!(undefined as never);

    expect(api.getVariables).toHaveBeenCalledWith({
      limit: undefined,
      offset: undefined,
    });
    expect(parseToolResult(result)).toEqual({ ok: true, data: { results: [] } });
  });

  it("cheques denunciados tool validates and forwards check lookup", async () => {
    const fakeServer = new FakeServer();
    const api: ChequesApi = {
      getRejectedChecks: vi.fn().mockResolvedValue({}),
      getEntities: vi.fn().mockResolvedValue({}),
      getReportedCheck: vi.fn().mockResolvedValue({ denunciado: true }),
    };

    registerChequesTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-cheque-denunciado")?.handler;

    const result = await handler!({
      codigoEntidad: 11,
      numeroCheque: "000123",
    });

    expect(api.getReportedCheck).toHaveBeenCalledWith({
      codigoEntidad: 11,
      numeroCheque: "000123",
    });
    expect(parseToolResult(result)).toEqual({
      ok: true,
      data: { denunciado: true },
    });
  });

  it("estadisticas cambiarias tool forwards quote filters", async () => {
    const fakeServer = new FakeServer();
    const api: EstadisticasCambiariasApi = {
      getCurrencies: vi.fn().mockResolvedValue({}),
      getQuotes: vi.fn().mockResolvedValue({ quotes: [] }),
      getQuoteByCurrency: vi.fn().mockResolvedValue({}),
    };

    registerEstadisticasCambiariasTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-fx-quotes")?.handler;

    const result = await handler!({
      fecha: "2024-01-31",
    });

    expect(api.getQuotes).toHaveBeenCalledWith({
      fecha: "2024-01-31",
    });
    expect(parseToolResult(result)).toEqual({
      ok: true,
      data: { quotes: [] },
    });
  });

  it("estadisticas cambiarias quotes tool accepts no arguments", async () => {
    const fakeServer = new FakeServer();
    const api: EstadisticasCambiariasApi = {
      getCurrencies: vi.fn().mockResolvedValue({}),
      getQuotes: vi.fn().mockResolvedValue({ quotes: [] }),
      getQuoteByCurrency: vi.fn().mockResolvedValue({}),
    };

    registerEstadisticasCambiariasTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-fx-quotes")?.handler;

    const result = await handler!(undefined as never);

    expect(api.getQuotes).toHaveBeenCalledWith({
      fecha: undefined,
    });
    expect(parseToolResult(result)).toEqual({
      ok: true,
      data: { quotes: [] },
    });
  });

  it("transparencia tool maps product input to api call", async () => {
    const fakeServer = new FakeServer();
    const api: TransparenciaApi = {
      getProduct: vi.fn().mockResolvedValue({ producto: "ok" }),
    };

    registerTransparenciaTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-transparencia-producto")?.handler;

    const result = await handler!({
      producto: "tarjetas",
      codigoEntidad: 11,
    });

    expect(api.getProduct).toHaveBeenCalledWith({
      producto: "tarjetas",
      codigoEntidad: 11,
    });
    expect(parseToolResult(result)).toEqual({
      ok: true,
      data: { producto: "ok" },
    });
  });

  it("tool validation errors are returned as MCP error payloads", async () => {
    const fakeServer = new FakeServer();
    const api: TransparenciaApi = {
      getProduct: vi.fn().mockResolvedValue({}),
    };

    registerTransparenciaTools(fakeServer as never, api);
    const handler = fakeServer.tools.get("get-bcra-transparencia-producto")?.handler;

    const result = await handler!({
      producto: "productoInexistente",
      codigoEntidad: -1,
    });

    expect(api.getProduct).not.toHaveBeenCalled();
    expect(parseToolResult(result)).toMatchObject({
      ok: false,
      error: {
        kind: "UNKNOWN",
        source: "mcp-bcra",
      },
    });
  });
});
