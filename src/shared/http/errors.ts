export type DomainApiErrorKind =
  | "CANCELLED"
  | "HTTP_ERROR"
  | "INVALID_REQUEST_PATH"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "OVERLOADED"
  | "UPSTREAM_INVALID_JSON"
  | "UPSTREAM_EMPTY_BODY"
  | "UPSTREAM_REDIRECT"
  | "UPSTREAM_RESPONSE_TOO_LARGE"
  | "UPSTREAM_SCHEMA_MISMATCH";

export class DomainApiError extends Error {
  readonly kind: DomainApiErrorKind;
  readonly statusCode?: number;
  readonly source: string;
  readonly details?: unknown;
  readonly retryAfterMs?: number;

  constructor(params: {
    kind: DomainApiErrorKind;
    message: string;
    source: string;
    statusCode?: number;
    details?: unknown;
    retryAfterMs?: number;
  }) {
    super(params.message);
    this.name = "DomainApiError";
    this.kind = params.kind;
    this.source = params.source;
    this.statusCode = params.statusCode;
    this.details = params.details;
    this.retryAfterMs = params.retryAfterMs;
  }
}

export const isDomainApiError = (error: unknown): error is DomainApiError =>
  error instanceof DomainApiError;
