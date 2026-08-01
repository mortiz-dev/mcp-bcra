import { z } from "zod";
import { bcraResponseSchema } from "../../shared/http/responseSchema.js";
import {
  chequeNumber,
  cuitCuilCdi,
  int32,
  localeInput,
} from "../../shared/validation/common.js";

export const clientIdSchema = z
  .object({ clientId: cuitCuilCdi, ...localeInput })
  .strict();
export const emptyChequesInputSchema = z.object(localeInput).strict();
export const reportedCheckSchema = z
  .object({
    codigoEntidad: int32,
    numeroCheque: chequeNumber,
    ...localeInput,
  })
  .strict();
export const chequesResponseSchema = bcraResponseSchema;
