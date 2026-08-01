import { z } from "zod";
import { bcraResponseSchema } from "../../shared/http/responseSchema.js";
import { cuitCuilCdi, localeInput } from "../../shared/validation/common.js";

export const clientIdSchema = z
  .object({ clientId: cuitCuilCdi, ...localeInput })
  .strict();
export const centralDeudoresResponseSchema = bcraResponseSchema;
