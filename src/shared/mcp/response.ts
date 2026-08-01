import type { CallToolResult, JSONValue } from "@modelcontextprotocol/server";
import { z } from "zod";
import { isDomainApiError } from "../http/errors.js";

export type ToolHandlerResult = CallToolResult;

export const successOutputSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
  });

export const toolSuccess = (data: JSONValue): ToolHandlerResult => {
  const payload = { ok: true as const, data };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
};

export const toolError = (error: unknown): ToolHandlerResult => {
  const payload = isDomainApiError(error)
    ? {
        ok: false as const,
        error: {
          kind: error.kind,
          message: error.message,
          source: error.source,
          ...(error.statusCode === undefined ? {} : { statusCode: error.statusCode }),
          ...(error.retryAfterMs === undefined
            ? {}
            : { retryAfterMs: error.retryAfterMs }),
        },
      }
    : {
        ok: false as const,
        error: {
          kind: "UNKNOWN",
          message: error instanceof Error ? error.message : "Unexpected error",
          source: "mcp-bcra",
        },
      };

  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: true,
  };
};
