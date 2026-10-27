import { describe, expect, it, vi } from "vitest";
import { createAnalisisApi } from "../src/domains/analisis/api.js";
import {
  addDays,
  computeRealRate,
  daysBetween,
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
      filtros: {
        incluirTasasCero: false,
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
    ).toEqual([
      [20, "costoFinancieroEfectivoTotalMaximo", 0.33, 1],
      [11, "costoFinancieroEfectivoTotalMaximo", 50, 1],
      [7, "costoFinancieroEfectivoTotalMaximo", 100, 2],
    ]);

    const truncated = await api.rankRates({
      producto: "plazosFijos",
      modo: "oferta",
      orden: "asc",
      limit: 1,
    });
    expect(truncated.truncado).toBe(true);
    expect(truncated.total).toBe(2);
    expect(truncated.resultados[0]?.tasas.tasaEfectivaAnualMinima).toBe(21.01);

    const zeroFirst = await api.rankRates({
      producto: "plazosFijos",
      modo: "oferta",
      orden: "asc",
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
      },
      {
        codigoEntidad: 11,
        descripcionEntidad: "BANCO NACION",
        nombreCorto: "PF30",
        nombreCompleto: "PLAZO FIJO 30",
        fechaInformacion: "2026-10-21",
        tasaEfectivaAnualMinima: 30,
        plazoMinimoInvertirDias: 30,
      },
      {
        codigoEntidad: 7,
        descripcionEntidad: "BANCO GALICIA",
        nombreCorto: "SIN PLAZO",
        nombreCompleto: "SIN PLAZO",
        fechaInformacion: "2026-10-21",
        tasaEfectivaAnualMinima: 40,
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
