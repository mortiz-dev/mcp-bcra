import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays } from "../src/domains/analisis/compute.js";
import createServer from "../src/server.js";
import {
  type BcraHttpClient,
  createBcraHttpClient,
} from "../src/shared/http/bcraClient.js";
import { DomainApiError } from "../src/shared/http/errors.js";

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

const connectModernClient = async (bcraClient: BcraHttpClient) => {
  const handler = createMcpHandler(() => createServer({ client: bcraClient }));
  const transport = new StreamableHTTPClientTransport(new URL("http://mcp.test/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: "mcp-bcra-test", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  clients.push(client);
  await client.connect(transport);
  return client;
};

describe("MCP 2026-07-28 protocol", () => {
  it("negotiates modern MCP and advertises all tools with safe metadata", async () => {
    const getJson = vi.fn().mockResolvedValue({ status: 200, results: [] });
    const client = await connectModernClient({ getJson });
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get-bcra-cheque-denunciado",
      "get-bcra-client-central-deudores",
      "get-bcra-client-central-deudores-historical",
      "get-bcra-client-cheques-rechazados",
      "get-bcra-entities",
      "get-bcra-fx-currencies",
      "get-bcra-fx-quote-by-currency",
      "get-bcra-fx-quotes",
      "get-bcra-metodologia",
      "get-bcra-ranking-tasas",
      "get-bcra-series-excel-catalog",
      "get-bcra-snapshot-macro",
      "get-bcra-tasa-real-plazo-fijo",
      "get-bcra-transparencia-producto",
      "get-bcra-var-hist",
      "get-bcra-variables",
    ]);
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.outputSchema).toBeTruthy();
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        openWorldHint: true,
      });
    }
  });

  it("returns structured content and keeps text compatibility", async () => {
    const data = { status: 200, results: [{ codigoEntidad: 11 }] };
    const getJson = vi.fn().mockResolvedValue(data);
    const client = await connectModernClient({ getJson });

    const result = await client.callTool({
      name: "get-bcra-entities",
      arguments: { idioma: "en-US" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ ok: true, data });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: JSON.stringify({ ok: true, data }),
    });
    expect(getJson).toHaveBeenCalledWith(
      "/cheques/v1.0/entidades",
      undefined,
      expect.objectContaining({ locale: "en-US" }),
    );
  });

  it("executes the complete tool catalog through the real protocol", async () => {
    const seriesCatalog: Record<
      number,
      {
        descripcion: string;
        categoria: string;
        unidadExpresion: string;
        ultFechaInformada: string;
      }
    > = {
      1: {
        descripcion: "Reservas internacionales",
        categoria: "Principales Variables",
        unidadExpresion: "En millones de USD",
        ultFechaInformada: "2026-10-22",
      },
      5: {
        descripcion: "Tipo de cambio mayorista de referencia",
        categoria: "Principales Variables",
        unidadExpresion: "Pesos argentinos por dólar estadounidense",
        ultFechaInformada: "2026-10-26",
      },
      12: {
        descripcion:
          "Tasa de interés de depósitos a 30 días de plazo en entidades financieras",
        categoria: "Principales Variables",
        unidadExpresion: "En porcentaje nominal anual",
        ultFechaInformada: "2026-10-23",
      },
      15: {
        descripcion: "Base monetaria",
        categoria: "Principales Variables",
        unidadExpresion: "En millones de ARS",
        ultFechaInformada: "2026-10-22",
      },
      30: {
        descripcion: "Coeficiente de estabilización de referencia (base 2.2.02=1)",
        categoria: "Principales Variables",
        unidadExpresion: "Índice base 2.2.02=1",
        ultFechaInformada: "2026-10-26",
      },
      160: {
        descripcion: "Tasas de interés de política monetaria",
        categoria: "Series.xlsm",
        unidadExpresion: "En porcentaje nominal anual",
        ultFechaInformada: "2025-07-10",
      },
    };
    const getJson = vi.fn(
      async (
        path: string,
        query?: Record<string, string | number | boolean | undefined>,
      ) => {
        if (path === "/estadisticas/v4.0/Monetarias") {
          const id = query?.idVariable;
          const row = typeof id === "number" ? seriesCatalog[id] : undefined;
          return {
            status: 200,
            results: row ? [{ idVariable: id, ...row, ultValorInformado: 1 }] : [],
          };
        }
        if (path.startsWith("/estadisticas/v4.0/Monetarias/")) {
          const id = Number(path.split("/").pop());
          const desde = String(query?.desde ?? "");
          const hasta = String(query?.hasta ?? "");
          const detalle: Array<{ fecha: string; valor: number }> = [];
          if (desde <= hasta) {
            let cursor = hasta;
            while (cursor >= desde && detalle.length < 80) {
              detalle.push({ fecha: cursor, valor: id === 30 ? 100 : 10 });
              cursor = addDays(cursor, -1);
            }
          }
          return { status: 200, results: [{ idVariable: id, detalle }] };
        }
        if (path.includes("PlazosFijos")) {
          return {
            status: 200,
            results: [
              {
                codigoEntidad: 11,
                descripcionEntidad: "BANCO NACION",
                nombreCorto: "PFTRADICIONAL",
                nombreCompleto: "PLAZO FIJO",
                fechaInformacion: "2026-10-21",
                tasaEfectivaAnualMinima: 30,
                canalConstitucion: "Sucursal",
              },
            ],
          };
        }
        return { status: 200, results: [] };
      },
    );
    const getDocument = vi
      .fn()
      .mockResolvedValue(
        new Uint8Array(
          await import("node:fs/promises").then((fs) =>
            fs.readFile(new URL("./fixtures/series-catalog.xlsx", import.meta.url)),
          ),
        ),
      );
    const client = await connectModernClient({ getJson, getDocument });
    const calls = [
      ["get-bcra-client-central-deudores", { clientId: "20123456789" }],
      ["get-bcra-client-central-deudores-historical", { clientId: "20123456789" }],
      ["get-bcra-client-cheques-rechazados", { clientId: "20123456789" }],
      ["get-bcra-entities", {}],
      ["get-bcra-cheque-denunciado", { codigoEntidad: 11, numeroCheque: "000123" }],
      ["get-bcra-variables", { categoria: "Principales Variables", limit: 10 }],
      [
        "get-bcra-var-hist",
        { idVariable: 1, desde: "2024-01-01", hasta: "2024-01-31" },
      ],
      ["get-bcra-metodologia", { idVariable: 1 }],
      ["get-bcra-series-excel-catalog", { buscar: "base", limit: 10 }],
      ["get-bcra-fx-currencies", {}],
      ["get-bcra-fx-quotes", { fecha: "2024-01-31" }],
      ["get-bcra-fx-quote-by-currency", { codMoneda: "USD", limit: 10 }],
      ["get-bcra-transparencia-producto", { producto: "plazosFijos" }],
      ["get-bcra-ranking-tasas", { producto: "plazosFijos" }],
      ["get-bcra-tasa-real-plazo-fijo", { tasaNominalAnual: 30, plazoDias: 30 }],
      ["get-bcra-snapshot-macro", {}],
    ] as const;

    for (const [name, arguments_] of calls) {
      const result = await client.callTool({ name, arguments: arguments_ });
      expect(result.isError).not.toBe(true);
    }
    expect(getJson).toHaveBeenCalledTimes(25);
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it("marks domain failures as tool errors without leaking details", async () => {
    const getJson = vi.fn().mockRejectedValue(
      new DomainApiError({
        kind: "HTTP_ERROR",
        message: "BCRA unavailable",
        source: "bcra",
        statusCode: 503,
        details: { secret: "not-for-clients" },
      }),
    );
    const client = await connectModernClient({ getJson });
    const result = await client.callTool({
      name: "get-bcra-entities",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = result.content[0];
    expect(text?.type).toBe("text");
    if (text?.type === "text") {
      expect(JSON.parse(text.text)).toEqual({
        ok: false,
        error: {
          kind: "HTTP_ERROR",
          message: "BCRA unavailable",
          source: "bcra",
          statusCode: 503,
        },
      });
      expect(text.text).not.toContain("secret");
    }
  });

  it("rejects invalid inputs before reaching the BCRA client", async () => {
    const getJson = vi.fn().mockResolvedValue({ status: 200, results: [] });
    const client = await connectModernClient({ getJson });

    const result = await client.callTool({
      name: "get-bcra-var-hist",
      arguments: {
        idVariable: true,
        desde: "2024-02-30",
        limit: 3_001,
      },
    });
    expect(result.isError).toBe(true);
    expect(getJson).not.toHaveBeenCalled();
  });

  it("propagates MCP cancellation through the domain into fetch", async () => {
    let upstreamAborted = false;
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            upstreamAborted = true;
            reject(init.signal?.reason);
          });
        }),
    );
    const client = await connectModernClient(
      createBcraHttpClient({
        fetchFn,
        minIntervalMs: 0,
        timeoutMs: 5_000,
      }),
    );
    const controller = new AbortController();
    const call = client.callTool(
      { name: "get-bcra-entities", arguments: {} },
      { signal: controller.signal, timeout: 2_000 },
    );
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(call).rejects.toThrow();
    await vi.waitFor(() => expect(upstreamAborted).toBe(true));
  });
});
