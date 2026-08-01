import { z } from "zod";
import { bcraResponseSchema } from "../../shared/http/responseSchema.js";
import {
  boundedOffset,
  isoDate,
  localeInput,
  nonEmptyString,
  positiveInt,
  validateDateRange,
} from "../../shared/validation/common.js";

const statisticsFilters = {
  idVariable: positiveInt.max(2_147_483_647).optional(),
  categoria: nonEmptyString.optional(),
  tipoSerie: nonEmptyString.optional(),
  periodicidad: nonEmptyString.optional(),
  unidadExpresion: nonEmptyString.optional(),
};

export const variablesSchema = z
  .object({
    ...statisticsFilters,
    limit: z.number().int().safe().min(1).max(1_000).optional(),
    offset: boundedOffset.optional(),
    ...localeInput,
  })
  .strict();

export const varHistorySchema = z
  .object({
    idVariable: positiveInt.max(2_147_483_647),
    desde: isoDate.optional(),
    hasta: isoDate.optional(),
    limit: z.number().int().safe().min(1).max(3_000).optional(),
    offset: boundedOffset.optional(),
    ...localeInput,
  })
  .strict()
  .superRefine(validateDateRange);

export const methodologySchema = z
  .object({
    idVariable: positiveInt.max(2_147_483_647).optional(),
    limit: z.number().int().safe().min(1).max(1_000).optional(),
    offset: boundedOffset.optional(),
    ...localeInput,
  })
  .strict();

export const estadisticasResponseSchema = bcraResponseSchema;
