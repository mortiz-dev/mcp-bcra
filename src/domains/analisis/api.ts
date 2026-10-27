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
  offersMatchingSearch,
  POLICY_STALE_DAYS,
  PRODUCT_SPECS,
  partitionByPlausibility,
  type RankedOffer,
  REAL_RATE_FORMULA,
  rankOffers,
  readObservations,
  readOffers,
  readVariable,
  SERIES,
  type SeriesSpec,
  splitByDenomination,
  utcDate,
  type VariableMeta,
  variation,
} from "./compute.js";
import type {
  rankingInputSchema,
  rankingProductSchema,
  realRateInputSchema,
} from "./schemas.js";

const PUBLISHED_DENOMINATION_NOTE =
  "Por defecto se rankea solo la denominación publicada «Pesos». uva corresponde al texto «UVA». dolares corresponde a «Dólares estadounidenses» y a «Dolares estadounidenses» (sin tilde, como publican los hipotecarios). En préstamos, una fila sin denominacion no se trata como pesos: se cuenta en ofertasSinDenominacion y queda fuera de pesos, uva y dolares. denominacion todas arma un ranking por moneda en rankings y deja resultados vacío, sin mezclar monedas en una sola lista. Si hay filas sin denominación, todas agrega el corte sinDenominacion. Otras etiquetas publicadas (Euros o UVI, si aparecen) van en su propio corte y se cuentan en ofertasOtraDenominacion.";

const INFERRED_DENOMINATION_NOTE =
  "En plazos fijos el BCRA deja denominacion vacía. Si el campo no viene, la moneda se lee de nombreCorto y nombreCompleto: UVA va a uva; dolar, dólar, USD o u$s van a dolares; el resto va a pesos. Esas filas traen denominacionInferida true y el nombre del producto que se usó. Una denominacion publicada gana siempre y deja denominacionInferida en false. Un nombre en euros, sin esas palabras, entra en pesos. denominacion todas no mezcla monedas.";

const CARD_DENOMINATION_NOTE =
  "Las tarjetas no publican denominacion, ni en la API ni en el PDF del régimen. Todo el catálogo se rankea como pesos con implicita true. Pedir uva o dolares devuelve un corte vacío y no reclasifica las tarjetas. denominacion todas mantiene los cortes separados; el de pesos trae el catálogo.";

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
      const incluirValoresAtipicos = params.incluirValoresAtipicos ?? false;
      const denominacion = params.denominacion ?? "pesos";
      const filtered = applyRankingFilters(parsed.offers, {
        incluirTasasCero,
        plazoDesde: plazoMinimoInvertirDesde,
        plazoHasta: plazoMinimoInvertirHasta,
      });
      const searched = offersMatchingSearch(filtered.offers, params.buscar);
      const split = splitByDenomination(searched, spec.denomination);
      const ofertasOtraDenominacion = [...split.otras.values()].reduce(
        (count, rows) => count + rows.length,
        0,
      );
      const rankSlice = (
        label: string,
        offers: readonly RankedOffer[],
        implicita: boolean,
      ) => {
        const plausibility = partitionByPlausibility(
          offers,
          spec.plausibility,
          () => label,
        );
        const atypical = new Set(plausibility.outliers);
        const tagged = offers.map((offer) => ({
          ...offer,
          atipico: atypical.has(offer),
        }));
        const rankable = incluirValoresAtipicos
          ? tagged
          : tagged.filter((offer) => !offer.atipico);
        const { ranked, total } = rankOffers(rankable, {
          modo,
          orden,
          sortField: spec.sortField,
          limit,
        });
        return {
          denominacion: label,
          implicita,
          total,
          truncado: total > ranked.length,
          limitesPlausibilidad: plausibility.limits,
          valoresDescartados: incluirValoresAtipicos ? [] : plausibility.discarded,
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
            denominacionInferida: row.denominacionInferida === true,
            atipico: row.atipico === true,
          })),
        };
      };
      const slices: Array<{
        label: string;
        offers: readonly RankedOffer[];
        implicita: boolean;
      }> =
        denominacion === "todas"
          ? [
              { label: "pesos", offers: split.pesos, implicita: split.implicitaPesos },
              { label: "uva", offers: split.uva, implicita: false },
              { label: "dolares", offers: split.dolares, implicita: false },
              ...(split.sinDenominacion.length > 0
                ? [
                    {
                      label: "sinDenominacion",
                      offers: split.sinDenominacion,
                      implicita: false,
                    },
                  ]
                : []),
              ...[...split.otras.entries()]
                .sort(([left], [right]) => left.localeCompare(right, "es"))
                .map(([label, offers]) => ({ label, offers, implicita: false })),
            ]
          : denominacion === "pesos"
            ? [{ label: "pesos", offers: split.pesos, implicita: split.implicitaPesos }]
            : [
                {
                  label: denominacion,
                  offers: split[denominacion],
                  implicita: false,
                },
              ];
      const rankings = slices.map((slice) =>
        rankSlice(slice.label, slice.offers, slice.implicita),
      );
      const primary = denominacion === "todas" ? null : (rankings[0] ?? null);
      return {
        producto,
        modo,
        orden,
        campoOrden: spec.sortField,
        camposTasa: [...spec.rateFields],
        criterio: `${spec.criterio} Por defecto se rankea una sola denominación (pesos, el texto publicado «Pesos»; ver notaDenominacion). El intervalo de plausibilidad se calcula dentro de esa denominación (z modificado 3.5; si la MAD es 0, valla IQR o desviación media) y lo que queda afuera va a valoresDescartados. Una tasa igual a una cota mínima positiva también es atípica. incluirValoresAtipicos lo devuelve en el ranking con atipico true.`,
        fuente: {
          api: "Transparencia v1.0",
          path: `/transparencia/v1.0/${transparenciaProductPaths[producto]}`,
        },
        totalOfertas: parsed.offers.length,
        ofertasSinTasa: parsed.sinTasa,
        ofertasTasaCero: filtered.ofertasTasaCero,
        ofertasFueraDePlazo: filtered.ofertasFueraDePlazo,
        ofertasSinDenominacion: split.sinDenominacion.length,
        ofertasOtraDenominacion,
        ofertasDenominacionInferida: searched.filter(
          (offer) => offer.denominacionInferida === true,
        ).length,
        excluyeTasasCero: !incluirTasasCero,
        excluyeValoresAtipicos: !incluirValoresAtipicos,
        notaDenominacion:
          spec.denomination === "implicit-pesos"
            ? CARD_DENOMINATION_NOTE
            : spec.denomination === "infer-missing"
              ? INFERRED_DENOMINATION_NOTE
              : PUBLISHED_DENOMINATION_NOTE,
        filtros: {
          incluirTasasCero,
          incluirValoresAtipicos,
          denominacion,
          plazoMinimoInvertirDesde: plazoMinimoInvertirDesde ?? null,
          plazoMinimoInvertirHasta: plazoMinimoInvertirHasta ?? null,
        },
        rankings,
        limitesPlausibilidad: primary?.limitesPlausibilidad ?? [],
        valoresDescartados: primary?.valoresDescartados ?? [],
        total: primary?.total ?? 0,
        truncado: primary?.truncado ?? false,
        resultados: primary?.resultados ?? [],
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
