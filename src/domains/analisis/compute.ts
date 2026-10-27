import { DomainApiError } from "../../shared/http/errors.js";
import type { BcraResponse } from "../../shared/http/responseSchema.js";

const MS_PER_DAY = 86_400_000;

export const REAL_RATE_FORMULA =
  "tasa_nominal_del_periodo = (TNA / 100) * (dias / 365); inflacion = CER(hasta) / CER(desde) - 1; tasa_real_del_periodo = (1 + tasa_nominal_del_periodo) / (1 + inflacion) - 1; tasa_real_anualizada = (1 + tasa_real_del_periodo) ^ (365 / dias) - 1. Las tasas de salida están en porcentaje.";

export const POLICY_STALE_DAYS = 21;
export const DEFAULT_TERM_DAYS = 30;
export const DAY_COUNT_BASIS = 365;

/**
 * Plausibility fence, recomputed on the offers still in the response.
 *
 * Iglewicz and Hoaglin (1993) modified z-score: flag x when
 * |0.6745 * (x - median) / MAD| > 3.5. MAD is the median absolute
 * deviation. The default group is the published `denominacion`; rows
 * without one share a single group. The ranking API passes one canonical
 * group per requested denomination, so accent variants share a fence.
 * A group with fewer than 8 positive rates, or with MAD 0, skips the
 * z-score and keeps only the hard floor/ceiling.
 *
 * Fixed-term TEA and card financing TEA use the raw percent scale, so a
 * high deposit rate is comparable to the center of the catalog. Loan CFT
 * uses ln(rate): the peso cross-section is too right-skewed for a linear
 * fence, which collapses below zero and would leave a 0.5% CFT in place.
 * The low mode of fixed-term TEA (UVA and USD deposits near 0) stays
 * inside the linear fence on purpose.
 *
 * Hard annual-percent rails, applied with the robust fence and also when
 * the sample is too small: plazos fijos [0, 150], loans [1, 10000], cards
 * [1, 2500]. A rate below the floor is out. A rate equal to the floor is
 * also atípico when that floor is positive: USD prendario books sit on 1,
 * and that bound is the lowest annual percent treated as a real offer.
 * The plazo-fijo floor is 0, so a zero TEA is left to the zero filter
 * and is removed before this step unless `incluirTasasCero` is set.
 *
 * When the modified z-score MAD is 0 on a sample of at least 8 rates, a
 * tied mode has collapsed the MAD (peso mortgages). The fence then uses
 * Tukey's IQR rule on the same scale, Q1 − 1.5·IQR to Q3 + 1.5·IQR. If the
 * IQR is 0 as well, the scale is the mean absolute deviation from the
 * median, converted to a MAD-equivalent with the normal-consistency ratio
 * 0.6745 / sqrt(2/π), and the same 3.5 cutoff. Only a sample with no
 * dispersion at all keeps the hard rails alone.
 */
export const MODIFIED_Z_CUTOFF = 3.5;
export const MAD_SIGMA_FACTOR = 0.6745;
export const MEAN_AD_SIGMA_FACTOR = Math.sqrt(2 / Math.PI);
export const TUKEY_IQR_FACTOR = 1.5;
export const MIN_PLAUSIBILITY_SAMPLE = 8;

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
  atipico?: boolean;
  /**
   * True when `denominacion` was empty and the currency was read from
   * the product name. Published text never sets this.
   */
  denominacionInferida?: boolean;
  posibleInconsistenciaDenominacion?: boolean;
  motivoInconsistenciaDenominacion?: string | null;
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

export type PlausibilityScale = "linear" | "log";

export type PlausibilitySpec = {
  floor: number;
  ceiling: number;
  scale: PlausibilityScale;
};

