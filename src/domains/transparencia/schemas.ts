import { z } from "zod";
import { positiveInt } from "../../shared/validation/common.js";

export const transparenciaProductSchema = z.enum([
  "cajasAhorros",
  "cuentasCorrientes",
  "prestamosPersonales",
  "prestamosHipotecarios",
  "prestamosPrendarios",
  "tarjetas",
  "cajasSeguridad",
  "paquetes",
]);

export type TransparenciaProduct = z.infer<typeof transparenciaProductSchema>;

export const transparenciaProductInput = {
  producto: transparenciaProductSchema,
  codigoEntidad: positiveInt,
};
export const transparenciaProductInputSchema = z.object(transparenciaProductInput);
