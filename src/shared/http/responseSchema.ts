import { z } from "zod";
import { DomainApiError, isDomainApiError } from "./errors.js";

export const bcraResponseSchema = z
  .object({
    status: z.number().int(),
    metadata: z.json().optional(),
    results: z.json(),
  })
  .catchall(z.json());

export type BcraResponse = z.infer<typeof bcraResponseSchema>;

export const parseBcraResponse = (data: unknown, source: string): BcraResponse => {
  try {
    return bcraResponseSchema.parse(data);
  } catch (error) {
    if (isDomainApiError(error)) {
      throw error;
    }
    throw new DomainApiError({
      kind: "UPSTREAM_SCHEMA_MISMATCH",
      message: `BCRA API returned an unexpected ${source} response shape`,
      source: "bcra",
      details:
        error instanceof z.ZodError
          ? error.issues.map(({ code, path, message }) => ({ code, path, message }))
          : undefined,
    });
  }
};
