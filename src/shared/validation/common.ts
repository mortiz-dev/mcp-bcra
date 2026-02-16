import { z } from "zod";

export const nonEmptyString = z.string().trim().min(1);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected format YYYY-MM-DD");
export const positiveInt = z.coerce.number().int().positive();
