import { z } from "zod";

export const nonEmptyString = z.string().trim().min(1).max(200);
export const int32 = z.number().int().safe().positive().max(2_147_483_647);
export const positiveInt = z.number().int().safe().positive();
export const nonNegativeInt = z.number().int().safe().min(0);
export const boundedOffset = nonNegativeInt.max(1_000_000);
export const cuitCuilCdi = z
  .string()
  .regex(/^\d{11}$/, "Expected an 11-digit CUIT, CUIL or CDI");
export const numericString = z
  .string()
  .trim()
  .regex(/^\d+$/, "Expected numeric string");
export const chequeNumber = numericString.max(19);
export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "Expected a 3-letter uppercase currency code");
export const locale = z.enum(["es-AR", "en-US"]);

export const isoDate = z.string().superRefine((value, ctx) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    ctx.addIssue({
      code: "custom",
      message: "Expected format YYYY-MM-DD",
    });
    return;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    ctx.addIssue({ code: "custom", message: "Expected a valid calendar date" });
  }
});

export const validateDateRange = (
  value: { desde?: string; hasta?: string },
  ctx: z.RefinementCtx,
): void => {
  if (value.desde && value.hasta && value.desde > value.hasta) {
    ctx.addIssue({
      code: "custom",
      path: ["hasta"],
      message: "End date must not be earlier than start date",
    });
  }
};

export const paginationInput = {
  limit: z.number().int().safe().min(1).max(1_000).optional(),
  offset: boundedOffset.optional(),
};

export const localeInput = {
  idioma: locale.optional(),
};
