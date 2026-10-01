import { readSheet, type SheetData } from "read-excel-file/node";
import type { z } from "zod";
import type { BcraApiContext, BcraHttpClient } from "../../shared/http/bcraClient.js";
import { toRequestOptions } from "../../shared/http/bcraClient.js";
import { DomainApiError } from "../../shared/http/errors.js";
import type { seriesExcelResponseSchema } from "./schemas.js";

const DOCUMENT_PATH =
  "/archivos/Pdfs/PublicacionesEstadisticas/Listado%20API_Series.xlsx";
const SOURCE_URL = `https://www.bcra.gob.ar${DOCUMENT_PATH}`;
const SOURCE_PAGE = "https://www.bcra.gob.ar/datos-monetarios-diarios/";
const EXPECTED_HEADERS = [
  "idVariable_API",
  "descripcion",
  "tipoSerie",
  "periodicidad",
  "unidadExpresion",
  "moneda",
];

type SeriesExcelResponse = z.infer<typeof seriesExcelResponseSchema>;
type SeriesExcelRow = SeriesExcelResponse["results"][number];

export type SeriesExcelParams = {
  idVariable?: number;
  buscar?: string;
  limit: number;
  offset: number;
};

const invalidSpreadsheet = (): DomainApiError =>
  new DomainApiError({
    kind: "UPSTREAM_SCHEMA_MISMATCH",
    message: "BCRA spreadsheet has an unexpected structure",
    source: "bcra",
  });

const asText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const parseRows = async (bytes: Uint8Array): Promise<SeriesExcelRow[]> => {
  let sheet: SheetData;
  try {
    sheet = await readSheet(Buffer.from(bytes), 1);
  } catch {
    throw invalidSpreadsheet();
  }

  const headers = sheet[0];
  if (!headers || EXPECTED_HEADERS.some((header, index) => headers[index] !== header)) {
    throw invalidSpreadsheet();
  }

  const results: SeriesExcelRow[] = [];
  for (const row of sheet.slice(1)) {
    if (row.every((cell) => cell === null)) {
      continue;
    }
    const rawId = row[0];
    const idVariable = typeof rawId === "number" ? rawId : Number(asText(rawId));
    const values = row.slice(1, 6).map(asText);
    if (
      !Number.isSafeInteger(idVariable) ||
      idVariable <= 0 ||
      values.some((value) => !value)
    ) {
      throw invalidSpreadsheet();
    }
    const [descripcion, tipoSerie, periodicidad, unidadExpresion, moneda] = values as [
      string,
      string,
      string,
      string,
      string,
    ];
    results.push({
      idVariable,
      descripcion,
      tipoSerie,
      periodicidad,
      unidadExpresion,
      moneda,
    });
  }
  if (results.length === 0) {
    throw invalidSpreadsheet();
  }
  return results;
};

export interface SeriesExcelApi {
  getCatalog(
    params: SeriesExcelParams,
    context?: BcraApiContext,
  ): Promise<SeriesExcelResponse>;
}

export const createSeriesExcelApi = (client: BcraHttpClient): SeriesExcelApi => ({
  async getCatalog(params, context) {
    if (!client.getDocument) {
      throw new DomainApiError({
        kind: "UNSUPPORTED_CAPABILITY",
        message: "BCRA document downloads are unavailable in this client",
        source: "mcp-bcra",
      });
    }
    const bytes = await client.getDocument(DOCUMENT_PATH, toRequestOptions(context));
    const all = await parseRows(bytes);
    const search = params.buscar?.trim().toLocaleLowerCase("es-AR");
    const matches = all.filter(
      (row) =>
        (params.idVariable === undefined || row.idVariable === params.idVariable) &&
        (!search || row.descripcion.toLocaleLowerCase("es-AR").includes(search)),
    );
    return {
      sourceUrl: SOURCE_URL,
      sourcePage: SOURCE_PAGE,
      format: "XLSX",
      total: matches.length,
      results: matches.slice(params.offset, params.offset + params.limit),
    };
  },
});
