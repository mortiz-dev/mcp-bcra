import { afterEach, describe, expect, it, vi } from "vitest";
import { createBcraHttpClient } from "../src/shared/http/bcraClient.js";
import { DomainApiError } from "../src/shared/http/errors.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete process.env.BCRA_HTTP_TIMEOUT_MS;
});

describe("bcraClient", () => {
  it("returns parsed JSON and forwards query params", async () => {
    const mockedFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    });
    globalThis.fetch = mockedFetch as typeof fetch;

    const client = createBcraHttpClient();
    const response = await client.getJson("/estadisticas/v4.0/Monetarias/1", {
      desde: "2024-01-01",
      hasta: "2024-12-31",
    });

    expect(response).toEqual({ ok: true });
    const requestedUrl = String(mockedFetch.mock.calls[0][0]);
    expect(requestedUrl).toContain("/estadisticas/v4.0/Monetarias/1");
    expect(requestedUrl).toContain("desde=2024-01-01");
    expect(requestedUrl).toContain("hasta=2024-12-31");
  });

  it("throws HTTP_ERROR on non-2xx response", async () => {
    const mockedFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('{"error":"down"}'),
    });
    globalThis.fetch = mockedFetch as typeof fetch;

    const client = createBcraHttpClient();

    await expect(client.getJson("/cheques/v1.0/entidades")).rejects.toMatchObject({
      kind: "HTTP_ERROR",
      statusCode: 503,
    });
  });

  it("throws UPSTREAM_INVALID_JSON on invalid payload", async () => {
    const mockedFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("not-json"),
    });
    globalThis.fetch = mockedFetch as typeof fetch;

    const client = createBcraHttpClient();

    await expect(client.getJson("/cheques/v1.0/entidades")).rejects.toMatchObject({
      kind: "UPSTREAM_INVALID_JSON",
    });
  });

  it("throws TIMEOUT for aborted requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const mockedFetch = vi.fn().mockRejectedValue(abortError);
    globalThis.fetch = mockedFetch as typeof fetch;

    const client = createBcraHttpClient();

    await expect(client.getJson("/cheques/v1.0/entidades", undefined, { timeoutMs: 10 })).rejects.toMatchObject({
      kind: "TIMEOUT",
    });
  });

  it("throws UPSTREAM_EMPTY_BODY when body is empty and not allowed", async () => {
    const mockedFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    });
    globalThis.fetch = mockedFetch as typeof fetch;

    const client = createBcraHttpClient();

    await expect(client.getJson("/cheques/v1.0/entidades")).rejects.toBeInstanceOf(DomainApiError);
    await expect(client.getJson("/cheques/v1.0/entidades")).rejects.toMatchObject({
      kind: "UPSTREAM_EMPTY_BODY",
    });
  });
});
