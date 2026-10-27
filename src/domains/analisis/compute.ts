import { DomainApiError } from "../../shared/http/errors.js";
import type { BcraResponse } from "../../shared/http/responseSchema.js";

const MS_PER_DAY = 86_400_000;

export const REAL_RATE_FORMULA =
  "tasa_nominal_del_periodo = (TNA / 100) * (dias / 365); inflacion = CER(hasta) / CER(desde) - 1; tasa_real_del_periodo = (1 + tasa_nominal_del_periodo) / (1 + inflacion) - 1; tasa_real_anualizada = (1 + tasa_real_del_periodo) ^ (365 / dias) - 1. Las tasas de salida están en porcentaje.";

export const POLICY_STALE_DAYS = 21;
export const DEFAULT_TERM_DAYS = 30;
export const DAY_COUNT_BASIS = 365;

export type SeriesSpec = {
  id: number;
  descriptions: readonly string[];
  descriptionMode: "exact" | "includes";
  categories?: readonly string[];
  unitIncludes?: readonly string[];
  unitExcludes?: readonly string[];
};

/**
 * Identificadores verificados contra Estadísticas v4 el 2026-10-27,
 * en es-AR y en-US. El id se pide directo; la descripción y la categoría
 * rechazan una reasignación silenciosa.
 */
export const SERIES = {
  tipoCambio: {
    id: 5,
    descriptions: ["tipo de cambio mayorista de referencia", "wholesale exchange rate"],
    descriptionMode: "exact",
    categories: ["principales variables", "main variables"],
  },
  reservas: {
    id: 1,
    descriptions: ["reservas internacionales", "bcra's international reserves"],
    descriptionMode: "exact",
    categories: ["principales variables", "main variables"],
  },
  baseMonetaria: {
    id: 15,
    descriptions: ["base monetaria", "monetary base - total"],
    descriptionMode: "exact",
    categories: ["principales variables", "main variables"],
  },
  tasaPolitica: {
    id: 160,
    descriptions: ["politica monetaria", "monetary policy"],
    descriptionMode: "includes",
    unitIncludes: ["nominal anual", "nominal annual"],
    unitExcludes: ["efectiv"],
  },
  cer: {
    id: 30,
    descriptions: [
      "coeficiente de estabilizacion de referencia",
      "reference stabilization coefficient",
    ],
    descriptionMode: "includes",
    categories: ["principales variables", "main variables"],
  },
  plazoFijo30: {
    id: 12,
    descriptions: ["depositos a 30 dias", "30-day deposits"],
    descriptionMode: "includes",
    categories: ["principales variables", "main variables"],
    unitIncludes: ["nominal anual", "nominal annual"],
  },
} as const satisfies Record<string, SeriesSpec>;

export type Observation = { fecha: string; valor: number };

export type VariableMeta = {
  idVariable: number;
  descripcion: string;
  categoria: string;
  unidadExpresion: string;
  ultFechaInformada: string;
};

export type RankedOffer = {
  codigoEntidad: number;
  descripcionEntidad: string;
  nombreCorto: string | null;
  nombreCompleto: string | null;
  fechaInformacion: string | null;
  campoOrden: string;
  tasas: Record<string, number>;
  contexto: Record<string, string | number | null>;
  sortKey: number;
};

