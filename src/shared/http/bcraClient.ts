import { DomainApiError, isDomainApiError } from "./errors.js";

export type QueryValue = string | number | boolean | undefined;

export type RequestOptions = {
  timeoutMs?: number;
  allowEmptyBody?: boolean;
};

export interface BcraHttpClient {
  getJson(
    path: string,
    query?: Record<string, QueryValue>,
    opts?: RequestOptions
  ): Promise<unknown>;
}

const BASE_URL = "https://api.bcra.gob.ar";
const DEFAULT_TIMEOUT_MS = 15_000;
const TIMEOUT_ENV = "BCRA_HTTP_TIMEOUT_MS";

const normalizePath = (path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return path.startsWith("/") ? `${BASE_URL}${path}` : `${BASE_URL}/${path}`;
};

const buildUrl = (path: string, query?: Record<string, QueryValue>): string => {
  const url = new URL(normalizePath(path));

  if (!query) {
    return url.toString();
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
};

const readTimeoutFromEnv = (): number => {
  const fromEnv = process.env[TIMEOUT_ENV];
  if (!fromEnv) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(fromEnv);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return parsed;
};

export const createBcraHttpClient = (): BcraHttpClient => ({
  async getJson(path: string, query?: Record<string, QueryValue>, opts?: RequestOptions): Promise<unknown> {
    const timeoutMs = opts?.timeoutMs ?? readTimeoutFromEnv();
    const allowEmptyBody = opts?.allowEmptyBody ?? false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(buildUrl(path, query), {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      const rawBody = await response.text();
      if (rawBody.length === 0) {
        if (allowEmptyBody) {
          return null;
        }

        throw new DomainApiError({
          kind: "UPSTREAM_EMPTY_BODY",
          message: "BCRA API returned an empty response body",
          source: "bcra",
          statusCode: response.status,
        });
      }

      let data: unknown;
      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new DomainApiError({
          kind: "UPSTREAM_INVALID_JSON",
          message: "BCRA API returned invalid JSON",
          source: "bcra",
          statusCode: response.status,
          details: rawBody,
        });
      }

      if (!response.ok) {
        throw new DomainApiError({
          kind: "HTTP_ERROR",
          message: `BCRA API returned HTTP ${response.status}`,
          source: "bcra",
          statusCode: response.status,
          details: data,
        });
      }

      return data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new DomainApiError({
          kind: "TIMEOUT",
          message: `BCRA API request timed out after ${timeoutMs}ms`,
          source: "bcra",
        });
      }

      if (isDomainApiError(error)) {
        throw error;
      }

      throw new DomainApiError({
        kind: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Unknown network error",
        source: "bcra",
      });
    } finally {
      clearTimeout(timeout);
    }
  },
});

export default createBcraHttpClient;
