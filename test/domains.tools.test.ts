import { describe, expect, it, vi } from "vitest";
import { registerCentralDeudoresTools } from "../src/domains/centralDeudores/tools.js";
import { CentralDeudoresApi } from "../src/domains/centralDeudores/api.js";
import { registerChequesTools } from "../src/domains/cheques/tools.js";
import { ChequesApi } from "../src/domains/cheques/api.js";
import { registerEstadisticasTools } from "../src/domains/estadisticas/tools.js";
import { EstadisticasApi } from "../src/domains/estadisticas/api.js";
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
    });

    expect(api.getVariableHistory).toHaveBeenCalledWith({
      idVariable: 1,
      desde: "2024-01-01",
      hasta: "2024-01-31",
    });
    expect(parseToolResult(result)).toEqual({ ok: true, data: { serie: [] } });
  });
});
