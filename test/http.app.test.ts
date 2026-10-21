import { request as httpRequest, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpApp } from "../src/http/app.js";
import type { HttpServerSettings } from "../src/http/config.js";
import { listenHttp, NodeHttpError, toWebRequest } from "../src/http/nodeServer.js";
import { createOidcTokenVerifier } from "../src/http/oidc.js";
import { startHttpServer } from "../src/http/server.js";

const ISSUER =
  "https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0";
const AUDIENCE = "api://11111111-1111-1111-1111-111111111111";
const METADATA = "http://127.0.0.1/.well-known/oauth-protected-resource";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const settings = (): HttpServerSettings => ({
  host: "127.0.0.1",
  port: 8080,
  mcpPath: "/mcp",
  resourceUrl: new URL("http://127.0.0.1/mcp"),
  allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
  allowedOrigins: ["localhost", "127.0.0.1", "[::1]"],
  auth: {
    kind: "oidc",
    issuer: ISSUER,
    audiences: [AUDIENCE],
    requiredScopes: ["mcp.access"],
    requiredRoles: [],
    resourceMetadataUrl: METADATA,
  },
});

const signer = async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const jwk: JWK = {
    ...(await exportJWK(publicKey)),
    alg: "RS256",
    kid: "test-key",
    use: "sig",
  };
  const verifier = createOidcTokenVerifier({
    issuer: ISSUER,
    audiences: [AUDIENCE],
    keys: createLocalJWKSet({ keys: [jwk] }),
    requiredRoles: [],
  });
  const sign = (claims: Record<string, unknown>) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(privateKey);
  return { verifier, sign };
};

const request = (path: string, init?: RequestInit & { origin?: string }) => {
  const headers = new Headers(init?.headers);
  headers.set("host", "127.0.0.1");
  if (init?.origin) headers.set("origin", init.origin);
  return new Request(`http://127.0.0.1${path}`, { ...init, headers });
};

