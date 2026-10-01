import { z } from "zod";
import {
  boundedOffset,
  localeInput,
  nonEmptyString,
  positiveInt,
} from "../../shared/validation/common.js";

export const seriesExcelInputSchema = z
  .object({
    idVariable: positiveInt.max(2_147_483_647).optional(),
    buscar: nonEmptyString.max(120).optional(),
    limit: z.number().int().safe().min(1).max(100).default(50),
    offset: boundedOffset.default(0),
    ...localeInput,
  })
  .strict();

export const seriesExcelResponseSchema = z.object({
  sourceUrl: z.url(),
  sourcePage: z.url(),
  format: z.literal("XLSX"),
  total: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      idVariable: z.number().int().positive(),
      descripcion: z.string(),
      tipoSerie: z.string(),
      periodicidad: z.string(),
      unidadExpresion: z.string(),
      moneda: z.string(),
    }),
  ),
});