export type ProductSpec = {
  rateFields: readonly string[];
  sortField: string;
  fallbackSortField: string | null;
  defaultOrden: "asc" | "desc";
  contextFields: readonly string[];
  criterio: string;
  plausibility: PlausibilitySpec;
  /**
   * `published`: only a non-empty denominacion selects the currency.
   * Null stays unclassified (loans). `infer-missing`: a null denominacion
   * is read from the product name (fixed-term deposits). `implicit-pesos`:
   * the regime does not publish denominacion (credit cards).
   */
  denomination: "published" | "infer-missing" | "implicit-pesos";
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
    plausibility: { floor: 0, ceiling: 150, scale: "linear" },
    denomination: "infer-missing",
    criterio:
      "Se ordena por tasaEfectivaAnualMinima. Plazos fijos no publica TNA ni TEA máxima: el único campo de tasa en la respuesta es la TEA mínima. En modo entidad se conserva la oferta extrema de cada entidad. Los productos UVA suelen informar 0 porque el ajuste no está en la TEA. Si denominacion viene vacía, la moneda se infiere del nombre del producto y la fila lleva denominacionInferida true. Por defecto se excluyen tasas nulas y ceros del campo de orden; incluirTasasCero las conserva. plazoMinimoInvertirDesde y plazoMinimoInvertirHasta filtran el entero publicado en plazoMinimoInvertirDias. Ese entero no es una cantidad de días: el catálogo vivo trae 0 a 5, y el PDF del régimen lista 30, 60, 90, 180 y 360. Esta tool no traduce el código. Un 1 no es un plazo de un día. No hay filtro por tipo de entidad: Transparencia y el padrón de entidades no publican clase ni grupo.",
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
      "denominacion",
    ],
    plausibility: { floor: 1, ceiling: 10_000, scale: "log" },
    denomination: "published",
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
      "denominacion",
    ],
    plausibility: { floor: 1, ceiling: 10_000, scale: "log" },
    denomination: "published",
    criterio:
      "Se ordena por costoFinancieroEfectivoTotalMaximo y también se informa tasaEfectivaAnualMaxima. El CFT es el costo total comparable del régimen de transparencia. Si una oferta no trae CFT numérico, se usa la TEA máxima y puede no ser comparable. Por defecto, menor costo primero, dentro de una sola denominación. Por defecto se excluyen tasas nulas y ceros del campo de orden; incluirTasasCero las conserva. Un CFT distinto de cero se conserva aunque la TEA sea 0. plazoMaximoOtorgable queda en el contexto en meses, según el PDF del régimen, y no se filtra con plazoMinimoInvertirDias. No hay tipo de entidad en la respuesta.",
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
      "denominacion",
    ],
    plausibility: { floor: 1, ceiling: 10_000, scale: "log" },
    denomination: "published",
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
    plausibility: { floor: 1, ceiling: 2_500, scale: "linear" },
    denomination: "implicit-pesos",
    criterio:
      "Se ordena por tasaEfectivaAnualMaximaFinanciacion y también se informa tasaEfectivaAnualMaximaAdelantoEfectivo. Esta API no publica un costo financiero total ni denominacion. Por defecto, menor tasa de financiación primero, y el catálogo entero se trata como pesos. Por defecto se excluyen tasas nulas y ceros del campo de orden; incluirTasasCero las conserva. Esta respuesta no trae plazo ni tipo de entidad.",
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

