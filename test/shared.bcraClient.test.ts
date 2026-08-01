import { afterEach, describe, expect, it, vi } from "vitest";
import { createBcraHttpClient } from "../src/shared/http/bcraClient.js";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.BCRA_HTTP_TIMEOUT_MS;
  delete process.env.BCRA_HTTP_MAX_RESPONSE_BYTES;
  delete process.env.BCRA_HTTP_MAX_CONCURRENCY;
  delete process.env.BCRA_HTTP_RATE_LIMIT_PER_SECOND;
});

const clientWith = (
  fetchFn: typeof fetch,
  overrides: Parameters<typeof createBcraHttpClient>[0] = {},
) =>
  createBcraHttpClient({
    fetchFn,
    minIntervalMs: 0,
    maxRetries: 0,
    ...overrides,
  });

describe("BcraHttpClient", () => {
  it("builds only the BCRA URL and forwards query, locale and safe fetch options", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const client = clientWith(fetchFn);

    await expect(
      client.getJson(
        "/estadisticas/v4.0/Monetarias/1",
        { desde: "2024-01-01", limit: 10 },
        { locale: "en-US" },
      ),
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/1?desde=2024-01-01&limit=10",
    );
    expect(init).toMatchObject({
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json", "Accept-Language": "en-US" },
    });
  });

  it.each([
    "https://evil.example/data",
    "http://api.bcra.gob.ar/data",
    "//evil.example/data",
    "/safe\\evil",
    "/safe#fragment",
    "relative/path",
  ])("rejects unsafe request path %s before fetch", async (path) => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(clientWith(fetchFn).getJson(path)).rejects.toMatchObject({
      kind: "INVALID_REQUEST_PATH",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects redirects without following Location", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example" },
      }),
    );
    await expect(clientWith(fetchFn).getJson("/redirect")).rejects.toMatchObject({
      kind: "UPSTREAM_REDIRECT",
      statusCode: 302,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("classifies an empty non-2xx body as HTTP_ERROR", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 404 }));
    await expect(clientWith(fetchFn).getJson("/missing")).rejects.toMatchObject({
      kind: "HTTP_ERROR",
      statusCode: 404,
    });
  });

  it("bounds non-JSON error details while retaining HTTP_ERROR", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("upstream failed", { status: 500 }));
    await expect(clientWith(fetchFn).getJson("/failed")).rejects.toMatchObject({
      kind: "HTTP_ERROR",
      details: { body: "upstream failed" },
    });
  });

  it("distinguishes invalid JSON and an empty successful body", async () => {
    const invalidFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(clientWith(invalidFetch).getJson("/invalid")).rejects.toMatchObject({
      kind: "UPSTREAM_INVALID_JSON",
    });

    const emptyFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await expect(clientWith(emptyFetch).getJson("/empty")).rejects.toMatchObject({
      kind: "UPSTREAM_EMPTY_BODY",
    });
    await expect(
      clientWith(emptyFetch).getJson("/empty", undefined, {
        allowEmptyBody: true,
      }),
    ).resolves.toBeNull();
  });

  it("rejects a response whose Content-Length exceeds the byte limit", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "Content-Length": "100" },
      }),
    );
    await expect(
      clientWith(fetchFn, { maxResponseBytes: 10 }).getJson("/large"),
    ).rejects.toMatchObject({ kind: "UPSTREAM_RESPONSE_TOO_LARGE" });
  });

  it("counts streamed UTF-8 bytes even without Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('"áááá"'));
        controller.close();
      },
    });
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    await expect(
      clientWith(fetchFn, { maxResponseBytes: 5 }).getJson("/large"),
    ).rejects.toMatchObject({ kind: "UPSTREAM_RESPONSE_TOO_LARGE" });
  });

  it("distinguishes external cancellation from timeout", async () => {
    const blockingFetch = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(init.signal.reason);
            return;
          }
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const controller = new AbortController();
    const cancelled = clientWith(blockingFetch).getJson("/blocked", undefined, {
      signal: controller.signal,
      timeoutMs: 500,
    });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ kind: "CANCELLED" });

    const timedOut = clientWith(blockingFetch).getJson("/blocked", undefined, {
      timeoutMs: 5,
    });
    await expect(timedOut).rejects.toMatchObject({ kind: "TIMEOUT" });
  });

  it("fails a pre-aborted request without starting fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(
      clientWith(fetchFn).getJson("/cancelled", undefined, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: "CANCELLED" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps unexpected fetch failures to NETWORK_ERROR", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("connection failed"));
    await expect(clientWith(fetchFn).getJson("/network")).rejects.toMatchObject({
      kind: "NETWORK_ERROR",
      message: "connection failed",
    });
  });

  it("retries only configured transient statuses and honors attempt bound", async () => {
    const transientFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 503,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    await expect(
      clientWith(transientFetch, { maxRetries: 1 }).getJson("/retry"),
    ).resolves.toEqual({ ok: true });
    expect(transientFetch).toHaveBeenCalledTimes(2);

    const permanentFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 500 }));
    await expect(
      clientWith(permanentFetch, { maxRetries: 2 }).getJson("/no-retry"),
    ).rejects.toMatchObject({ kind: "HTTP_ERROR", statusCode: 500 });
    expect(permanentFetch).toHaveBeenCalledTimes(1);
  });

  it("caps untrusted Retry-After values and never retries past the deadline", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 429,
        headers: { "Retry-After": "999999999999999999999" },
      }),
    );
    await expect(
      clientWith(fetchFn, { maxRetries: 1 }).getJson("/rate-limited", undefined, {
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({
      kind: "HTTP_ERROR",
      statusCode: 429,
      retryAfterMs: 60_000,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("enforces concurrency and queue bounds", async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const client = clientWith(fetchFn, {
      maxConcurrency: 1,
      maxQueue: 1,
      timeoutMs: 1_000,
    });

    const first = client.getJson("/one");
    const second = client.getJson("/two");
    const third = client.getJson("/three");
    await expect(third).rejects.toMatchObject({ kind: "OVERLOADED" });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    resolveFirst?.(new Response("{}", { status: 200 }));
    await expect(first).resolves.toEqual({});
    await expect(second).resolves.toEqual({});
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
