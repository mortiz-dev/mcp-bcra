import { z } from "zod";
import {
  isoDate,
  nonEmptyString,
  nonNegativeInt,
} from "../../shared/validation/common.js";

export const fxQuotesInput = {
  fecha: isoDate.optional(),
};
export const fxQuotesSchema = z.object(fxQuotesInput);

export const fxQuoteByCurrencyInput = {
  codMoneda: nonEmptyString,
  fechadesde: isoDate.optional(),
  fechahasta: isoDate.optional(),
  limit: z.coerce.number().int().min(11).max(999).optional(),
  offset: nonNegativeInt.optional(),
};
export const fxQuoteByCurrencySchema = z.object(fxQuoteByCurrencyInput);