export const offersMatchingSearch = (
  offers: readonly RankedOffer[],
  buscar?: string,
): RankedOffer[] => {
  const needle = buscar?.trim().toLocaleLowerCase("es");
  if (!needle) {
    return [...offers];
  }
  return offers.filter((offer) => searchText(offer).includes(needle));
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

const medianOf = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const groupLabel = (offer: RankedOffer): string => {
  const value = offer.contexto.denominacion;
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return "sin denominacion";
};

export const publishedDenomination = (offer: RankedOffer): string | null => {
  const value = offer.contexto.denominacion;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

const foldDenomination = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export type CanonicalDenomination = "pesos" | "uva" | "dolares" | "euros";

/**
 * Maps a published Transparencia `denominacion` to a ranking bucket.
 * Observed on 2026-10-27: "Pesos", "UVA", "Dólares estadounidenses",
 * and "Dolares estadounidenses" (mortgages, no accent). "Euros" is its
 * own bucket. Empty stays unclassified. Other labels (the regime PDF
 * also names UVIs) stay `otra` and are never folded into pesos.
 */
export const canonicalDenomination = (
  raw: unknown,
): CanonicalDenomination | "sinDenominacion" | "otra" => {
  if (typeof raw !== "string" || raw.trim() === "") {
    return "sinDenominacion";
  }
  const folded = foldDenomination(raw);
  if (folded === "pesos") {
    return "pesos";
  }
  if (folded === "uva") {
    return "uva";
  }
  if (folded === "dolares estadounidenses" || folded === "dolares") {
    return "dolares";
  }
  if (folded === "euros" || folded === "euro") {
    return "euros";
  }
  return "otra";
};

export type DenominationSplit = {
  pesos: RankedOffer[];
  uva: RankedOffer[];
  dolares: RankedOffer[];
  euros: RankedOffer[];
  sinDenominacion: RankedOffer[];
  otras: Map<string, RankedOffer[]>;
  implicitaPesos: boolean;
};

const DOLLAR_NAME = /dolar|usd|u\$s/;
const UVA_NAME = /uva/;
const EURO_NAME = /\beuros?\b|\beur\b|€/;
const PESO_NAME = /\bpesos?\b/;

const HINT_LABEL: Record<CanonicalDenomination, string> = {
  pesos: "pesos",
  uva: "UVA",
  dolares: "dólares",
  euros: "euros",
};

/**
 * Currency explicitly named in the product. Null when the name does not
 * state one, so a generic name is not treated as a peso claim.
 * UVA is tested first, then dollars, then euros, then the word pesos.
 */
export const nameDenominationHint = (
  nombreCorto: string | null,
  nombreCompleto: string | null,
): CanonicalDenomination | null => {
  const text = normalizeText(`${nombreCorto ?? ""} ${nombreCompleto ?? ""}`);
  if (UVA_NAME.test(text)) {
    return "uva";
  }
  if (DOLLAR_NAME.test(text)) {
    return "dolares";
  }
  if (EURO_NAME.test(text)) {
    return "euros";
  }
  if (PESO_NAME.test(text)) {
    return "pesos";
  }
  return null;
};

/**
 * Currency for a fixed-term row whose published `denominacion` is empty.
 * The live catalog leaves that field null and puts the currency in
 * `nombreCorto` / `nombreCompleto` (`PFUVA`, `pftrad180dusd`, `PF EURO`).
 * A name with no currency keyword is pesos. A published denominacion is
 * never passed here.
 */
export const inferMissingDenomination = (
  nombreCorto: string | null,
  nombreCompleto: string | null,
): CanonicalDenomination =>
  nameDenominationHint(nombreCorto, nombreCompleto) ?? "pesos";

const markDenominationConflict = (offer: RankedOffer): void => {
  const raw = publishedDenomination(offer);
  const hint = nameDenominationHint(offer.nombreCorto, offer.nombreCompleto);
  const published = canonicalDenomination(raw);
  if (
    raw !== null &&
    hint !== null &&
    published !== "sinDenominacion" &&
    hint !== published
  ) {
    offer.posibleInconsistenciaDenominacion = true;
    offer.motivoInconsistenciaDenominacion = `La denominación publicada es «${raw}» y el nombre del producto indica ${HINT_LABEL[hint]}.`;
    return;
  }
  offer.posibleInconsistenciaDenominacion = false;
  offer.motivoInconsistenciaDenominacion = null;
};

const pushCanonical = (
  split: DenominationSplit,
  offer: RankedOffer,
  kind: CanonicalDenomination | "sinDenominacion" | "otra",
): void => {
  if (kind === "sinDenominacion") {
    split.sinDenominacion.push(offer);
    return;
  }
  if (kind === "otra") {
    const label = publishedDenomination(offer) ?? "otra";
    const current = split.otras.get(label) ?? [];
    current.push(offer);
    split.otras.set(label, current);
    return;
  }
  split[kind].push(offer);
};

export const splitByDenomination = (
  offers: readonly RankedOffer[],
  policy: "published" | "infer-missing" | "implicit-pesos",
): DenominationSplit => {
  if (policy === "implicit-pesos") {
    for (const offer of offers) {
      offer.denominacionInferida = false;
      offer.posibleInconsistenciaDenominacion = false;
      offer.motivoInconsistenciaDenominacion = null;
    }
    return {
      pesos: [...offers],
      uva: [],
      dolares: [],
      euros: [],
      sinDenominacion: [],
      otras: new Map(),
      implicitaPesos: true,
    };
  }
  const split: DenominationSplit = {
    pesos: [],
    uva: [],
    dolares: [],
    euros: [],
    sinDenominacion: [],
    otras: new Map(),
    implicitaPesos: false,
  };
  for (const offer of offers) {
    const published = canonicalDenomination(offer.contexto.denominacion);
    markDenominationConflict(offer);
    if (published === "sinDenominacion" && policy === "infer-missing") {
      offer.denominacionInferida = true;
      pushCanonical(
        split,
        offer,
        inferMissingDenomination(offer.nombreCorto, offer.nombreCompleto),
      );
      continue;
    }
    offer.denominacionInferida = false;
    pushCanonical(split, offer, published);
  }
  return split;
};

export type PlausibilityLimit = {
  grupo: string;
  n: number;
  escala: "lineal" | "logaritmica" | "cota";
  metodo: "z-modificado" | "iqr" | "desviacion-media" | "cota";
  mediana: number | null;
  mad: number | null;
  inferior: number;
  superior: number;
};

export type DiscardedRate = {
  codigoEntidad: number;
  descripcionEntidad: string;
  nombreCorto: string | null;
  nombreCompleto: string | null;
  campo: string;
  valor: number;
  denominacion: string | null;
  denominacionInferida: boolean;
  motivo: string;
};

const quantile = (sorted: readonly number[], probability: number): number => {
  if (sorted.length === 0) {
    return 0;
  }
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (index - lower);
};

const boundsForGroup = (
  values: readonly number[],
  spec: PlausibilitySpec,
  grupo: string,
): PlausibilityLimit => {
  const fallback: PlausibilityLimit = {
    grupo,
    n: values.length,
    escala: "cota",
    metodo: "cota",
    mediana: null,
    mad: null,
    inferior: spec.floor,
    superior: spec.ceiling,
  };
  if (values.length < MIN_PLAUSIBILITY_SAMPLE) {
    return fallback;
  }
  const transformed =
    spec.scale === "log" ? values.map((value) => Math.log(value)) : [...values];
  const center = medianOf(transformed);
  const deviations = transformed.map((value) => Math.abs(value - center));
  const mad = medianOf(deviations);
  const mediana = spec.scale === "log" ? Math.exp(center) : center;
  const escala = spec.scale === "log" ? "logaritmica" : "lineal";
  const finish = (
    metodo: PlausibilityLimit["metodo"],
    dispersion: number,
    rawLower: number,
    rawUpper: number,
  ): PlausibilityLimit => {
    const inferior = spec.scale === "log" ? Math.exp(rawLower) : rawLower;
    const superior = spec.scale === "log" ? Math.exp(rawUpper) : rawUpper;
    return {
      grupo,
      n: values.length,
      escala,
      metodo,
      mediana: roundTo(mediana, 4),
      mad: roundTo(dispersion, 4),
      inferior: roundTo(Math.max(spec.floor, inferior), 4),
      superior: roundTo(Math.min(spec.ceiling, superior), 4),
    };
  };
  if (mad > 0) {
    const span = (MODIFIED_Z_CUTOFF / MAD_SIGMA_FACTOR) * mad;
    return finish("z-modificado", mad, center - span, center + span);
  }
  const sorted = [...transformed].sort((left, right) => left - right);
  const quartile1 = quantile(sorted, 0.25);
  const quartile3 = quantile(sorted, 0.75);
  const iqr = quartile3 - quartile1;
  if (iqr > 0) {
    const span = TUKEY_IQR_FACTOR * iqr;
    return finish("iqr", iqr, quartile1 - span, quartile3 + span);
  }
  const meanAd = deviations.reduce((sum, value) => sum + value, 0) / deviations.length;
  if (meanAd > 0) {
    const scaledMad = meanAd * (MAD_SIGMA_FACTOR / MEAN_AD_SIGMA_FACTOR);
    const span = (MODIFIED_Z_CUTOFF / MAD_SIGMA_FACTOR) * scaledMad;
    return finish("desviacion-media", meanAd, center - span, center + span);
  }
  return { ...fallback, mediana: roundTo(mediana, 4), mad: 0 };
};

const discardReason = (
  value: number,
  spec: PlausibilitySpec,
  limit: PlausibilityLimit,
): string | null => {
  if (value < spec.floor) {
    return `${value} está por debajo de la cota mínima ${spec.floor}`;
  }
  if (spec.floor > 0 && value === spec.floor) {
    return `${value} está en la cota mínima ${spec.floor} y se trata como atípico`;
  }
  if (value > spec.ceiling) {
    return `${value} está por encima de la cota máxima ${spec.ceiling}`;
  }
  if (value >= limit.inferior && value <= limit.superior) {
    return null;
  }
  const where = `escala ${limit.escala}, método ${limit.metodo}, grupo ${limit.grupo}, mediana ${limit.mediana}, dispersión ${limit.mad}`;
  if (value < limit.inferior) {
    return `${value} está por debajo del piso ${limit.inferior} (${where})`;
  }
  return `${value} está por encima del techo ${limit.superior} (${where})`;
};

export const partitionByPlausibility = (
  offers: readonly RankedOffer[],
  spec: PlausibilitySpec,
  groupOf: (offer: RankedOffer) => string = groupLabel,
): {
  kept: RankedOffer[];
  outliers: RankedOffer[];
  discarded: DiscardedRate[];
  limits: PlausibilityLimit[];
} => {
  const groups = new Map<string, RankedOffer[]>();
  for (const offer of offers) {
    const label = groupOf(offer);
    const current = groups.get(label) ?? [];
    current.push(offer);
    groups.set(label, current);
  }
  const limits: PlausibilityLimit[] = [];
  const kept: RankedOffer[] = [];
  const outliers: RankedOffer[] = [];
  const discarded: DiscardedRate[] = [];
  for (const [grupo, groupOffers] of groups) {
    const positive = groupOffers
      .map((offer) => offer.sortKey)
      .filter((value) => value > 0 && Number.isFinite(value));
    const limit = boundsForGroup(positive, spec, grupo);
    limits.push(limit);
    for (const offer of groupOffers) {
      const motivo = discardReason(offer.sortKey, spec, limit);
      if (motivo === null) {
        kept.push(offer);
        continue;
      }
      outliers.push(offer);
      discarded.push({
        codigoEntidad: offer.codigoEntidad,
        descripcionEntidad: offer.descripcionEntidad,
        nombreCorto: offer.nombreCorto,
        nombreCompleto: offer.nombreCompleto,
        campo: offer.campoOrden,
        valor: offer.sortKey,
        denominacion: publishedDenomination(offer),
        denominacionInferida: offer.denominacionInferida === true,
        motivo,
      });
    }
  }
  discarded.sort(
    (left, right) =>
      right.valor - left.valor || left.codigoEntidad - right.codigoEntidad,
  );
  limits.sort((left, right) => left.grupo.localeCompare(right.grupo, "es"));
  return { kept, outliers, discarded, limits };
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