export const normalizeText = (value: string): string =>
  value
    .replace(/\u00a0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const addDays = (isoDate: string, days: number): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw seriesMismatch(`BCRA returned a non-ISO date: ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const daysBetween = (desde: string, hasta: string): number => {
  const start = Date.parse(`${desde}T00:00:00.000Z`);
  const end = Date.parse(`${hasta}T00:00:00.000Z`);
  return Math.round((end - start) / MS_PER_DAY);
};

export const utcDate = (date: Date): string => date.toISOString().slice(0, 10);

export const roundTo = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const seriesMismatch = (message: string, details?: unknown): DomainApiError =>
  new DomainApiError({
    kind: "UPSTREAM_SCHEMA_MISMATCH",
    message,
    source: "bcra",
    details,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (value: unknown, field: string, id: number): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw seriesMismatch(`BCRA variable ${id} is missing a string ${field}`, { field });
  }
  return value;
};

export const assertSeriesIdentity = (
  meta: Pick<
    VariableMeta,
    "idVariable" | "descripcion" | "categoria" | "unidadExpresion"
  >,
  spec: SeriesSpec,
): void => {
  const description = normalizeText(meta.descripcion);
  const category = normalizeText(meta.categoria);
  const unit = normalizeText(meta.unidadExpresion);
  const descriptionOk =
    spec.descriptionMode === "exact"
      ? spec.descriptions.includes(description)
      : spec.descriptions.some((needle) => description.includes(needle));
  const categoryOk =
    spec.categories === undefined || spec.categories.includes(category);
  const unitOk =
    spec.unitIncludes === undefined ||
    spec.unitIncludes.some((needle) => unit.includes(needle));
  const unitRejected =
    spec.unitExcludes?.some((needle) => unit.includes(needle)) ?? false;
  if (!descriptionOk || !categoryOk || !unitOk || unitRejected) {
    throw seriesMismatch(
      `BCRA variable ${spec.id} did not match the expected series identity`,
      {
        descripcion: meta.descripcion,
        categoria: meta.categoria,
        unidadExpresion: meta.unidadExpresion,
      },
    );
  }
};

export const readVariable = (
  response: BcraResponse,
  spec: SeriesSpec,
): VariableMeta => {
  if (!Array.isArray(response.results)) {
    throw seriesMismatch("BCRA variable catalog results were not an array");
  }
  const row = response.results.find(
    (item) => isRecord(item) && item.idVariable === spec.id,
  );
  if (!isRecord(row)) {
    throw seriesMismatch(`BCRA variable catalog did not include id ${spec.id}`);
  }
  const descripcion = requireString(row.descripcion, "descripcion", spec.id);
  const categoria = requireString(row.categoria, "categoria", spec.id);
  const unidadExpresion = requireString(
    row.unidadExpresion,
    "unidadExpresion",
    spec.id,
  );
  const ultFechaInformada = requireString(
    row.ultFechaInformada,
    "ultFechaInformada",
    spec.id,
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ultFechaInformada)) {
    throw seriesMismatch(`BCRA variable ${spec.id} has a non-ISO ultFechaInformada`);
  }
  const meta = {
    idVariable: spec.id,
    descripcion,
    categoria,
    unidadExpresion,
    ultFechaInformada,
  };
  assertSeriesIdentity(meta, spec);
  return meta;
};

export const readObservations = (
  response: BcraResponse,
  idVariable: number,
): Observation[] => {
  if (!Array.isArray(response.results)) {
    throw seriesMismatch("BCRA history results were not an array");
  }
  const entry = response.results.find(
    (item) => isRecord(item) && item.idVariable === idVariable,
  );
  if (!isRecord(entry) || !Array.isArray(entry.detalle)) {
    throw seriesMismatch(
      `BCRA history for variable ${idVariable} had no detalle array`,
    );
  }
  const points: Observation[] = [];
  for (const item of entry.detalle) {
    if (!isRecord(item)) {
      continue;
    }
    const { fecha, valor } = item;
    if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      continue;
    }
    if (typeof valor !== "number" || !Number.isFinite(valor)) {
      continue;
    }
    points.push({ fecha, valor });
  }
  points.sort((left, right) =>
    left.fecha < right.fecha ? 1 : left.fecha > right.fecha ? -1 : 0,
  );
  return points;
};

export const observationOn = (
  points: readonly Observation[],
  fecha: string,
): Observation => {
  const found = points.find((point) => point.fecha === fecha);
  if (!found) {
    throw seriesMismatch(`BCRA series has no observation on ${fecha}`);
  }
  return found;
};

export const observationOnOrBefore = (
  points: readonly Observation[],
  fecha: string,
): Observation => {
  const found = points.find((point) => point.fecha <= fecha);
  if (!found) {
    throw seriesMismatch(`BCRA series has no observation on or before ${fecha}`);
  }
  return found;
};

export const variation = (
  latest: number,
  previous: number | null,
): { variacion: number | null; variacionPorcentual: number | null } => {
  if (previous === null) {
    return { variacion: null, variacionPorcentual: null };
  }
  return {
    variacion: roundTo(latest - previous, 6),
    variacionPorcentual:
      previous === 0 ? null : roundTo(((latest - previous) / previous) * 100, 6),
  };
};

export const computeRealRate = (input: {
  tnaPercent: number;
  dias: number;
  cerDesde: number;
  cerHasta: number;
}): {
  tasaNominalPeriodo: number;
  inflacionPeriodo: number;
  tasaRealPeriodo: number;
  tasaRealAnualizada: number;
} => {
  if (input.dias <= 0 || input.cerDesde <= 0 || input.cerHasta <= 0) {
    throw seriesMismatch(
      "CER observations must be positive and the term must be at least one day",
    );
  }
  const nominal = (input.tnaPercent / 100) * (input.dias / DAY_COUNT_BASIS);
  const inflation = input.cerHasta / input.cerDesde - 1;
  if (1 + inflation <= 0) {
    throw seriesMismatch(
      "CER inflation left no positive price index for the real rate",
    );
  }
  const real = (1 + nominal) / (1 + inflation) - 1;
  if (1 + real <= 0) {
    throw seriesMismatch("The real rate cannot be annualized for this period");
  }
  const annualized = (1 + real) ** (DAY_COUNT_BASIS / input.dias) - 1;
  return {
    tasaNominalPeriodo: roundTo(nominal * 100, 4),
    inflacionPeriodo: roundTo(inflation * 100, 4),
    tasaRealPeriodo: roundTo(real * 100, 4),
    tasaRealAnualizada: roundTo(annualized * 100, 4),
  };
};

export type ProductSpec = {
  rateFields: readonly string[];
  sortField: string;
  fallbackSortField: string | null;
  defaultOrden: "asc" | "desc";
  contextFields: readonly string[];
  criterio: string;
};

export const PRODUCT_SPECS = {
  plazosFijos: {
    rateFields: ["tasaEfectivaAnualMinima"],
    sortField: "tasaEfectivaAnualMinima",
    fallbackSortField: null,
    defaultOrden: "desc",
    contextFields: [
      "canalConstitucion",
      "plazoMinimoInvertirDias",
      "denominacion",
      "montoMinimoInvertir",
    ],
    criterio:
      "Se ordena por tasaEfectivaAnualMinima. Plazos fijos no publica TNA ni TEA máxima: el único campo de tasa en la respuesta es la TEA mínima. En modo entidad se conserva la oferta extrema de cada entidad. Los productos UVA suelen informar 0 porque el ajuste no está en la TEA. Por defecto se excluyen tasas nulas y ceros del campo de orden; incluirTasasCero las conserva. plazoMinimoInvertirDesde y plazoMinimoInvertirHasta filtran el entero publicado en plazoMinimoInvertirDias. Ese entero no es una cantidad de días: el catálogo vivo trae 0 a 5, y el PDF del régimen lista 30, 60, 90, 180 y 360. Esta tool no traduce el código. Un 1 no es un plazo de un día. No hay filtro por tipo de entidad: Transparencia y el padrón de entidades no publican clase ni grupo.",
  },
  prestamosPersonales: {
    rateFields: ["tasaEfectivaAnualMaxima", "costoFinancieroEfectivoTotalMaximo"],
    sortField: "costoFinancieroEfectivoTotalMaximo",
    fallbackSortField: "tasaEfectivaAnualMaxima",
    defaultOrden: "asc",
    contextFields: [
      "denominacion",
      "tipoTasa",
      "plazoMaximoOtorgable",
      "destinoFondos",
    ],
    criterio:
      "Se ordena por costoFinancieroEfectivoTotalMaximo y también se informa tasaEfectivaAnualMaxima. El CFT es el costo total comparable del régimen de transparencia. Si una oferta no trae CFT numérico, se usa la TEA máxima y puede no ser comparable. Por defecto, menor costo primero. Por defecto se excluyen tasas nulas y ceros del campo de orden; incluirTasasCero las conserva. Un CFT distinto de cero se conserva aunque la TEA sea 0. plazoMaximoOtorgable queda en el contexto en meses, según el PDF del régimen, y no se filtra con plazoMinimoInvertirDias. No hay tipo de entidad en la respuesta.",
  },
  prestamosHipotecarios: {
    rateFields: ["tasaEfectivaAnualMaxima", "costoFinancieroEfectivoTotalMaximo"],
    sortField: "costoFinancieroEfectivoTotalMaximo",
    fallbackSortField: "tasaEfectivaAnualMaxima",
    defaultOrden: "asc",
    contextFields: [
      "denominacion",
      "tipoTasa",
      "plazoMaximoOtorgable",
      "destinoFondos",
    ],
    criterio:
      "Se ordena por costoFinancieroEfectivoTotalMaximo y también se informa tasaEfectivaAnualMaxima. El CFT es el costo total comparable del régimen de transparencia. Si una oferta no trae CFT numérico, se usa la TEA máxima y puede no ser comparable. Por defecto, menor costo primero. Pesos y UVA quedan en el mismo ranking: use buscar para separarlos. Por defecto se excluyen tasas nulas y ceros del campo de orden; incluirTasasCero las conserva. Un CFT distinto de cero se conserva aunque la TEA sea 0. plazoMaximoOtorgable queda en el contexto en meses, según el PDF del régimen, y no se filtra con plazoMinimoInvertirDias. No hay tipo de entidad en la respuesta.",
  },
  prestamosPrendarios: {
    rateFields: ["tasaEfectivaAnualMaxima", "costoFinancieroEfectivoTotalMaximo"],
    sortField: "costoFinancieroEfectivoTotalMaximo",
    fallbackSortField: "tasaEfectivaAnualMaxima",
    defaultOrden: "asc",
    contextFields: [
      "denominacion",
      "tipoTasa",
      "plazoMaximoOtorgable",
      "destinoFondos",
    ],
    criterio:
      "Se ordena por costoFinancieroEfectivoTotalMaximo y también se informa tasaEfectivaAnualMaxima. El CFT es el costo total comparable del régimen de transparencia. Si una oferta no trae CFT numérico, se usa la TEA máxima y puede no ser comparable. Por defecto, menor costo primero. Por defecto se excluyen tasas nulas y ceros del campo de orden; incluirTasasCero las conserva. Un CFT distinto de cero se conserva aunque la TEA sea 0. plazoMaximoOtorgable queda en el contexto en meses, según el PDF del régimen, y no se filtra con plazoMinimoInvertirDias. No hay tipo de entidad en la respuesta.",
  },
  tarjetas: {
    rateFields: [
      "tasaEfectivaAnualMaximaFinanciacion",
      "tasaEfectivaAnualMaximaAdelantoEfectivo",
    ],
    sortField: "tasaEfectivaAnualMaximaFinanciacion",
    fallbackSortField: null,
    defaultOrden: "asc",
    contextFields: ["segmento"],
    criterio:
      "Se ordena por tasaEfectivaAnualMaximaFinanciacion y también se informa tasaEfectivaAnualMaximaAdelantoEfectivo. Esta API no publica un costo financiero total. Por defecto, menor tasa de financiación primero. Por defecto se excluyen tasas nulas y ceros del campo de orden; incluirTasasCero las conserva. Esta respuesta no trae plazo ni tipo de entidad.",
  },
} as const satisfies Record<string, ProductSpec>;

const nullableText = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const contextValue = (value: unknown): string | number | null | undefined => {
  if (typeof value === "string" || typeof value === "number" || value === null) {
    return value;
  }
  return undefined;
};

export const readOffers = (
  response: BcraResponse,
  spec: ProductSpec,
): { offers: RankedOffer[]; sinTasa: number; invalid: number } => {
  if (!Array.isArray(response.results)) {
    throw seriesMismatch("BCRA transparency product results were not an array");
  }
  const offers: RankedOffer[] = [];
  let sinTasa = 0;
  let invalid = 0;
  for (const item of response.results) {
    if (!isRecord(item)) {
      invalid += 1;
      continue;
    }
    const codigoEntidad = item.codigoEntidad;
    const descripcionEntidad = item.descripcionEntidad;
    if (
      typeof codigoEntidad !== "number" ||
      !Number.isInteger(codigoEntidad) ||
      codigoEntidad <= 0 ||
      typeof descripcionEntidad !== "string" ||
      descripcionEntidad.trim() === ""
    ) {
      invalid += 1;
      continue;
    }
    const tasas: Record<string, number> = {};
    for (const field of spec.rateFields) {
      const value = item[field];
      if (typeof value === "number" && Number.isFinite(value)) {
        tasas[field] = value;
      }
    }
    const primary = tasas[spec.sortField];
    const fallback =
      spec.fallbackSortField === null ? undefined : tasas[spec.fallbackSortField];
    const sortKey = primary ?? fallback;
    const campoOrden =
      primary !== undefined
        ? spec.sortField
        : spec.fallbackSortField !== null && fallback !== undefined
          ? spec.fallbackSortField
          : null;
    if (sortKey === undefined || campoOrden === null) {
      sinTasa += 1;
      continue;
    }
    const contexto: Record<string, string | number | null> = {};
    for (const field of spec.contextFields) {
      if (!(field in item)) {
        continue;
      }
      const value = contextValue(item[field]);
      if (value !== undefined) {
        contexto[field] = value;
      }
    }
    offers.push({
      codigoEntidad,
      descripcionEntidad,
      nombreCorto: nullableText(item.nombreCorto),
      nombreCompleto: nullableText(item.nombreCompleto),
      fechaInformacion: nullableText(item.fechaInformacion),
      campoOrden,
      tasas,
      contexto,
      sortKey,
    });
  }
  if (response.results.length > 0 && offers.length === 0 && sinTasa === 0) {
    throw seriesMismatch("BCRA transparency rows had no usable entity identity");
  }
  return { offers, sinTasa, invalid };
};

const searchText = (offer: RankedOffer): string =>
  [
    offer.descripcionEntidad,
    offer.nombreCorto,
    offer.nombreCompleto,
    ...Object.values(offer.contexto).filter(
      (value): value is string => typeof value === "string",
    ),
  ]
    .join(" ")
    .toLocaleLowerCase("es");

const compareOffers = (
  left: RankedOffer,
  right: RankedOffer,
  orden: "asc" | "desc",
): number => {
  const difference =
    orden === "asc" ? left.sortKey - right.sortKey : right.sortKey - left.sortKey;
  if (difference !== 0) {
    return difference;
  }
  const byName = left.descripcionEntidad.localeCompare(right.descripcionEntidad, "es");
  if (byName !== 0) {
    return byName;
  }
  return (left.nombreCorto ?? "").localeCompare(right.nombreCorto ?? "", "es");
};

export type RankedRow = RankedOffer & { ofertasEntidad: number | null };

const preferPrimary = (offers: RankedOffer[], sortField: string): RankedOffer[] => {
  const primary = offers.filter((offer) => offer.campoOrden === sortField);
  return primary.length > 0 ? primary : offers;
};

const pickWinner = (
  pool: readonly RankedOffer[],
  orden: "asc" | "desc",
): RankedOffer => {
  const first = pool[0];
  if (!first) {
    throw seriesMismatch("Cannot rank an empty offer group");
  }
  return pool.reduce(
    (best, offer) => (compareOffers(offer, best, orden) < 0 ? offer : best),
    first,
  );
};

const groupByEntity = (
  offers: readonly RankedOffer[],
  sortField: string,
  orden: "asc" | "desc",
): RankedRow[] => {
  const groups = new Map<number, RankedOffer[]>();
  for (const offer of offers) {
    const current = groups.get(offer.codigoEntidad) ?? [];
    current.push(offer);
    groups.set(offer.codigoEntidad, current);
  }
  const winners: RankedRow[] = [];
  for (const group of groups.values()) {
    const winner = pickWinner(preferPrimary(group, sortField), orden);
    winners.push({ ...winner, ofertasEntidad: group.length });
  }
  return winners;
};

const publishedPlazoCode = (offer: RankedOffer): number | null => {
  const value = offer.contexto.plazoMinimoInvertirDias;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const applyRankingFilters = (
  offers: readonly RankedOffer[],
  options: {
    incluirTasasCero: boolean;
    plazoDesde?: number;
    plazoHasta?: number;
  },
): {
  offers: RankedOffer[];
  ofertasTasaCero: number;
  ofertasFueraDePlazo: number;
} => {
  const rated: RankedOffer[] = [];
  let ofertasTasaCero = 0;
  for (const offer of offers) {
    if (offer.sortKey === 0) {
      ofertasTasaCero += 1;
      if (!options.incluirTasasCero) {
        continue;
      }
    }
    rated.push(offer);
  }
  if (options.plazoDesde === undefined && options.plazoHasta === undefined) {
    return { offers: rated, ofertasTasaCero, ofertasFueraDePlazo: 0 };
  }
  const matched: RankedOffer[] = [];
  let ofertasFueraDePlazo = 0;
  for (const offer of rated) {
    const plazo = publishedPlazoCode(offer);
    const inside =
      plazo !== null &&
      (options.plazoDesde === undefined || plazo >= options.plazoDesde) &&
      (options.plazoHasta === undefined || plazo <= options.plazoHasta);
    if (!inside) {
      ofertasFueraDePlazo += 1;
      continue;
    }
    matched.push(offer);
  }
  return { offers: matched, ofertasTasaCero, ofertasFueraDePlazo };
};

export const rankOffers = (
  offers: readonly RankedOffer[],
  options: {
    buscar?: string;
    modo: "entidad" | "oferta";
    orden: "asc" | "desc";
    sortField: string;
    limit: number;
  },
): { ranked: RankedRow[]; total: number } => {
  const needle = options.buscar?.trim().toLocaleLowerCase("es");
  const matched = needle
    ? offers.filter((offer) => searchText(offer).includes(needle))
    : [...offers];
  const rows: RankedRow[] =
    options.modo === "oferta"
      ? matched.map((offer) => ({ ...offer, ofertasEntidad: null }))
      : groupByEntity(matched, options.sortField, options.orden);
  rows.sort((left, right) => compareOffers(left, right, options.orden));
  return { ranked: rows.slice(0, options.limit), total: rows.length };
};
