import { z } from "zod";
import { bcraResponseSchema } from "../../shared/http/responseSchema.js";
import {
  boundedOffset,
  currencyCode,
  isoDate,
  localeInput,
} from "../../shared/validation/common.js";

export const emptyFxInputSchema = z.object(localeInput).strict();

export const fxQuotesSchema = z
  .object({ fecha: isoDate.optional(), ...localeInput })
  .strict();

export const fxQuoteByCurrencySchema = z
  .object({
    codMoneda: currencyCode,
    fechadesde: isoDate.optional(),
    fechahasta: isoDate.optional(),
    limit: z.number().int().safe().min(10).max(1_000).optional(),
    offset: boundedOffset.optional(),
    ...localeInput,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.fechadesde && value.fechahasta && value.fechadesde > value.fechahasta) {
      ctx.addIssue({
        code: "custom",
        path: ["fechahasta"],
        message: "End date must not be earlier than start date",
      });
    }
  });

export const estadisticasCambiariasResponseSchema = bcraResponseSchema;
