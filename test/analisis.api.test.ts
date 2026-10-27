import { describe, expect, it, vi } from "vitest";
import { createAnalisisApi } from "../src/domains/analisis/api.js";
import {
  addDays,
  canonicalDenomination,
  computeRealRate,
  daysBetween,
  inferMissingDenomination,
  PRODUCT_SPECS,
  partitionByPlausibility,
  type RankedOffer,
  splitByDenomination,
  variation,
} from "../src/domains/analisis/compute.js";
import {
  rankingInputSchema,
  rankingResponseSchema,
  realRateInputSchema,
  realRateResponseSchema,
  snapshotResponseSchema,
} from "../src/domains/analisis/schemas.js";
import type { BcraHttpClient } from "../src/shared/http/bcraClient.js";

const NOW = new Date("2026-10-27T15:00:00.000Z");
const TODAY = "2026-10-27";

const catalogs: Record<
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

const depositOffers = [
  {
    codigoEntidad: 7,
    descripcionEntidad: "BANCO GALICIA",
    nombreCorto: "PFTRADICIONAL",
    nombreCompleto: "PLAZO FIJO TRADICIONAL",
    fechaInformacion: "2026-10-22",
    tasaEfectivaAnualMinima: 21.01,
    canalConstitucion: "Home banking",
    plazoMinimoInvertirDias: 30,
    denominacion: "Pesos",
  },
  {
    codigoEntidad: 7,
    descripcionEntidad: "BANCO GALICIA",
    nombreCorto: "PFUVA",
    nombreCompleto: "PLAZO FIJO UVA",
    fechaInformacion: "2026-10-22",
    tasaEfectivaAnualMinima: 0,
    canalConstitucion: "Home banking",
    plazoMinimoInvertirDias: 90,
    denominacion: "UVA",
  },
  {
    codigoEntidad: 11,
    descripcionEntidad: "BANCO NACION",
    nombreCorto: "PFTRADICIONAL",
    nombreCompleto: "PLAZO FIJO",
    fechaInformacion: "2026-10-21",
    tasaEfectivaAnualMinima: 30,
    canalConstitucion: "Sucursal",
    plazoMinimoInvertirDias: 30,
    denominacion: "Pesos",
  },
  {
    codigoEntidad: 14,
    descripcionEntidad: "SIN TASA",
    nombreCorto: "X",
    nombreCompleto: "X",
    fechaInformacion: "2026-10-21",
  },
];

const loanOffers = [
  {
    codigoEntidad: 7,
    descripcionEntidad: "BANCO A",
    nombreCorto: "CON CFT",
    nombreCompleto: "CON CFT",
    fechaInformacion: "2026-10-01",
    costoFinancieroEfectivoTotalMaximo: 100,
    tasaEfectivaAnualMaxima: 80,
    denominacion: "Pesos",
    tipoTasa: "Fija",
  },
  {
    codigoEntidad: 7,
    descripcionEntidad: "BANCO A",
    nombreCorto: "SOLO TEA",
    nombreCompleto: "SOLO TEA",
    fechaInformacion: "2026-10-01",
    tasaEfectivaAnualMaxima: 10,
    denominacion: "Pesos",
  },
  {
    codigoEntidad: 11,
    descripcionEntidad: "BANCO B",
    nombreCorto: "BARATO",
    nombreCompleto: "BARATO",
    fechaInformacion: "2026-10-01",
    costoFinancieroEfectivoTotalMaximo: 50,
    tasaEfectivaAnualMaxima: 40,
    denominacion: "UVA",
  },
  {
    codigoEntidad: 20,
    descripcionEntidad: "CFT CHICO",
    nombreCorto: "CHICO",
    nombreCompleto: "CHICO",
    fechaInformacion: "2026-10-01",
    costoFinancieroEfectivoTotalMaximo: 0.33,
    tasaEfectivaAnualMaxima: 0,
    denominacion: "Pesos",
  },
  {
    codigoEntidad: 99,
    descripcionEntidad: "TASA CERO",
    nombreCorto: "CERO",
    nombreCompleto: "CERO",
    fechaInformacion: "2026-10-01",
    costoFinancieroEfectivoTotalMaximo: 0,
    tasaEfectivaAnualMaxima: 0,
    denominacion: "Pesos",
  },
];

const pointValue = (id: number, fecha: string): number => {
  if (id === 12) {
    return 36.5;
  }
  if (id === 30) {
    return 1_000 + daysBetween("2020-01-01", fecha);
  }
  return 100 + daysBetween("2026-01-01", fecha);
};

const detalleFor = (id: number, desde: string, hasta: string) => {
  if (id === 160) {
    if (hasta >= "2026-01-01") {
      return [];
    }
    return [
      { fecha: "2025-07-10", valor: 29 },
      { fecha: "2025-07-08", valor: 28 },
    ].filter((point) => point.fecha >= desde && point.fecha <= hasta);
  }
  const points: Array<{ fecha: string; valor: number }> = [];
  let cursor = hasta;
  while (cursor >= desde && points.length < 80) {
    points.push({ fecha: cursor, valor: pointValue(id, cursor) });
    cursor = addDays(cursor, -1);
  }
  return points;
};

const mockClient = (
  catalogsOverride?: typeof catalogs,
  offers: unknown[] = depositOffers,
) => {
  const rows = catalogsOverride ?? catalogs;
  const getJson = vi.fn(
    async (
      path: string,
      query?: Record<string, string | number | boolean | undefined>,
    ) => {
      if (path === "/estadisticas/v4.0/Monetarias") {
        const id = query?.idVariable;
        const row = typeof id === "number" ? rows[id] : undefined;
        return {
          status: 200,
          results: row
            ? [
                {
                  idVariable: id,
                  ...row,
                  ultValorInformado: 1,
                },
              ]
            : [],
        };
      }
      if (path.startsWith("/estadisticas/v4.0/Monetarias/")) {
        const id = Number(path.split("/").pop());
        const desde = String(query?.desde);
        const hasta = String(query?.hasta);
        return {
          status: 200,
          results: [{ idVariable: id, detalle: detalleFor(id, desde, hasta) }],
        };
      }
      if (path.includes("Prestamos/Personales")) {
        return { status: 200, results: loanOffers };
      }
      if (path.includes("PlazosFijos")) {
        return { status: 200, results: offers };
      }
      return { status: 200, results: [] };
    },
  );
  return { client: { getJson } satisfies BcraHttpClient, getJson };
};

