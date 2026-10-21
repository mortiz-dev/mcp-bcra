import { createServer, type Server } from "node:http";
import { verifyBearerToken } from "@modelcontextprotocol/server";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { createConfiguredVerifier, discoverOpenIdProvider } from "../src/http/oidc.js";
import { startHttpServer } from "../src/http/server.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

const listen = async (
  handler: (url: URL, port: number) => { status: number; body: unknown } | undefined,
) => {
  let port = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const match = handler(url, port);
    if (!match) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(match.status, { "content-type": "application/json" });
    res.end(JSON.stringify(match.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
  return port;
};

describe("OpenID provider discovery", () => {
  it("loads a local JWKS and validates a token from that issuer", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    const jwk: JWK = {
      ...(await exportJWK(publicKey)),
      alg: "RS256",
      kid: "local-1",
      use: "sig",
    };
    const port = await listen((url, bound) => {
      const issuer = `http://127.0.0.1:${bound}`;
      if (url.pathname === "/.well-known/openid-configuration") {
        return {
          status: 200,
          body: {
            issuer,
            jwks_uri: `${issuer}/jwks`,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/oauth/token`,
          },
        };
      }
      if (url.pathname === "/jwks") return { status: 200, body: { keys: [jwk] } };
      return undefined;
    });
    const issuer = `http://127.0.0.1:${port}`;
    const discovered = await discoverOpenIdProvider(issuer);
    expect(discovered).toEqual({ issuer, jwksUri: `${issuer}/jwks` });

    const verifier = await createConfiguredVerifier({
      issuer,
      audiences: ["api://mcp-bcra"],
      requiredScopes: ["mcp.access"],
      requiredRoles: [],
      resourceMetadataUrl: "http://127.0.0.1/.well-known/oauth-protected-resource",
    });
    const token = await new SignJWT({ scope: "mcp.access" })
      .setProtectedHeader({ alg: "RS256", kid: "local-1" })
      .setIssuer(issuer)
      .setAudience("api://mcp-bcra")
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const auth = await verifyBearerToken(`Bearer ${token}`, {
      verifier,
      requiredScopes: ["mcp.access"],
    });
    expect(auth.scopes).toEqual(["mcp.access"]);

    const wrongAudience = await new SignJWT({ scope: "mcp.access" })
      .setProtectedHeader({ alg: "RS256", kid: "local-1" })
      .setIssuer(issuer)
      .setAudience("api://other")
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(
      verifyBearerToken(`Bearer ${wrongAudience}`, {
        verifier,
        requiredScopes: ["mcp.access"],
      }),
    ).rejects.toMatchObject({ message: "Token audience is not accepted" });

    const { createServer: createNetServer } = await import("node:net");
    const mcpPort = await new Promise<number>((resolve) => {
      const probe = createNetServer();
      probe.listen(0, "127.0.0.1", () => {
        const address = probe.address();
        const chosen = typeof address === "object" && address ? address.port : 0;
        probe.close(() => resolve(chosen));
      });
    });
    const httpServer = await startHttpServer({
      MCP_HOST: "127.0.0.1",
      MCP_PORT: String(mcpPort),
      MCP_RESOURCE_URL: "http://127.0.0.1/mcp",
      MCP_AUTH_ISSUER: issuer,
      MCP_AUTH_AUDIENCE: "api://mcp-bcra",
      MCP_AUTH_REQUIRED_SCOPES: "mcp.access",
    });
    try {
      const metadata = await fetch(
        `http://127.0.0.1:${httpServer.port}/.well-known/oauth-protected-resource`,
      );
      expect(metadata.status).toBe(200);
      const unauthorized = await fetch(`http://127.0.0.1:${httpServer.port}/mcp`, {
        method: "POST",
      });
      expect(unauthorized.status).toBe(401);
      expect(unauthorized.headers.get("www-authenticate")).toContain(
        "resource_metadata",
      );
    } finally {
      await httpServer.close();
    }
  });

  it("reports discovery and JWKS failures without following the network", async () => {
    const issuer = "https://issuer.example.test";
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });

    await expect(
      discoverOpenIdProvider(issuer, async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow(/request failed/);

    await expect(
      discoverOpenIdProvider(issuer, async () => new Response("no", { status: 503 })),
    ).rejects.toThrow(/HTTP 503/);

    await expect(
      discoverOpenIdProvider(
        issuer,
        async () => new Response("not-json", { status: 200 }),
      ),
    ).rejects.toThrow(/not JSON/);

    await expect(
      discoverOpenIdProvider(issuer, async () => json({ issuer })),
    ).rejects.toThrow(/missing issuer or jwks_uri/);

    await expect(
      discoverOpenIdProvider(issuer, async () =>
        json({ issuer, jwks_uri: "http://idp.example.test/jwks" }),
      ),
    ).rejects.toThrow(/HTTPS/);

    await expect(
      createConfiguredVerifier(
        {
          issuer,
          audiences: ["api://mcp"],
          requiredScopes: [],
          requiredRoles: [],
          resourceMetadataUrl:
            "https://mcp.example.com/.well-known/oauth-protected-resource",
        },
        async (input) => {
          const url = String(input);
          if (url.endsWith("openid-configuration")) {
            return json({ issuer, jwks_uri: `${issuer}/jwks` });
          }
          return json({ keys: [] });
        },
      ),
    ).rejects.toThrow(/does not contain keys/);
  });

  it("refuses a discovery document whose issuer does not match", async () => {
    const port = await listen(() => ({
      status: 200,
      body: {
        issuer: "https://issuer.example.test",
        jwks_uri: "https://issuer.example.test/jwks",
      },
    }));
    await expect(discoverOpenIdProvider(`http://127.0.0.1:${port}`)).rejects.toThrow(
      /does not match MCP_AUTH_ISSUER/,
    );
  });
});
