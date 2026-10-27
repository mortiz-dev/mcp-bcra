import type { z } from "zod";
import type { BcraApiContext, BcraHttpClient } from "../../shared/http/bcraClient.js";
import { DomainApiError } from "../../shared/http/errors.js";
import { createEstadisticasApi } from "../estadisticas/api.js";
import {
  createTransparenciaApi,
  transparenciaProductPaths,
} from "../transparencia/api.js";
import {
  addDays,
  applyRankingFilters,
  computeRealRate,
  DAY_COUNT_BASIS,
  DEFAULT_TERM_DAYS,
  daysBetween,
  type Observation,
  observationOn,
  observationOnOrBefore,
  POLICY_STALE_DAYS,
  PRODUCT_SPECS,
  REAL_RATE_FORMULA,
  rankOffers,
  readObservations,
  readOffers,
  readVariable,
  SERIES,
  type SeriesSpec,
  utcDate,
  type VariableMeta,
  variation,
} from "./compute.js";
import type {
  rankingInputSchema,
  rankingProductSchema,
  realRateInputSchema,
} from "./schemas.js";

const REAL_RATE_NOTE =
  "La inflación del período es la variación del CER (serie 30), no la inflación mensual (serie 27) ni la interanual (serie 28): esas series son porcentajes de un mes o de doce meses y no se alinean a un plazo arbitrario. Si no se informa TNA, se usa la serie 12 (depósitos a 30 días en entidades financieras, nominal anual) en la fecha de inicio o el día hábil anterior publicado. No se usa BADLAR (serie 7) ni TAMAR (serie 44), que son tasas mayoristas. El interés se calcula en forma simple con base 365. No es asesoramiento financiero.";

type RankingProduct = z.infer<typeof rankingProductSchema>;
type RankingInput = z.input<typeof rankingInputSchema>;
type RealRateInput = z.input<typeof realRateInputSchema>;

export type AnalisisApiConfig = {
  now?: () => Date;
};

const noObservations = (idVariable: number): never => {
  throw new DomainApiError({
    kind: "UPSTREAM_SCHEMA_MISMATCH",
    message: `BCRA series ${idVariable} returned no numeric observations`,
    source: "bcra",
  });
};

const describeSeries = (meta: VariableMeta) => ({
  idVariable: meta.idVariable,
  descripcion: meta.descripcion.trim(),
  categoria: meta.categoria.trim(),
  unidadExpresion: meta.unidadExpresion.trim(),
});

const policyWarning = (meta: VariableMeta, fecha: string, age: number): string =>
  `La serie ${meta.idVariable} («${meta.descripcion.trim()}», ${meta.unidadExpresion.trim()}) tiene última observación el ${fecha}, ${age} días antes de la consulta. No se reemplaza por TAMAR, BADLAR ni tasas de pases: en Principales Variables no hay otra serie vigente con el nombre de política monetaria.`;

const staleWarning = (fecha: string, age: number): string =>
  `La última observación es del ${fecha}, ${age} días antes de la consulta.`;