const rankedOffer = (
  codigoEntidad: number,
  sortKey: number,
  campoOrden: string,
  denominacion?: string,
): RankedOffer => ({
  codigoEntidad,
  descripcionEntidad: `ENTIDAD ${codigoEntidad}`,
  nombreCorto: `P${codigoEntidad}`,
  nombreCompleto: `PRODUCTO ${codigoEntidad}`,
  fechaInformacion: "2026-10-01",
  campoOrden,
  tasas: { [campoOrden]: sortKey },
  contexto: denominacion ? { denominacion } : {},
  sortKey,
});

describe("ranking plausibility", () => {
  it("bounds a deposit sample and drops the high tail by default", () => {
    const offers = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30].map((rate, index) =>
      rankedOffer(index + 1, rate, "tasaEfectivaAnualMinima"),
    );
    offers.push(rankedOffer(72614, 97.08, "tasaEfectivaAnualMinima"));
    const result = partitionByPlausibility(
      offers,
      PRODUCT_SPECS.plazosFijos.plausibility,
    );

    expect(result.limits).toHaveLength(1);
    const limit = result.limits[0];
    expect(limit?.escala).toBe("lineal");
    expect(limit?.grupo).toBe("sin denominacion");
    expect(limit?.n).toBe(12);
    expect(limit?.superior).toBeLessThan(97.08);
    expect(limit?.inferior).toBeGreaterThanOrEqual(0);
    expect(result.kept.map((offer) => offer.sortKey)).not.toContain(97.08);
    expect(result.discarded).toEqual([
      expect.objectContaining({
        codigoEntidad: 72614,
        valor: 97.08,
        campo: "tasaEfectivaAnualMinima",
        denominacion: null,
      }),
    ]);
    expect(result.discarded[0]?.motivo).toContain("techo");
  });

  it("uses the log fence and the hard floor for loan CFT", () => {
    const pesos = [100, 120, 140, 160, 180, 200, 220, 240, 260, 300].map(
      (rate, index) =>
        rankedOffer(index + 1, rate, "costoFinancieroEfectivoTotalMaximo", "Pesos"),
    );
    pesos.push(rankedOffer(55310, 2.97, "costoFinancieroEfectivoTotalMaximo", "Pesos"));
    const dollars = [10, 11, 11.5, 12, 12.5, 13, 13.5, 14].map((rate, index) =>
      rankedOffer(100 + index, rate, "costoFinancieroEfectivoTotalMaximo", "Dólares"),
    );
    dollars.push(
      rankedOffer(55077, 0.5, "costoFinancieroEfectivoTotalMaximo", "Dólares"),
    );
    const result = partitionByPlausibility(
      [...pesos, ...dollars],
      PRODUCT_SPECS.prestamosPersonales.plausibility,
    );

    const pesosLimit = result.limits.find((limit) => limit.grupo === "Pesos");
    const dollarLimit = result.limits.find((limit) => limit.grupo === "Dólares");
    expect(pesosLimit?.escala).toBe("logaritmica");
    expect(pesosLimit?.inferior).toBeGreaterThan(2.97);
    expect(dollarLimit?.inferior).toBeGreaterThanOrEqual(1);
    expect(result.kept.some((offer) => offer.sortKey === 2.97)).toBe(false);
    expect(result.kept.some((offer) => offer.sortKey === 0.5)).toBe(false);
    expect(result.kept.some((offer) => offer.sortKey === 11)).toBe(true);
    expect(
      result.discarded.map((row) => row.valor).sort((left, right) => left - right),
    ).toEqual([0.5, 2.97]);
    expect(result.discarded.find((row) => row.valor === 0.5)?.motivo).toContain(
      "cota mínima",
    );
  });

  it("uses mean absolute deviation when MAD and IQR are both zero", () => {
    const offers = Array.from({ length: 8 }, (_, index) =>
      rankedOffer(index + 1, 20, "tasaEfectivaAnualMinima"),
    );
    offers.push(rankedOffer(99, 500, "tasaEfectivaAnualMinima"));
    const result = partitionByPlausibility(
      offers,
      PRODUCT_SPECS.plazosFijos.plausibility,
    );
    expect(result.limits[0]?.escala).toBe("lineal");
    expect(result.limits[0]?.metodo).toBe("desviacion-media");
    expect(result.limits[0]?.mad).toBeGreaterThan(0);
    expect(result.discarded.map((row) => row.valor)).toEqual([500]);
    expect(result.discarded[0]?.motivo).toContain("cota máxima");
  });

  it("uses an IQR fence when a tied mode makes the MAD zero", () => {
    const offers = [
      rankedOffer(90, 2, "costoFinancieroEfectivoTotalMaximo", "Pesos"),
      ...Array.from({ length: 3 }, (_, index) =>
        rankedOffer(index + 1, 20, "costoFinancieroEfectivoTotalMaximo", "Pesos"),
      ),
      ...Array.from({ length: 11 }, (_, index) =>
        rankedOffer(index + 10, 28.28, "costoFinancieroEfectivoTotalMaximo", "Pesos"),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        rankedOffer(index + 30, 60, "costoFinancieroEfectivoTotalMaximo", "Pesos"),
      ),
    ];
    const result = partitionByPlausibility(
      offers,
      PRODUCT_SPECS.prestamosHipotecarios.plausibility,
    );
    expect(result.limits[0]?.metodo).toBe("iqr");
    expect(result.limits[0]?.escala).toBe("logaritmica");
    expect(result.limits[0]?.inferior).toBeGreaterThan(2);
    expect(result.kept.some((offer) => offer.sortKey === 28.28)).toBe(true);
    expect(result.kept.some((offer) => offer.sortKey === 2)).toBe(false);
  });

  it("flags a rate sitting on the hard floor", () => {
    const offers = [1, 10, 11, 12, 13, 14, 15, 16].map((rate, index) =>
      rankedOffer(index + 1, rate, "costoFinancieroEfectivoTotalMaximo", "Dólares"),
    );
    const result = partitionByPlausibility(
      offers,
      PRODUCT_SPECS.prestamosPrendarios.plausibility,
    );
    expect(result.discarded.map((row) => row.valor)).toEqual([1]);
    expect(result.discarded[0]?.motivo).toContain("cota mínima");
    expect(result.kept.some((offer) => offer.sortKey === 1)).toBe(false);
    expect(result.kept.some((offer) => offer.sortKey === 10)).toBe(true);
  });

  it("shares one fence when the caller names the denomination", () => {
    const offers = [10, 11, 12, 13, 14].map((rate, index) =>
      rankedOffer(
        index + 1,
        rate,
        "costoFinancieroEfectivoTotalMaximo",
        index % 2 === 0 ? "Dólares estadounidenses" : "Dolares estadounidenses",
      ),
    );
    offers.push(
      rankedOffer(
        9,
        0.5,
        "costoFinancieroEfectivoTotalMaximo",
        "Dólares estadounidenses",
      ),
    );
    const result = partitionByPlausibility(
      offers,
      PRODUCT_SPECS.prestamosPersonales.plausibility,
      () => "dolares",
    );
    expect(result.limits.map((limit) => limit.grupo)).toEqual(["dolares"]);
    expect(result.discarded[0]?.denominacion).toBe("Dólares estadounidenses");
    expect(result.discarded[0]?.motivo).toContain("cota mínima");
  });
});

