import { z } from "zod";
import { bcraResponseSchema } from "../../shared/http/responseSchema.js";
import { int32, localeInput } from "../../shared/validation/common.js";

export const transparenciaProductSchema = z.enum([
  "cajasAhorros",
  "paquetes",
  "plazosFijos",
  "prestamosPrendarios",
  "prestamosHipotecarios",
  "prestamosPersonales",
  "tarjetas",
]);

export type TransparenciaProduct = z.infer<typeof transparenciaProductSchema>;

export const transparenciaProductInputSchema = z
  .object({
    producto: transparenciaProductSchema,
    codigoEntidad: int32.optional(),
    ...localeInput,
  })
  .strict();
export const transparenciaResponseSchema = bcraResponseSchema;
