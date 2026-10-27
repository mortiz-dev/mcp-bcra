import { z } from "zod";
import {
  isoDate,
  localeInput,
  nonEmptyString,
} from "../../shared/validation/common.js";

export const rankingProductSchema = z.enum([
  "plazosFijos",
  "prestamosPersonales",
  "prestamosHipotecarios",
  "prestamosPrendarios",
  "tarjetas",
]);

export const rankingModeSchema = z.enum(["entidad", "oferta"]);
export const rankingOrderSchema = z.enum(["asc", "desc"]);

const daysBetweenDates = (desde: string, hasta: string): number => {
  const start = Date.parse(`${desde}T00:00:00Z`);
  const end = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
};

const rankingTermDays = z.number().int().safe().min(0).max(36_500);

export const rankingInputSchema = z
  .object({
    producto: rankingProductSchema,
    modo: rankingModeSchema.default("entidad"),
    orden: rankingOrderSchema.optional(),
    buscar: nonEmptyString.max(120).optional(),
    limit: z.number().int().safe().min(1).max(500).default(100),
    incluirTasasCero: z.boolean().default(false),
    plazoMinimoInvertirDesde: rankingTermDays.optional(),
    plazoMinimoInvertirHasta: rankingTermDays.optional(),
    ...localeInput,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.plazoMinimoInvertirDesde !== undefined &&
      value.plazoMinimoInvertirHasta !== undefined &&
      value.plazoMinimoInvertirDesde > value.plazoMinimoInvertirHasta
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["plazoMinimoInvertirHasta"],
        message:
          "plazoMinimoInvertirHasta must be greater than or equal to plazoMinimoInvertirDesde",
      });
    }
    if (
      value.producto !== "plazosFijos" &&
      (value.plazoMinimoInvertirDesde !== undefined ||
        value.plazoMinimoInvertirHasta !== undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["producto"],
        message:
          "plazoMinimoInvertirDesde and plazoMinimoInvertirHasta only apply to plazosFijos, which publishes plazoMinimoInvertirDias",
      });
    }
  });

export const realRateInputSchema = z
  .object({
    tasaNominalAnual: z.number().finite().min(0).max(1_000).optional(),
    desde: isoDate.optional(),
    hasta: isoDate.optional(),
    plazoDias: z.number().int().safe().min(1).max(3_000).optional(),
    ...localeInput,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.desde && value.hasta && value.desde > value.hasta) {
      ctx.addIssue({
        code: "custom",
        path: ["hasta"],
        message: "End date must not be earlier than start date",
      });
    }
    if (value.desde && value.hasta && value.desde === value.hasta) {
      ctx.addIssue({
        code: "custom",
        path: ["hasta"],
        message: "The period must cover at least one day",
      });
    }
    if (
      value.desde &&
      value.hasta &&
      value.plazoDias !== undefined &&
      daysBetweenDates(value.desde, value.hasta) !== value.plazoDias
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["plazoDias"],
        message: "plazoDias must equal the number of days between desde and hasta",
      });
    }
    if (value.desde && !value.hasta && value.plazoDias === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["hasta"],
        message: "Provide hasta or plazoDias together with desde",
      });
    }
    if (value.hasta && !value.desde && value.plazoDias === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["desde"],
        message: "Provide desde or plazoDias together with hasta",
      });
    }
  });

export const snapshotInputSchema = z.object(localeInput).strict();

const observationSchema = z.object({
  fecha: isoDate,
  valor: z.number().finite(),
});

const contextValueSchema = z.union([z.string(), z.number(), z.null()]);

export const rankingResponseSchema = z.object({
  producto: rankingProductSchema,
  modo: rankingModeSchema,
  orden: rankingOrderSchema,
  campoOrden: z.string(),
  camposTasa: z.array(z.string()),
  criterio: z.string(),
  fuente: z.object({
    api: z.string(),
    path: z.string(),
  }),
  totalOfertas: z.number().int().nonnegative(),
  ofertasSinTasa: z.number().int().nonnegative(),
  ofertasTasaCero: z.number().int().nonnegative(),
  ofertasFueraDePlazo: z.number().int().nonnegative(),
  excluyeTasasCero: z.boolean(),
  filtros: z.object({
    incluirTasasCero: z.boolean(),
    plazoMinimoInvertirDesde: z.number().int().nonnegative().nullable(),
    plazoMinimoInvertirHasta: z.number().int().nonnegative().nullable(),
  }),
  total: z.number().int().nonnegative(),
  truncado: z.boolean(),
  resultados: z.array(
    z.object({
      posicion: z.number().int().positive(),
      codigoEntidad: z.number().int().positive(),
      descripcionEntidad: z.string(),
      nombreCorto: z.string().nullable(),
      nombreCompleto: z.string().nullable(),
      fechaInformacion: z.string().nullable(),
      campoOrden: z.string(),
      tasas: z.record(z.string(), z.number()),
      contexto: z.record(z.string(), contextValueSchema),
      ofertasEntidad: z.number().int().positive().nullable(),
    }),
  ),
});

const seriesIdentitySchema = z.object({
  idVariable: z.number().int().positive(),
  descripcion: z.string(),
  categoria: z.string(),
  unidadExpresion: z.string(),
});

export const realRateResponseSchema = z.object({
  tasaNominalAnual: z.number().finite(),
  fuenteNominal: z.enum(["input", "serie"]),
  dias: z.number().int().positive(),
  baseDias: z.literal(365),
  desde: isoDate,
  hasta: isoDate,
  tasaNominalPeriodo: z.number().finite(),
  inflacionPeriodo: z.number().finite(),
  tasaRealPeriodo: z.number().finite(),
  tasaRealAnualizada: z.number().finite(),
  formula: z.string(),
  series: z.object({
    inflacion: seriesIdentitySchema.extend({
      desde: observationSchema,
      hasta: observationSchema,
    }),
    nominal: seriesIdentitySchema
      .extend({
        fecha: isoDate,
        valor: z.number().finite(),
      })
      .nullable(),
  }),
  nota: z.string(),
});

const indicatorSchema = z.object({
  idVariable: z.number().int().positive(),
  descripcion: z.string(),
  categoria: z.string(),
  unidadExpresion: z.string(),
  ultimo: observationSchema,
  anterior: observationSchema.nullable(),
  variacion: z.number().finite().nullable(),
  variacionPorcentual: z.number().finite().nullable(),
  fechaUltimaObservacion: isoDate,
  diasDesdeUltimaObservacion: z.number().int().safe(),
  vigente: z.boolean(),
  advertencia: z.string().nullable(),
});

export const snapshotResponseSchema = z.object({
  fechaConsulta: isoDate,
  indicadores: z.object({
    tipoCambio: indicatorSchema,
    reservasInternacionales: indicatorSchema,
    baseMonetaria: indicatorSchema,
    tasaPolitica: indicatorSchema,
  }),
});
