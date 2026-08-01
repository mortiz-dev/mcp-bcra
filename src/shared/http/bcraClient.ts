import { DomainApiError, isDomainApiError } from "./errors.js";
import { RequestGate } from "./requestGate.js";

export type QueryValue = string | number | boolean | undefined;
export type BcraLocale = "es-AR" | "en-US";
export type BcraApiContext = {
  signal?: AbortSignal;
  idioma?: BcraLocale;
};

export type RequestOptions = {
  timeoutMs?: number;
  allowEmptyBody?: boolean;
  signal?: AbortSignal;
  locale?: BcraLocale;
};

export const toRequestOptions = (
  context?: BcraApiContext,
): RequestOptions | undefined =>
  context ? { signal: context.signal, locale: context.idioma } : undefined;

export type BcraHttpClient = {
  getJson(
    path: string,
    query?: Record<string, QueryValue>,
    opts?: RequestOptions,
  ): Promise<unknown>;
};

export type BcraHttpClientConfig = {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxConcurrency?: number;
  minIntervalMs?: number;
  maxRetries?: number;
  maxQueue?: number;
  random?: () => number;
  now?: () => number;
};

const BASE_URL = new URL("https://api.bcra.gob.ar");
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ERROR_BODY_MAX_BYTES = 32 * 1024;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_RATE_LIMIT_PER_SECOND = 5;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_QUEUE = 32;
const MAX_RETRY_AFTER_MS = 60_000;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const boundedEnvInt = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
};

const buildUrl = (path: string, query?: Record<string, QueryValue>): URL => {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("#")
  ) {
    throw new DomainApiError({
      kind: "INVALID_REQUEST_PATH",
      message: "BCRA requests require a safe relative path",
      source: "mcp-bcra",
    });
  }

  const url = new URL(path, BASE_URL);
  if (
    url.protocol !== "https:" ||
    url.origin !== BASE_URL.origin ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new DomainApiError({
      kind: "INVALID_REQUEST_PATH",
      message: "BCRA request escaped the configured API origin",
      source: "mcp-bcra",
    });
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
};

const abortableDelay = (delayMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

const readBody = async (
  response: Response,
  maxBytes: number,
  truncate: boolean,
): Promise<{ text: string; truncated: boolean }> => {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    if (truncate) {
      await response.body?.cancel();
      return { text: "", truncated: true };
    }
    await response.body?.cancel();
    throw new DomainApiError({
      kind: "UPSTREAM_RESPONSE_TOO_LARGE",
      message: `BCRA API response exceeded ${maxBytes} bytes`,
      source: "bcra",
      statusCode: response.status,
    });
  }

  if (!response.body) {
    return { text: "", truncated: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      text += decoder.decode();
      return { text, truncated: false };
    }
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      if (truncate) {
        return { text, truncated: true };
      }
      throw new DomainApiError({
        kind: "UPSTREAM_RESPONSE_TOO_LARGE",
        message: `BCRA API response exceeded ${maxBytes} bytes`,
        source: "bcra",
        statusCode: response.status,
      });
    }
    text += decoder.decode(value, { stream: true });
  }
};

const parseRetryAfter = (
  value: string | null,
  now: () => number,
): number | undefined => {
  if (!value) {
    return undefined;
  }
  if (/^\d+$/.test(value.trim())) {
    const milliseconds = Number(value.trim()) * 1000;
    return Number.isFinite(milliseconds)
      ? Math.min(milliseconds, MAX_RETRY_AFTER_MS)
      : MAX_RETRY_AFTER_MS;
  }
  const at = Date.parse(value);
  return Number.isFinite(at)
    ? Math.min(Math.max(0, at - now()), MAX_RETRY_AFTER_MS)
    : undefined;
};

const readHttpErrorDetails = async (response: Response): Promise<unknown> => {
  try {
    const { text, truncated } = await readBody(response, ERROR_BODY_MAX_BYTES, true);
    if (truncated) {
      return { truncated: true };
    }
    if (text.length === 0) {
      return undefined;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { body: text };
    }
  } catch {
    return undefined;
  }
};

