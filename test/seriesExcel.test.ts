import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createSeriesExcelApi } from "../src/domains/seriesExcel/api.js";
import type { BcraHttpClient } from "../src/shared/http/bcraClient.js";

const fixture = () =>
  readFile(new URL("./fixtures/series-catalog.xlsx", import.meta.url));

describe("Series Excel", () => {
  it("reads the official column contract and filters with pagination", async () => {
    const bytes = await fixture();
    const getDocument = vi.fn().mockResolvedValue(bytes);
    const client: BcraHttpClient = {
      getJson: vi.fn(),
      getDocument,
    };
    const api = createSeriesExcelApi(client);

    const result = await api.getCatalog(
      { buscar: "BASE", limit: 1, offset: 0 },
      { idioma: "es-AR" },
    );
    expect(result).toMatchObject({
      total: 1,
      results: [{ idVariable: 46, descripcion: "Base monetaria" }],
      format: "XLSX",
    });
    expect(getDocument).toHaveBeenCalledWith(
      "/archivos/Pdfs/PublicacionesEstadisticas/Listado%20API_Series.xlsx",
      { locale: "es-AR", signal: undefined },
    );
    expect((await api.getCatalog({ limit: 1, offset: 1 })).results).toEqual([
      expect.objectContaining({ idVariable: 47 }),
    ]);
  });

  it("maps an invalid workbook to a typed upstream error", async () => {
    const client: BcraHttpClient = {
      getJson: vi.fn(),
      getDocument: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    };
    await expect(
      createSeriesExcelApi(client).getCatalog({ limit: 10, offset: 0 }),
    ).rejects.toMatchObject({ kind: "UPSTREAM_SCHEMA_MISMATCH" });
  });

  it("keeps JSON-only injected clients usable and reports the missing document capability", async () => {
    await expect(
      createSeriesExcelApi({ getJson: vi.fn() }).getCatalog({
        limit: 10,
        offset: 0,
      }),
    ).rejects.toMatchObject({ kind: "UNSUPPORTED_CAPABILITY", source: "mcp-bcra" });
  });
});