describe("denomination split", () => {
  it("infers a missing fixed-term currency from the product name", () => {
    expect(inferMissingDenomination("PFUVA", "PLAZO FIJO UVA")).toBe("uva");
    expect(
      inferMissingDenomination(
        "UVA PRECANCELABLE",
        "PLAZO FIJO PRECANCELABLE EN UNIDADES DE VALOR ADQUISITIVO UVA",
      ),
    ).toBe("uva");
    expect(inferMissingDenomination("pftrad180dusd", "plazofijotradicional")).toBe(
      "dolares",
    );
    expect(inferMissingDenomination("PF", "PLAZO FIJO EN DÓLARES")).toBe("dolares");
    expect(inferMissingDenomination("PF TRADIC HB", "PLAZO FIJO EN U$S")).toBe(
      "dolares",
    );
    expect(inferMissingDenomination("PFUVA USD", "PLAZO FIJO UVA EN DOLARES")).toBe(
      "uva",
    );
    expect(inferMissingDenomination("PF TRADICIONAL", "PLAZO FIJO EN PESOS")).toBe(
      "pesos",
    );
    expect(inferMissingDenomination("PF EURO", "PLAZO FIJO EN EUROS")).toBe("pesos");
    expect(inferMissingDenomination("PF TRADIC USS", "PLAZO FIJO TRADICIONAL")).toBe(
      "pesos",
    );
    expect(inferMissingDenomination(null, null)).toBe("pesos");
  });

  it("keeps published currencies apart and infers only a blank fixed-term row", () => {
    expect(canonicalDenomination("Pesos")).toBe("pesos");
    expect(canonicalDenomination("UVA")).toBe("uva");
    expect(canonicalDenomination("Dólares estadounidenses")).toBe("dolares");
    expect(canonicalDenomination("Dolares estadounidenses")).toBe("dolares");
    expect(canonicalDenomination("  ")).toBe("sinDenominacion");
    expect(canonicalDenomination(null)).toBe("sinDenominacion");
    expect(canonicalDenomination("Euros")).toBe("otra");
    expect(canonicalDenomination("UVI")).toBe("otra");

    const offers = [
      rankedOffer(1, 20, "tasaEfectivaAnualMinima", "Pesos"),
      rankedOffer(2, 1, "tasaEfectivaAnualMinima", "UVA"),
      rankedOffer(3, 2, "tasaEfectivaAnualMinima", "Dólares estadounidenses"),
      rankedOffer(4, 3, "tasaEfectivaAnualMinima", "Dolares estadounidenses"),
      rankedOffer(5, 4, "tasaEfectivaAnualMinima"),
      rankedOffer(6, 5, "tasaEfectivaAnualMinima", "Euros"),
    ];
    const split = splitByDenomination(offers, "published");
    expect(split.implicitaPesos).toBe(false);
    expect(split.pesos.map((offer) => offer.codigoEntidad)).toEqual([1]);
    expect(split.uva.map((offer) => offer.codigoEntidad)).toEqual([2]);
    expect(split.dolares.map((offer) => offer.codigoEntidad)).toEqual([3, 4]);
    expect(split.sinDenominacion.map((offer) => offer.codigoEntidad)).toEqual([5]);
    expect(split.otras.get("Euros")?.map((offer) => offer.codigoEntidad)).toEqual([6]);

    const cards = splitByDenomination(offers, "implicit-pesos");
    expect(cards.implicitaPesos).toBe(true);
    expect(cards.pesos).toHaveLength(offers.length);
    expect(cards.sinDenominacion).toEqual([]);
    expect(cards.uva).toEqual([]);
    expect(cards.pesos.every((offer) => offer.denominacionInferida === false)).toBe(
      true,
    );

    const named = [
      rankedOffer(11, 30, "tasaEfectivaAnualMinima"),
      rankedOffer(7, 1, "tasaEfectivaAnualMinima"),
      rankedOffer(14, 0.5, "tasaEfectivaAnualMinima"),
    ];
    const tradicional = named[0];
    const uva = named[1];
    const dolar = named[2];
    if (!tradicional || !uva || !dolar) {
      throw new Error("missing named offers");
    }
    tradicional.nombreCorto = "PFTRADICIONAL";
    tradicional.nombreCompleto = "PLAZO FIJO TRADICIONAL";
    uva.nombreCorto = "PFUVA";
    uva.nombreCompleto = "PLAZO FIJO UVA";
    dolar.nombreCorto = "pftrad180dusd";
    dolar.nombreCompleto = "plazofijotradicional";
    const inferred = splitByDenomination(named, "infer-missing");
    expect(inferred.pesos.map((offer) => offer.codigoEntidad)).toEqual([11]);
    expect(inferred.uva.map((offer) => offer.codigoEntidad)).toEqual([7]);
    expect(inferred.dolares.map((offer) => offer.codigoEntidad)).toEqual([14]);
    expect(inferred.sinDenominacion).toEqual([]);
    expect(inferred.pesos[0]?.denominacionInferida).toBe(true);
    expect(inferred.pesos[0]?.nombreCompleto).toBe("PLAZO FIJO TRADICIONAL");
  });
});