export const createBcraHttpClient = (
  config: BcraHttpClientConfig = {},
): BcraHttpClient => {
  const timeoutMs =
    config.timeoutMs ??
    boundedEnvInt("BCRA_HTTP_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 100, 60_000);
  const maxResponseBytes =
    config.maxResponseBytes ??
    boundedEnvInt(
      "BCRA_HTTP_MAX_RESPONSE_BYTES",
      DEFAULT_MAX_RESPONSE_BYTES,
      64 * 1024,
      10 * 1024 * 1024,
    );
  const maxConcurrency =
    config.maxConcurrency ??
    boundedEnvInt("BCRA_HTTP_MAX_CONCURRENCY", DEFAULT_MAX_CONCURRENCY, 1, 16);
  const ratePerSecond = boundedEnvInt(
    "BCRA_HTTP_RATE_LIMIT_PER_SECOND",
    DEFAULT_RATE_LIMIT_PER_SECOND,
    1,
    20,
  );
  const minIntervalMs = config.minIntervalMs ?? Math.ceil(1000 / ratePerSecond);
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const fetchFn = config.fetchFn ?? globalThis.fetch;
  const random = config.random ?? Math.random;
  const now = config.now ?? Date.now;
  const gate = new RequestGate({
    maxConcurrency,
    minIntervalMs,
    maxQueue: config.maxQueue ?? DEFAULT_MAX_QUEUE,
    now,
  });

  return {
    async getJson(
      path: string,
      query?: Record<string, QueryValue>,
      opts?: RequestOptions,
    ): Promise<unknown> {
      const url = buildUrl(path, query);
      const requestTimeoutMs = opts?.timeoutMs ?? timeoutMs;
      const deadlineAt = now() + requestTimeoutMs;
      const controller = new AbortController();
      let abortKind: "TIMEOUT" | "CANCELLED" | undefined;
      const onExternalAbort = () => {
        if (!abortKind) {
          abortKind = "CANCELLED";
          controller.abort(opts?.signal?.reason);
        }
      };
      if (opts?.signal?.aborted) {
        onExternalAbort();
      } else {
        opts?.signal?.addEventListener("abort", onExternalAbort, { once: true });
      }
      const timeout = setTimeout(() => {
        if (!abortKind) {
          abortKind = "TIMEOUT";
          controller.abort(new Error("BCRA request deadline exceeded"));
        }
      }, requestTimeoutMs);

      try {
        for (let attempt = 0; ; attempt += 1) {
          const release = await gate.acquire(controller.signal);
          let response: Response;
          try {
            response = await fetchFn(url, {
              method: "GET",
              headers: {
                Accept: "application/json",
                ...(opts?.locale ? { "Accept-Language": opts.locale } : {}),
              },
              redirect: "manual",
              signal: controller.signal,
            });

            if (REDIRECT_STATUSES.has(response.status)) {
              await response.body?.cancel();
              throw new DomainApiError({
                kind: "UPSTREAM_REDIRECT",
                message: `BCRA API returned an unexpected redirect (${response.status})`,
                source: "bcra",
                statusCode: response.status,
              });
            }

            if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
              const retryAfterMs = parseRetryAfter(
                response.headers.get("retry-after"),
                now,
              );
              const exponentialMs = 250 * 2 ** attempt;
              const delayMs =
                retryAfterMs ?? Math.round(exponentialMs * (0.5 + random() / 2));
              await response.body?.cancel();
              release();
              if (delayMs >= deadlineAt - now()) {
                throw new DomainApiError({
                  kind: "HTTP_ERROR",
                  message: `BCRA API returned HTTP ${response.status}`,
                  source: "bcra",
                  statusCode: response.status,
                  retryAfterMs: delayMs,
                });
              }
              await abortableDelay(delayMs, controller.signal);
              continue;
            }

            if (!response.ok) {
              const details = await readHttpErrorDetails(response);
              throw new DomainApiError({
                kind: "HTTP_ERROR",
                message: `BCRA API returned HTTP ${response.status}`,
                source: "bcra",
                statusCode: response.status,
                details,
                retryAfterMs: parseRetryAfter(response.headers.get("retry-after"), now),
              });
            }

            const { text } = await readBody(response, maxResponseBytes, false);
            if (text.length === 0) {
              if (opts?.allowEmptyBody) {
                return null;
              }
              throw new DomainApiError({
                kind: "UPSTREAM_EMPTY_BODY",
                message: "BCRA API returned an empty response body",
                source: "bcra",
                statusCode: response.status,
              });
            }
            try {
              return JSON.parse(text) as unknown;
            } catch {
              throw new DomainApiError({
                kind: "UPSTREAM_INVALID_JSON",
                message: "BCRA API returned invalid JSON",
                source: "bcra",
                statusCode: response.status,
              });
            }
          } finally {
            release();
          }
        }
      } catch (error) {
        if (abortKind) {
          throw new DomainApiError({
            kind: abortKind,
            message:
              abortKind === "TIMEOUT"
                ? `BCRA API request timed out after ${requestTimeoutMs}ms`
                : "BCRA API request was cancelled",
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
        opts?.signal?.removeEventListener("abort", onExternalAbort);
      }
    },
  };
};

export default createBcraHttpClient;