describe("HTTP resource server", () => {
  it("publishes protected resource metadata without a token", async () => {
    const { verifier } = await signer();
    const app = createHttpApp({ settings: settings(), verifier });
    closers.push(() => app.close());

    const response = await app.fetch(request("/.well-known/oauth-protected-resource"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resource: "http://127.0.0.1/mcp",
      authorization_servers: [ISSUER],
      bearer_methods_supported: ["header"],
      resource_name: "BCRA MCP",
      scopes_supported: ["mcp.access"],
    });

    const alias = await app.fetch(request("/.well-known/oauth-protected-resource/mcp"));
    expect(alias.status).toBe(200);
    expect(await alias.json()).toMatchObject({ authorization_servers: [ISSUER] });
  });

  it("answers 401 with a bearer challenge when the token is missing", async () => {
    const { verifier } = await signer();
    const app = createHttpApp({ settings: settings(), verifier });
    closers.push(() => app.close());

    const response = await app.fetch(
      request("/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain('scope="mcp.access"');
    expect(challenge).toContain(`resource_metadata="${METADATA}"`);
    expect(await response.json()).toMatchObject({ error: "invalid_token" });
  });

  it("rejects query-string tokens and foreign origins", async () => {
    const { verifier, sign } = await signer();
    const app = createHttpApp({ settings: settings(), verifier });
    closers.push(() => app.close());
    const token = await sign({ scope: "mcp.access" });

    const query = await app.fetch(
      request(`/mcp?access_token=${token}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: "{}",
      }),
    );
    expect(query.status).toBe(401);
    expect(query.headers.get("www-authenticate")).toContain("Authorization header");

    const origin = await app.fetch(
      request("/mcp", { method: "POST", origin: "https://evil.example", body: "{}" }),
    );
    expect(origin.status).toBe(403);
  });

  it("lists the public catalog when the bearer token is valid", async () => {
    const { verifier, sign } = await signer();
    const app = createHttpApp({ settings: settings(), verifier });
    closers.push(() => app.close());
    const token = await sign({ scp: "mcp.access", azp: "client-app" });
    const transport = new StreamableHTTPClientTransport(
      new URL("http://127.0.0.1/mcp"),
      {
        authProvider: { token: async () => token },
        fetch: async (url, init) => {
          const incoming = new Request(url, init);
          const headers = new Headers(incoming.headers);
          if (!headers.has("host")) headers.set("host", "127.0.0.1");
          const body =
            incoming.method === "GET" || incoming.method === "HEAD"
              ? undefined
              : await incoming.arrayBuffer();
          return app.fetch(
            new Request(incoming.url, { method: incoming.method, headers, body }),
          );
        },
      },
    );
    const client = new Client(
      { name: "http-auth-test", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    closers.push(() => client.close());
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(13);
  });

  it("serves an unauthenticated insecure server and keeps health on the socket", async () => {
    const insecure = settings();
    insecure.auth = { kind: "insecure" };
    const app = createHttpApp({ settings: insecure });
    const listening = await listenHttp(app, "127.0.0.1", 0);
    closers.push(() => listening.close());

    const health = await fetch(`http://127.0.0.1:${listening.port}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const missing = await fetch(`http://127.0.0.1:${listening.port}/mcp`, {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
    });
    expect(missing.status).not.toBe(401);
  });

  it("covers metadata methods, health, origin, and unknown paths", async () => {
    const { verifier, sign } = await signer();
    const app = createHttpApp({ settings: settings(), verifier });
    closers.push(() => app.close());

    const options = await app.fetch(
      request("/.well-known/oauth-protected-resource", {
        method: "OPTIONS",
        headers: { "access-control-request-headers": "authorization" },
      }),
    );
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-headers")).toBe("authorization");

    const head = await app.fetch(
      request("/.well-known/oauth-protected-resource", { method: "HEAD" }),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    const deleted = await app.fetch(
      request("/.well-known/oauth-protected-resource", { method: "DELETE" }),
    );
    expect(deleted.status).toBe(405);

    const healthHead = await app.fetch(request("/healthz", { method: "HEAD" }));
    expect(healthHead.status).toBe(200);
    const healthPost = await app.fetch(request("/healthz", { method: "POST" }));
    expect(healthPost.status).toBe(405);

    const missing = await app.fetch(request("/nope"));
    expect(missing.status).toBe(404);

    const badHost = await app.fetch(
      new Request("http://evil.example/mcp", { headers: { host: "evil.example" } }),
    );
    expect(badHost.status).toBe(403);

    const preflight = await app.fetch(
      request("/mcp", {
        method: "OPTIONS",
        origin: "http://127.0.0.1",
        headers: { "access-control-request-headers": "authorization, content-type" },
      }),
    );
    expect(preflight.status).toBe(204);

    const barePreflight = await app.fetch(request("/mcp", { method: "OPTIONS" }));
    expect(barePreflight.status).toBe(405);

    const token = await sign({ scope: "mcp.access" });
    const challenged = await app.fetch(
      request("/mcp/", {
        method: "POST",
        origin: "http://127.0.0.1",
        headers: { authorization: `Bearer ${token}` },
        body: "{}",
      }),
    );
    expect(challenged.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1",
    );

    const queryToken = await app.fetch(
      request("/mcp?token=abc", { method: "POST", body: "{}" }),
    );
    expect(queryToken.status).toBe(401);

    const root = settings();
    root.mcpPath = "/";
    root.resourceUrl = new URL("http://127.0.0.1/");
    root.auth = {
      kind: "oidc",
      issuer: ISSUER,
      audiences: [AUDIENCE],
      requiredScopes: [],
      requiredRoles: [],
      resourceMetadataUrl: METADATA,
    };
    const rootApp = createHttpApp({ settings: root, verifier });
    closers.push(() => rootApp.close());
    const rootMeta = await rootApp.fetch(
      request("/.well-known/oauth-protected-resource"),
    );
    const document = (await rootMeta.json()) as { resource?: string };
    expect(document).toMatchObject({ resource: "http://127.0.0.1" });
    expect(document).not.toHaveProperty("scopes_supported");

    expect(() => createHttpApp({ settings: settings() })).toThrow(/token verifier/);
  });

  it("maps node adapter failures and starts the insecure process", async () => {
    const bad = Readable.from([]) as IncomingMessage;
    bad.method = "GET";
    bad.url = "/";
    bad.headers = { host: "bad host" };
    await expect(toWebRequest(bad)).rejects.toBeInstanceOf(NodeHttpError);

    const huge = Readable.from([Buffer.alloc(4 * 1024 * 1024 + 1)]) as IncomingMessage;
    huge.method = "POST";
    huge.url = "/mcp";
    huge.headers = { host: "127.0.0.1" };
    await expect(toWebRequest(huge)).rejects.toMatchObject({ status: 413 });

    const crashing = {
      fetch: async () => {
        throw new Error("boom");
      },
      close: async () => undefined,
    };
    const crashed = await listenHttp(crashing, "127.0.0.1", 0);
    closers.push(() => crashed.close());
    const failed = await fetch(`http://127.0.0.1:${crashed.port}/mcp`);
    expect(failed.status).toBe(500);

    const listening = await startHttpServer({
      MCP_AUTH_INSECURE_DEV: "true",
      MCP_HOST: "127.0.0.1",
      MCP_PORT: String(await freePort()),
    });
    closers.push(() => listening.close());
    const health = await fetch(`http://127.0.0.1:${listening.port}/healthz`);
    expect(health.status).toBe(200);
  });

  it("exposes auth and MCP headers on allowed cross-origin challenges", async () => {
    const { verifier, sign } = await signer();
    const app = createHttpApp({ settings: settings(), verifier });
    closers.push(() => app.close());

    const unauthorized = await app.fetch(
      request("/mcp", { method: "POST", origin: "http://127.0.0.1", body: "{}" }),
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("invalid_token");
    const exposed = unauthorized.headers.get("access-control-expose-headers") ?? "";
    expect(exposed).toMatch(/WWW-Authenticate/i);
    expect(exposed).toMatch(/Mcp-Session-Id/i);
    expect(exposed).toMatch(/MCP-Protocol-Version/i);
    expect(unauthorized.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1",
    );

    const token = await sign({ scope: "other" });
    const forbidden = await app.fetch(
      request("/mcp", {
        method: "POST",
        origin: "http://localhost",
        headers: { authorization: `Bearer ${token}` },
        body: "{}",
      }),
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("access-control-expose-headers")).toMatch(
      /WWW-Authenticate/i,
    );

    const query = await app.fetch(
      request("/mcp?token=abc", {
        method: "POST",
        origin: "http://127.0.0.1",
        body: "{}",
      }),
    );
    expect(query.status).toBe(401);
    expect(query.headers.get("access-control-expose-headers")).toMatch(
      /WWW-Authenticate/i,
    );
  });

  it("aborts the request signal when the client disconnects after the body is read", async () => {
    let signal: AbortSignal | undefined;
    let markSeen: () => void = () => undefined;
    const seen = new Promise<void>((resolve) => {
      markSeen = resolve;
    });
    const listening = await listenHttp(
      {
        fetch: (incoming) => {
          signal = incoming.signal;
          markSeen();
          return new Promise<Response>((resolve) => {
            if (incoming.signal.aborted) {
              resolve(new Response(null, { status: 499 }));
              return;
            }
            incoming.signal.addEventListener(
              "abort",
              () => resolve(new Response(null, { status: 499 })),
              { once: true },
            );
          });
        },
        close: async () => undefined,
      },
      "127.0.0.1",
      0,
    );
    closers.push(() => listening.close());

    const client = httpRequest({
      hostname: "127.0.0.1",
      port: listening.port,
      path: "/mcp",
      method: "POST",
      headers: {
        host: "127.0.0.1",
        "content-type": "application/json",
        "content-length": "2",
      },
    });
    client.on("error", () => undefined);
    client.end("{}");
    await seen;
    expect(signal?.aborted).toBe(false);
    const aborted = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("request signal stayed open after disconnect"));
      }, 1000);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    client.destroy();
    await aborted;
    expect(signal?.aborted).toBe(true);
  });

  it("leaves the request signal open when the response finishes", async () => {
    let signal: AbortSignal | undefined;
    const listening = await listenHttp(
      {
        fetch: async (incoming) => {
          signal = incoming.signal;
          expect(incoming.signal.aborted).toBe(false);
          return new Response("ok");
        },
        close: async () => undefined,
      },
      "127.0.0.1",
      0,
    );
    closers.push(() => listening.close());

    const response = await fetch(`http://127.0.0.1:${listening.port}/healthz`);
    expect(response.status).toBe(200);
    expect(signal?.aborted).toBe(false);

    const controller = new AbortController();
    const nodeRequest = Readable.from([]) as IncomingMessage;
    nodeRequest.method = "GET";
    nodeRequest.url = "/mcp";
    nodeRequest.headers = { host: "127.0.0.1" };
    const forwarded = await toWebRequest(nodeRequest, controller.signal);
    expect(forwarded.signal.aborted).toBe(false);
    controller.abort();
    expect(forwarded.signal.aborted).toBe(true);
  });
});

const freePort = async (): Promise<number> => {
  const { createServer } = await import("node:net");
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
};