export const createAnalisisApi = (
  client: BcraHttpClient,
  config: AnalisisApiConfig = {},
) => {
  const estadisticas = createEstadisticasApi(client);
  const transparencia = createTransparenciaApi(client);
  const now = config.now ?? (() => new Date());

  const catalog = (spec: SeriesSpec, context?: BcraApiContext) =>
    estadisticas
      .getVariables({ idVariable: spec.id, limit: 10 }, context)
      .then((response) => readVariable(response, spec));

  const history = async (
    spec: SeriesSpec,
    desde: string,
    hasta: string,
    context?: BcraApiContext,
  ): Promise<Observation[]> => {
    const response = await estadisticas.getVariableHistory(
      { idVariable: spec.id, desde, hasta, limit: 3_000 },
      context,
    );
    return readObservations(response, spec.id);
  };

  const loadTail = async (spec: SeriesSpec, context?: BcraApiContext) => {
    const meta = await catalog(spec, context);
    const today = utcDate(now());
    let points = await history(spec, addDays(today, -45), today, context);
    if (points.length === 0) {
      points = await history(
        spec,
        addDays(meta.ultFechaInformada, -45),
        meta.ultFechaInformada,
        context,
      );
    }
    if (!points[0]) {
      noObservations(spec.id);
    }
    return { meta, points };
  };

  const toIndicator = (
    loaded: { meta: VariableMeta; points: Observation[] },
    today: string,
    role: "tasaPolitica" | "otro",
  ) => {
    const ultimo = loaded.points[0] ?? noObservations(loaded.meta.idVariable);
    const anterior = loaded.points[1] ?? null;
    const change = variation(ultimo.valor, anterior?.valor ?? null);
    const age = daysBetween(ultimo.fecha, today);
    const vigente = age <= POLICY_STALE_DAYS;
    return {
      ...describeSeries(loaded.meta),
      ultimo,
      anterior,
      variacion: change.variacion,
      variacionPorcentual: change.variacionPorcentual,
      fechaUltimaObservacion: ultimo.fecha,
      diasDesdeUltimaObservacion: age,
      vigente,
      advertencia: vigente
        ? null
        : role === "tasaPolitica"
          ? policyWarning(loaded.meta, ultimo.fecha, age)
          : staleWarning(ultimo.fecha, age),
    };
  };

  return {
    async rankRates(params: RankingInput, context?: BcraApiContext) {
      const producto = params.producto as RankingProduct;
      const spec = PRODUCT_SPECS[producto];
      const plazoMinimoInvertirDesde = params.plazoMinimoInvertirDesde;
      const plazoMinimoInvertirHasta = params.plazoMinimoInvertirHasta;
      if (
        producto !== "plazosFijos" &&
        (plazoMinimoInvertirDesde !== undefined ||
          plazoMinimoInvertirHasta !== undefined)
      ) {
        throw new DomainApiError({
          kind: "UNSUPPORTED_CAPABILITY",
          message:
            "plazoMinimoInvertirDesde and plazoMinimoInvertirHasta only apply to plazosFijos, which publishes plazoMinimoInvertirDias",
          source: "bcra",
        });
      }
      if (
        plazoMinimoInvertirDesde !== undefined &&
        plazoMinimoInvertirHasta !== undefined &&
        plazoMinimoInvertirDesde > plazoMinimoInvertirHasta
      ) {
        throw new DomainApiError({
          kind: "UNSUPPORTED_CAPABILITY",
          message:
            "plazoMinimoInvertirHasta must be greater than or equal to plazoMinimoInvertirDesde",
          source: "bcra",
        });
      }
      const response = await transparencia.getProduct({ producto }, context);
      const parsed = readOffers(response, spec);
      const orden = params.orden ?? spec.defaultOrden;
      const modo = params.modo ?? "entidad";
      const limit = params.limit ?? 100;
      const incluirTasasCero = params.incluirTasasCero ?? false;
      const filtered = applyRankingFilters(parsed.offers, {
        incluirTasasCero,
        plazoDesde: plazoMinimoInvertirDesde,
        plazoHasta: plazoMinimoInvertirHasta,
      });
      const { ranked, total } = rankOffers(filtered.offers, {
        buscar: params.buscar,
        modo,
        orden,
        sortField: spec.sortField,
        limit,
      });
      return {
        producto,
        modo,
        orden,
        campoOrden: spec.sortField,
        camposTasa: [...spec.rateFields],
        criterio: spec.criterio,
        fuente: {
          api: "Transparencia v1.0",
          path: `/transparencia/v1.0/${transparenciaProductPaths[producto]}`,
        },
        totalOfertas: parsed.offers.length,
        ofertasSinTasa: parsed.sinTasa,
        ofertasTasaCero: filtered.ofertasTasaCero,
        ofertasFueraDePlazo: filtered.ofertasFueraDePlazo,
        excluyeTasasCero: !incluirTasasCero,
        filtros: {
          incluirTasasCero,
          plazoMinimoInvertirDesde: plazoMinimoInvertirDesde ?? null,
          plazoMinimoInvertirHasta: plazoMinimoInvertirHasta ?? null,
        },
        total,
        truncado: total > ranked.length,
        resultados: ranked.map((row, index) => ({
          posicion: index + 1,
          codigoEntidad: row.codigoEntidad,
          descripcionEntidad: row.descripcionEntidad,
          nombreCorto: row.nombreCorto,
          nombreCompleto: row.nombreCompleto,
          fechaInformacion: row.fechaInformacion,
          campoOrden: row.campoOrden,
          tasas: row.tasas,
          contexto: row.contexto,
          ofertasEntidad: row.ofertasEntidad,
        })),
      };
    },

    async realFixedTermRate(params: RealRateInput = {}, context?: BcraApiContext) {
      const cerMeta = await catalog(SERIES.cer, context);
      const today = utcDate(now());
      let desde = params.desde;
      let hasta = params.hasta;
      let dias = params.plazoDias;

      if (!desde || !hasta) {
        if (desde && dias !== undefined) {
          hasta = addDays(desde, dias);
        } else if (hasta && dias !== undefined) {
          desde = addDays(hasta, -dias);
        } else {
          const recent = await history(SERIES.cer, addDays(today, -14), today, context);
          const latest = recent[0] ?? noObservations(SERIES.cer.id);
          hasta = latest.fecha;
          dias = dias ?? DEFAULT_TERM_DAYS;
          desde = addDays(hasta, -dias);
        }
      }

      if (desde === undefined || hasta === undefined) {
        throw new DomainApiError({
          kind: "UPSTREAM_SCHEMA_MISMATCH",
          message: "Could not resolve the fixed-term period",
          source: "bcra",
        });
      }
      const termDays = daysBetween(desde, hasta);
      const cerDesde = observationOn(
        await history(SERIES.cer, desde, desde, context),
        desde,
      );
      // CER can already publish a date the API still rejects as `desde`.
      // A range that starts a few days earlier returns that observation.
      const cerHasta = observationOn(
        await history(SERIES.cer, addDays(hasta, -5), hasta, context),
        hasta,
      );

      let nominalMeta: VariableMeta | null = null;
      let nominalPoint: Observation | null = null;
      let tna = params.tasaNominalAnual;
      if (tna === undefined) {
        nominalMeta = await catalog(SERIES.plazoFijo30, context);
        nominalPoint = observationOnOrBefore(
          await history(SERIES.plazoFijo30, addDays(desde, -20), desde, context),
          desde,
        );
        tna = nominalPoint.valor;
      }

      const rates = computeRealRate({
        tnaPercent: tna,
        dias: termDays,
        cerDesde: cerDesde.valor,
        cerHasta: cerHasta.valor,
      });

      return {
        tasaNominalAnual: tna,
        fuenteNominal:
          params.tasaNominalAnual === undefined
            ? ("serie" as const)
            : ("input" as const),
        dias: termDays,
        baseDias: DAY_COUNT_BASIS,
        desde,
        hasta,
        ...rates,
        formula: REAL_RATE_FORMULA,
        series: {
          inflacion: {
            ...describeSeries(cerMeta),
            desde: cerDesde,
            hasta: cerHasta,
          },
          nominal: nominalMeta
            ? {
                ...describeSeries(nominalMeta),
                fecha: nominalPoint?.fecha ?? desde,
                valor: nominalPoint?.valor ?? tna,
              }
            : null,
        },
        nota: REAL_RATE_NOTE,
      };
    },

    async macroSnapshot(context?: BcraApiContext) {
      const today = utcDate(now());
      const [tipoCambio, reservas, baseMonetaria, tasaPolitica] = await Promise.all([
        loadTail(SERIES.tipoCambio, context),
        loadTail(SERIES.reservas, context),
        loadTail(SERIES.baseMonetaria, context),
        loadTail(SERIES.tasaPolitica, context),
      ]);
      return {
        fechaConsulta: today,
        indicadores: {
          tipoCambio: toIndicator(tipoCambio, today, "otro"),
          reservasInternacionales: toIndicator(reservas, today, "otro"),
          baseMonetaria: toIndicator(baseMonetaria, today, "otro"),
          tasaPolitica: toIndicator(tasaPolitica, today, "tasaPolitica"),
        },
      };
    },
  };
};

export type AnalisisApi = ReturnType<typeof createAnalisisApi>;
