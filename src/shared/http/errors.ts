export type DomainApiErrorKind =
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UPSTREAM_INVALID_JSON"
  | "UPSTREAM_EMPTY_BODY";

export class DomainApiError extends Error {
  kind: DomainApiErrorKind;
  statusCode?: number;
  source: string;
  details?: unknown;

  constructor(params: {
    kind: DomainApiErrorKind;
    message: string;
    source: string;
    statusCode?: number;
    details?: unknown;
  }) {
    super(params.message);
    this.name = "DomainApiError";
    this.kind = params.kind;
    this.source = params.source;
    this.statusCode = params.statusCode;
    this.details = params.details;
  }
}

export const isDomainApiError = (error: unknown): error is DomainApiError =>
  error instanceof DomainApiError;
