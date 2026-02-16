import { DomainApiError, isDomainApiError } from "../http/errors.js";

export type ToolHandlerResult = {
  content: Array<{ type: "text"; text: string }>;
};

const toText = (payload: unknown): ToolHandlerResult => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
});

export const toolSuccess = (data: unknown): ToolHandlerResult =>
  toText({ ok: true, data });

export const toolError = (error: unknown): ToolHandlerResult => {
  if (isDomainApiError(error)) {
    return toText({
      ok: false,
      error: {
        kind: error.kind,
        message: error.message,
        source: error.source,
        statusCode: error.statusCode,
      },
    });
  }

  return toText({
    ok: false,
    error: {
      kind: "UNKNOWN",
      message: error instanceof Error ? error.message : "Unexpected error",
      source: "mcp-bcra",
    },
  });
};

export const toDomainApiError = (error: unknown, message: string): DomainApiError => {
  if (isDomainApiError(error)) {
    return error;
  }

  return new DomainApiError({
    kind: "NETWORK_ERROR",
    message,
    source: "mcp-bcra",
    details: error,
  });
};