describe("analisis computations", () => {
  it("uses simple 365-day interest and the Fisher real rate", () => {
    expect(
      computeRealRate({ tnaPercent: 36.5, dias: 30, cerDesde: 200, cerHasta: 202 }),
    ).toMatchObject({
      tasaNominalPeriodo: 3,
      inflacionPeriodo: 1,
      tasaRealPeriodo: 1.9802,
    });
    expect(daysBetween("2026-09-27", "2026-10-27")).toBe(30);
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(variation(10, 0)).toEqual({ variacion: 10, variacionPorcentual: null });
    expect(variation(10, null)).toEqual({ variacion: null, variacionPorcentual: null });
  });
});

describe("analisis API", () => {
  it("ranks deposit TEA mínima by entity and keeps the source path", async () => {
    const signal = new AbortController().signal;
    const { client, getJson } = mockClient();
    const api = createAnalisisApi(client, { now: () => NOW });

    const ranked = await api.rankRates(
      { producto: "plazosFijos", idioma: "en-US" },
      { idioma: "en-US", signal },
    );

    expect(rankingResponseSchema.parse(ranked)).toMatchObject({
      orden: "desc",
      campoOrden: "tasaEfectivaAnualMinima",
      totalOfertas: 3,
      ofertasSinTasa: 1,
      ofertasTasaCero: 1,
      ofertasFueraDePlazo: 0,
      excluyeTasasCero: true,
      ofertasSinDenominacion: 0,
      filtros: {
        incluirTasasCero: false,
        denominacion: "pesos",
        plazoMinimoInvertirDesde: null,
        plazoMinimoInvertirHasta: null,
      },
      total: 2,
      truncado: false,
      fuente: { path: "/transparencia/v1.0/PlazosFijos" },
    });
    expect(
      ranked.resultados.map((row) => [
        row.codigoEntidad,
        row.tasas.tasaEfectivaAnualMinima,
        row.ofertasEntidad,
      ]),
    ).toEqual([
      [11, 30, 1],
      [7, 21.01, 1],
    ]);
    expect(ranked.criterio).toContain("no publica TNA");
    expect(getJson).toHaveBeenCalledWith(
      "/transparencia/v1.0/PlazosFijos",
      { codigoEntidad: undefined },
      { locale: "en-US", signal },
    );
  });

  it("infers peso, UVA and dollar fixed terms when denominacion is missing", async () => {
    const offers = [
      {
        codigoEntidad: 11,
        descripcionEntidad: "BANCO NACION",
        nombreCorto: "PFTRADICIONAL",
        nombreCompleto: "PLAZO FIJO TRADICIONAL",
        fechaInformacion: "2026-10-21",
        tasaEfectivaAnualMinima: 30,
      },
      {
        codigoEntidad: 7,
        descripcionEntidad: "BANCO GALICIA",
        nombreCorto: "PFUVA",
        nombreCompleto: "PLAZO FIJO UVA",
        fechaInformacion: "2026-10-22",
        tasaEfectivaAnualMinima: 1,
      },
      {
        codigoEntidad: 14,
        descripcionEntidad: "BANCO CIUDAD",
        nombreCorto: "pftrad180dusd",
        nombreCompleto: "plazofijotradicional",
        fechaInformacion: "2026-10-22",
        tasaEfectivaAnualMinima: 0.5,
      },
      {
        codigoEntidad: 17,
        descripcionEntidad: "BANCO MACRO",
        nombreCorto: "PF",
        nombreCompleto: "PLAZO FIJO EN DÓLARES",
        fechaInformacion: "2026-10-22",
        tasaEfectivaAnualMinima: 2,
      },
      {
        codigoEntidad: 29,
        descripcionEntidad: "PUBLICADO",
        nombreCorto: "PFUVA",
        nombreCompleto: "PLAZO FIJO UVA",
        fechaInformacion: "2026-10-22",
        tasaEfectivaAnualMinima: 40,
        denominacion: "Pesos",
      },
    ];
    const { client } = mockClient(undefined, offers);
    const api = createAnalisisApi(client, { now: () => NOW });
    const pesos = await api.rankRates({ producto: "plazosFijos" });
    expect(rankingResponseSchema.parse(pesos).ofertasDenominacionInferida).toBe(4);
    expect(pesos.ofertasSinDenominacion).toBe(0);
    expect(pesos.notaDenominacion).toContain("denominacionInferida true");
    expect(
      pesos.resultados.map((row) => [
        row.codigoEntidad,
        row.denominacionInferida,
        row.nombreCompleto,
        row.tasas.tasaEfectivaAnualMinima,
      ]),
    ).toEqual([
      [29, false, "PLAZO FIJO UVA", 40],
      [11, true, "PLAZO FIJO TRADICIONAL", 30],
    ]);

    const uva = await api.rankRates({ producto: "plazosFijos", denominacion: "uva" });
    expect(
      uva.resultados.map((row) => [row.codigoEntidad, row.denominacionInferida]),
    ).toEqual([[7, true]]);
    expect(uva.resultados[0]?.nombreCorto).toBe("PFUVA");

    const dollars = await api.rankRates({
      producto: "plazosFijos",
      denominacion: "dolares",
    });
    expect(dollars.resultados.map((row) => row.codigoEntidad)).toEqual([17, 14]);
    expect(dollars.resultados.every((row) => row.denominacionInferida)).toBe(true);
  });

  it("filters offers, truncates, and prefers CFT over a lone TEA", async () => {
    const { client } = mockClient();
    const api = createAnalisisApi(client, { now: () => NOW });

    const filtered = await api.rankRates({
      producto: "plazosFijos",
      buscar: "uva",
      modo: "oferta",
      limit: 1,
    });
    expect(filtered.total).toBe(0);
    expect(filtered.resultados).toEqual([]);
    expect(filtered.excluyeTasasCero).toBe(true);

    const withZero = await api.rankRates({
      producto: "plazosFijos",
      buscar: "uva",
      modo: "oferta",
      denominacion: "uva",
      incluirTasasCero: true,
      limit: 1,
    });
    expect(withZero.total).toBe(1);
    expect(withZero.truncado).toBe(false);
    expect(withZero.excluyeTasasCero).toBe(false);
    expect(withZero.resultados[0]?.nombreCorto).toBe("PFUVA");
    expect(withZero.resultados[0]?.ofertasEntidad).toBeNull();

    const loans = await api.rankRates({ producto: "prestamosPersonales" });
    expect(loans.orden).toBe("asc");
    expect(loans.fuente.path).toBe("/transparencia/v1.0/Prestamos/Personales");
    expect(loans.ofertasTasaCero).toBe(1);
    expect(loans.excluyeTasasCero).toBe(true);
    expect(
      loans.resultados.map((row) => [
        row.codigoEntidad,
        row.campoOrden,
        row.tasas.costoFinancieroEfectivoTotalMaximo,
        row.ofertasEntidad,
      ]),
    ).toEqual([[7, "costoFinancieroEfectivoTotalMaximo", 100, 2]]);
    expect(loans.valoresDescartados.map((row) => row.valor)).toEqual([0.33]);
    expect(loans.valoresDescartados[0]?.motivo).toContain("cota mínima");
    expect(loans.resultados.every((row) => row.atipico === false)).toBe(true);

    const truncated = await api.rankRates({
      producto: "plazosFijos",
      modo: "oferta",
      orden: "asc",
      limit: 1,
    });
    expect(truncated.truncado).toBe(true);
    expect(truncated.total).toBe(2);
    expect(truncated.resultados[0]?.tasas.tasaEfectivaAnualMinima).toBe(21.01);

    const uvaLoans = await api.rankRates({
      producto: "prestamosPersonales",
      denominacion: "uva",
    });
    expect(uvaLoans.resultados.map((row) => row.codigoEntidad)).toEqual([11]);
    expect(uvaLoans.rankings[0]?.denominacion).toBe("uva");

    const zeroFirst = await api.rankRates({
      producto: "plazosFijos",
      modo: "oferta",
      orden: "asc",
      denominacion: "uva",
      incluirTasasCero: true,
      limit: 1,
    });
    expect(zeroFirst.resultados[0]?.tasas.tasaEfectivaAnualMinima).toBe(0);
  });

  it("filters the published plazo code and rejects it on other products", async () => {
    const termOffers = [
      {
        codigoEntidad: 72614,
        descripcionEntidad: "MUTUAL DE DOCENTES",
        nombreCorto: "AHORRO",
        nombreCompleto: "AHORRO",
        fechaInformacion: "2026-10-05",
        tasaEfectivaAnualMinima: 97.08,
        plazoMinimoInvertirDias: 1,
        canalConstitucion: "Ventanilla",
        denominacion: "Pesos",
      },
      {
        codigoEntidad: 11,
        descripcionEntidad: "BANCO NACION",
        nombreCorto: "PF30",
        nombreCompleto: "PLAZO FIJO 30",
        fechaInformacion: "2026-10-21",
        tasaEfectivaAnualMinima: 30,
        plazoMinimoInvertirDias: 30,
        denominacion: "Pesos",
      },
      {
        codigoEntidad: 7,
        descripcionEntidad: "BANCO GALICIA",
        nombreCorto: "SIN PLAZO",
        nombreCompleto: "SIN PLAZO",
        fechaInformacion: "2026-10-21",
        tasaEfectivaAnualMinima: 40,
        denominacion: "Pesos",
      },
    ];
    const { client } = mockClient(undefined, termOffers);
    const api = createAnalisisApi(client, { now: () => NOW });

    const unfiltered = await api.rankRates({ producto: "plazosFijos", limit: 1 });
    expect(unfiltered.resultados[0]?.codigoEntidad).toBe(72614);
    expect(unfiltered.resultados[0]?.contexto.plazoMinimoInvertirDias).toBe(1);

    const comparable = await api.rankRates({
      producto: "plazosFijos",
      plazoMinimoInvertirDesde: 30,
    });
    expect(rankingResponseSchema.parse(comparable)).toMatchObject({
      ofertasFueraDePlazo: 2,
      total: 1,
      filtros: { plazoMinimoInvertirDesde: 30, plazoMinimoInvertirHasta: null },
    });
    expect(comparable.resultados.map((row) => row.codigoEntidad)).toEqual([11]);

    const shortTerm = await api.rankRates({
      producto: "plazosFijos",
      plazoMinimoInvertirDesde: 1,
      plazoMinimoInvertirHasta: 29,
    });
    expect(shortTerm.resultados.map((row) => row.codigoEntidad)).toEqual([72614]);

    expect(rankingInputSchema.parse({ producto: "plazosFijos" })).toMatchObject({
      incluirTasasCero: false,
      denominacion: "pesos",
      modo: "entidad",
      limit: 100,
    });
    expect(
      rankingInputSchema.safeParse({
        producto: "tarjetas",
        plazoMinimoInvertirDesde: 1,
      }).success,
    ).toBe(false);
    expect(
      rankingInputSchema.safeParse({
        producto: "plazosFijos",
        plazoMinimoInvertirDesde: 5,
        plazoMinimoInvertirHasta: 1,
      }).success,
    ).toBe(false);
    expect(
      rankingInputSchema.safeParse({ producto: "plazosFijos", tipoEntidad: "banco" })
        .success,
    ).toBe(false);
    await expect(
      api.rankRates({ producto: "tarjetas", plazoMinimoInvertirHasta: 1 }),
    ).rejects.toMatchObject({ kind: "UNSUPPORTED_CAPABILITY" });
    await expect(
      api.rankRates({
        producto: "plazosFijos",
        plazoMinimoInvertirDesde: 5,
        plazoMinimoInvertirHasta: 1,
      }),
    ).rejects.toMatchObject({ kind: "UNSUPPORTED_CAPABILITY" });
  });

  it("reports discarded outliers and can opt them back in", async () => {
    const offers = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30].map((rate, index) => ({
      codigoEntidad: index + 1,
      descripcionEntidad: `BANCO ${index + 1}`,
      nombreCorto: `PF${index + 1}`,
      nombreCompleto: "PLAZO FIJO",
      fechaInformacion: "2026-10-21",
      tasaEfectivaAnualMinima: rate,
      plazoMinimoInvertirDias: 1,
      denominacion: "Pesos",
    }));
    offers.push({
      codigoEntidad: 72614,
      descripcionEntidad: "MUTUAL DE DOCENTES",
      nombreCorto: "AHORRO",
      nombreCompleto: "AHORRO",
      fechaInformacion: "2026-10-05",
      tasaEfectivaAnualMinima: 97.08,
      plazoMinimoInvertirDias: 1,
      denominacion: "Pesos",
    });
    const { client } = mockClient(undefined, offers);
    const api = createAnalisisApi(client, { now: () => NOW });

    const hidden = await api.rankRates({
      producto: "plazosFijos",
      modo: "oferta",
      limit: 20,
    });
    expect(rankingResponseSchema.parse(hidden).excluyeValoresAtipicos).toBe(true);
    expect(hidden.valoresDescartados.map((row) => row.codigoEntidad)).toEqual([72614]);
    expect(hidden.resultados.some((row) => row.codigoEntidad === 72614)).toBe(false);
    expect(hidden.resultados.every((row) => row.atipico === false)).toBe(true);
    expect(hidden.limitesPlausibilidad[0]?.superior).toBeLessThan(97.08);

    const shown = await api.rankRates({
      producto: "plazosFijos",
      modo: "oferta",
      incluirValoresAtipicos: true,
      limit: 20,
    });
    expect(shown.valoresDescartados).toEqual([]);
    expect(shown.filtros.incluirValoresAtipicos).toBe(true);
    expect(shown.resultados.find((row) => row.codigoEntidad === 72614)?.atipico).toBe(
      true,
    );
    expect(
      shown.resultados
        .filter((row) => row.codigoEntidad !== 72614)
        .every((row) => row.atipico === false),
    ).toBe(true);
  });

  it("ranks one denomination and keeps todas in separate lists", async () => {
    const mixed = [
      {
        codigoEntidad: 1,
        descripcionEntidad: "PESOS",
        nombreCorto: "PESOS",
        nombreCompleto: "PESOS",
        fechaInformacion: "2026-10-01",
        costoFinancieroEfectivoTotalMaximo: 80,
        denominacion: "Pesos",
      },
      {
        codigoEntidad: 2,
        descripcionEntidad: "UVA",
        nombreCorto: "UVA",
        nombreCompleto: "UVA",
        fechaInformacion: "2026-10-01",
        costoFinancieroEfectivoTotalMaximo: 20,
        denominacion: "UVA",
      },
      {
        codigoEntidad: 3,
        descripcionEntidad: "USD ACENTO",
        nombreCorto: "USD",
        nombreCompleto: "USD",
        fechaInformacion: "2026-10-01",
        costoFinancieroEfectivoTotalMaximo: 12,
        denominacion: "Dólares estadounidenses",
      },
      {
        codigoEntidad: 4,
        descripcionEntidad: "USD SIN ACENTO",
        nombreCorto: "USD",
        nombreCompleto: "USD",
        fechaInformacion: "2026-10-01",
        costoFinancieroEfectivoTotalMaximo: 11,
        denominacion: "Dolares estadounidenses",
      },
      {
        codigoEntidad: 5,
        descripcionEntidad: "SIN DATO",
        nombreCorto: "SIN",
        nombreCompleto: "SIN",
        fechaInformacion: "2026-10-01",
        costoFinancieroEfectivoTotalMaximo: 40,
      },
      {
        codigoEntidad: 6,
        descripcionEntidad: "EUROS",
        nombreCorto: "EUR",
        nombreCompleto: "EUR",
        fechaInformacion: "2026-10-01",
        costoFinancieroEfectivoTotalMaximo: 9,
        denominacion: "Euros",
      },
    ];
    const getJson = vi.fn(async (path: string) => {
      if (path.includes("Prestamos/Personales")) {
        return { status: 200, results: mixed };
      }
      if (path.includes("Tarjetas")) {
        return {
          status: 200,
          results: [
            {
              codigoEntidad: 14,
              descripcionEntidad: "TARJETA",
              nombreCorto: "VISA",
              nombreCompleto: "VISA",
              fechaInformacion: "2026-10-01",
              tasaEfectivaAnualMaximaFinanciacion: 40,
            },
            {
              codigoEntidad: 15,
              descripcionEntidad: "TARJETA B",
              nombreCorto: "MASTER",
              nombreCompleto: "MASTER",
              fechaInformacion: "2026-10-01",
              tasaEfectivaAnualMaximaFinanciacion: 30,
            },
          ],
        };
      }
      return { status: 200, results: [] };
    });
    const api = createAnalisisApi({ getJson }, { now: () => NOW });

    const pesos = await api.rankRates({ producto: "prestamosPersonales" });
    expect(rankingResponseSchema.parse(pesos).filtros.denominacion).toBe("pesos");
    expect(pesos.resultados.map((row) => row.codigoEntidad)).toEqual([1]);
    expect(pesos.ofertasSinDenominacion).toBe(1);
    expect(pesos.ofertasOtraDenominacion).toBe(1);
    expect(pesos.notaDenominacion).toContain("no se trata como pesos");
    expect(pesos.rankings.map((slice) => slice.denominacion)).toEqual(["pesos"]);

    const dollars = await api.rankRates({
      producto: "prestamosPersonales",
      denominacion: "dolares",
    });
    expect(dollars.resultados.map((row) => row.codigoEntidad)).toEqual([4, 3]);
    expect(dollars.limitesPlausibilidad.map((limit) => limit.grupo)).toEqual([
      "dolares",
    ]);
    expect(dollars.rankings[0]?.resultados.map((row) => row.codigoEntidad)).toEqual([
      4, 3,
    ]);

    const all = await api.rankRates({
      producto: "prestamosPersonales",
      denominacion: "todas",
    });
    expect(rankingResponseSchema.parse(all).resultados).toEqual([]);
    expect(all.total).toBe(0);
    expect(all.valoresDescartados).toEqual([]);
    expect(all.rankings.map((slice) => slice.denominacion)).toEqual([
      "pesos",
      "uva",
      "dolares",
      "sinDenominacion",
      "Euros",
    ]);
    expect(
      all.rankings.find((slice) => slice.denominacion === "pesos")?.resultados,
    ).toEqual([expect.objectContaining({ codigoEntidad: 1 })]);
    expect(
      all.rankings.find((slice) => slice.denominacion === "uva")?.resultados,
    ).toEqual([expect.objectContaining({ codigoEntidad: 2 })]);
    expect(
      all.rankings.find((slice) => slice.denominacion === "sinDenominacion")
        ?.resultados,
    ).toEqual([expect.objectContaining({ codigoEntidad: 5 })]);
    expect(
      all.rankings.find((slice) => slice.denominacion === "Euros")?.resultados,
    ).toEqual([expect.objectContaining({ codigoEntidad: 6 })]);

    const cards = await api.rankRates({ producto: "tarjetas" });
    expect(cards.notaDenominacion).toContain("no publican denominacion");
    expect(cards.rankings[0]?.implicita).toBe(true);
    expect(cards.ofertasSinDenominacion).toBe(0);
    expect(cards.resultados.map((row) => row.codigoEntidad)).toEqual([15, 14]);

    const cardsUva = await api.rankRates({ producto: "tarjetas", denominacion: "uva" });
    expect(cardsUva.resultados).toEqual([]);
    expect(cardsUva.rankings[0]?.denominacion).toBe("uva");
    expect(cardsUva.rankings[0]?.implicita).toBe(false);

    const cardsAll = await api.rankRates({
      producto: "tarjetas",
      denominacion: "todas",
    });
    expect(cardsAll.resultados).toEqual([]);
    expect(cardsAll.rankings.map((slice) => [slice.denominacion, slice.total])).toEqual(
      [
        ["pesos", 2],
        ["uva", 0],
        ["dolares", 0],
      ],
    );
    expect(cardsAll.rankings[0]?.implicita).toBe(true);
  });

  it("rejects a transparency payload without entity identity", async () => {
    const { client } = mockClient(undefined, [{ inesperado: true }]);
    const api = createAnalisisApi(client, { now: () => NOW });
    await expect(api.rankRates({ producto: "plazosFijos" })).rejects.toMatchObject({
      kind: "UPSTREAM_SCHEMA_MISMATCH",
    });
  });

  it("prices an input TNA against CER on the requested dates", async () => {
    const { client, getJson } = mockClient();
    const api = createAnalisisApi(client, { now: () => NOW });
    const result = await api.realFixedTermRate({
      tasaNominalAnual: 36.5,
      desde: "2026-09-01",
      hasta: "2026-10-01",
    });

    const cerDesde = 1_000 + daysBetween("2020-01-01", "2026-09-01");
    const cerHasta = 1_000 + daysBetween("2020-01-01", "2026-10-01");
    expect(realRateResponseSchema.parse(result)).toMatchObject({
      fuenteNominal: "input",
      dias: 30,
      baseDias: 365,
      tasaNominalAnual: 36.5,
      ...computeRealRate({
        tnaPercent: 36.5,
        dias: 30,
        cerDesde,
        cerHasta,
      }),
      series: {
        inflacion: { idVariable: 30, desde: { fecha: "2026-09-01" } },
        nominal: null,
      },
    });
    expect(result.formula).toContain("CER(hasta) / CER(desde) - 1");
    expect(result.nota).toContain("serie 12");
    expect(getJson).toHaveBeenCalledWith(
      "/estadisticas/v4.0/Monetarias/30",
      expect.objectContaining({ desde: "2026-09-01", hasta: "2026-09-01" }),
      undefined,
    );
  });

  it("uses series 12 when the nominal rate is omitted", async () => {
    const { client, getJson } = mockClient();
    const api = createAnalisisApi(client, { now: () => NOW });
    const result = await api.realFixedTermRate({ plazoDias: 30, desde: "2026-09-27" });

    expect(result).toMatchObject({
      fuenteNominal: "serie",
      hasta: "2026-10-27",
      tasaNominalAnual: 36.5,
      series: {
        nominal: { idVariable: 12, fecha: "2026-09-27", valor: 36.5 },
        inflacion: { idVariable: 30 },
      },
    });
    expect(getJson).toHaveBeenCalledWith(
      "/estadisticas/v4.0/Monetarias",
      expect.objectContaining({ idVariable: 12 }),
      undefined,
    );
    expect(realRateResponseSchema.parse(result).tasaNominalPeriodo).toBe(3);
  });

  it("defaults the window to 30 days ending on the latest CER", async () => {
    const { client } = mockClient();
    const api = createAnalisisApi(client, { now: () => NOW });
    const result = await api.realFixedTermRate();
    expect(result.desde).toBe("2026-09-27");
    expect(result.hasta).toBe(TODAY);
    expect(result.dias).toBe(30);
    expect(result.fuenteNominal).toBe("serie");
  });

  it("fails when the series identity or a CER date does not match", async () => {
    const broken = structuredClone(catalogs);
    broken[30] = { ...broken[30], descripcion: "Inflación mensual." };
    const { client } = mockClient(broken);
    const api = createAnalisisApi(client, { now: () => NOW });
    await expect(api.realFixedTermRate({ plazoDias: 30 })).rejects.toMatchObject({
      kind: "UPSTREAM_SCHEMA_MISMATCH",
    });

    const { client: emptyClient } = mockClient();
    emptyClient.getJson.mockImplementation(async (path: string) => {
      if (path === "/estadisticas/v4.0/Monetarias") {
        return {
          status: 200,
          results: [{ idVariable: 30, ...catalogs[30], ultValorInformado: 1 }],
        };
      }
      return { status: 200, results: [{ idVariable: 30, detalle: [] }] };
    });
    await expect(
      createAnalisisApi(emptyClient, { now: () => NOW }).realFixedTermRate({
        tasaNominalAnual: 10,
        desde: "2026-09-01",
        hasta: "2026-10-01",
      }),
    ).rejects.toMatchObject({ kind: "UPSTREAM_SCHEMA_MISMATCH" });
  });

  it("builds the macro snapshot and marks the discontinued policy rate", async () => {
    const { client, getJson } = mockClient();
    const english = structuredClone(catalogs);
    english[5] = {
      ...english[5],
      descripcion: "Wholesale Exchange Rate",
      categoria: "Main variables",
      unidadExpresion: "Exchange rate ars to usd",
    };
    const api = createAnalisisApi(client, { now: () => NOW });
    const snapshot = await api.macroSnapshot({ idioma: "es-AR", signal: undefined });

    expect(snapshotResponseSchema.parse(snapshot).fechaConsulta).toBe(TODAY);
    expect(snapshot.indicadores.tipoCambio).toMatchObject({
      idVariable: 5,
      vigente: true,
      advertencia: null,
    });
    for (const indicator of Object.values(snapshot.indicadores)) {
      expect(indicator.fechaUltimaObservacion).toBe(indicator.ultimo.fecha);
      expect(indicator.diasDesdeUltimaObservacion).toBe(
        daysBetween(indicator.ultimo.fecha, snapshot.fechaConsulta),
      );
    }
    expect(snapshot.indicadores.reservasInternacionales.idVariable).toBe(1);
    expect(snapshot.indicadores.baseMonetaria.idVariable).toBe(15);
    const policy = snapshot.indicadores.tasaPolitica;
    expect(policy).toMatchObject({
      idVariable: 160,
      vigente: false,
      fechaUltimaObservacion: "2025-07-10",
      diasDesdeUltimaObservacion: daysBetween("2025-07-10", TODAY),
      ultimo: { fecha: "2025-07-10", valor: 29 },
      anterior: { fecha: "2025-07-08", valor: 28 },
      variacion: 1,
    });
    expect(policy.diasDesdeUltimaObservacion).toBeGreaterThan(21);
    expect(policy.advertencia).toContain("No se reemplaza por TAMAR");
    expect(getJson).toHaveBeenCalledWith(
      "/estadisticas/v4.0/Monetarias/5",
      expect.objectContaining({ desde: "2026-09-12", hasta: TODAY }),
      expect.objectContaining({ locale: "es-AR" }),
    );

    const englishApi = createAnalisisApi(mockClient(english).client, {
      now: () => NOW,
    });
    const translated = await englishApi.macroSnapshot();
    expect(translated.indicadores.tipoCambio.descripcion).toBe(
      "Wholesale Exchange Rate",
    );
  });
});

describe("analisis input schema", () => {
  it("rejects an incomplete or inverted real-rate period", () => {
    expect(realRateInputSchema.safeParse({ desde: "2026-10-02" }).success).toBe(false);
    expect(
      realRateInputSchema.safeParse({ desde: "2026-10-02", hasta: "2026-10-01" })
        .success,
    ).toBe(false);
    expect(
      realRateInputSchema.safeParse({ desde: "2026-10-01", hasta: "2026-10-01" })
        .success,
    ).toBe(false);
    expect(
      realRateInputSchema.safeParse({
        desde: "2026-09-01",
        hasta: "2026-10-01",
        plazoDias: 10,
      }).success,
    ).toBe(false);
    expect(realRateInputSchema.safeParse({ tasaNominalAnual: "36.5" }).success).toBe(
      false,
    );
  });
});
