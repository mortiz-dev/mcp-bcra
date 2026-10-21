import { describe, expect, it } from "vitest";
import {
  HttpConfigError,
  resolveHttpConfig,
  resolveTransport,
} from "../src/http/config.js";

const oidcEnv = {
  MCP_AUTH_ISSUER:
    "https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0",
  MCP_AUTH_AUDIENCE: "api://11111111-1111-1111-1111-111111111111",
  MCP_RESOURCE_URL: "https://mcp.example.com/mcp",
};

describe("transport selection", () => {
  it("keeps stdio as the default without auth settings", () => {
    expect(resolveTransport({})).toBe("stdio");
    expect(resolveTransport({ MCP_TRANSPORT: "stdio" })).toBe("stdio");
    expect(resolveTransport({ MCP_TRANSPORT: "" })).toBe("stdio");
    expect(resolveTransport({ MCP_AUTH_ISSUER: oidcEnv.MCP_AUTH_ISSUER })).toBe(
      "stdio",
    );
  });

  it("selects HTTP only when asked", () => {
    expect(resolveTransport({ MCP_TRANSPORT: "http" })).toBe("http");
    expect(resolveTransport({ MCP_TRANSPORT: "HTTP" })).toBe("http");
  });

  it("rejects an unknown transport", () => {
    expect(() => resolveTransport({ MCP_TRANSPORT: "sse" })).toThrow(HttpConfigError);
  });
});

describe("HTTP auth configuration", () => {
  it("refuses to start without OIDC settings", () => {
    expect(() => resolveHttpConfig({})).toThrow(/MCP_AUTH_ISSUER/);
    expect(() =>
      resolveHttpConfig({ MCP_AUTH_ISSUER: oidcEnv.MCP_AUTH_ISSUER }),
    ).toThrow(/MCP_AUTH_AUDIENCE/);
  });

  it("accepts a complete OIDC resource-server configuration", () => {
    const settings = resolveHttpConfig({
      ...oidcEnv,
      MCP_AUTH_REQUIRED_SCOPES: "mcp.access",
      MCP_AUTH_REQUIRED_ROLES: "MCP.User",
      MCP_HOST: "0.0.0.0",
      MCP_PORT: "8080",
    });
    expect(settings.auth.kind).toBe("oidc");
    if (settings.auth.kind !== "oidc") return;
    expect(settings.auth.issuer).toBe(oidcEnv.MCP_AUTH_ISSUER);
    expect(settings.auth.audiences).toEqual([
      "api://11111111-1111-1111-1111-111111111111",
    ]);
    expect(settings.auth.requiredScopes).toEqual(["mcp.access"]);
    expect(settings.auth.requiredRoles).toEqual(["MCP.User"]);
    expect(settings.auth.resourceMetadataUrl).toBe(
      "https://mcp.example.com/.well-known/oauth-protected-resource",
    );
    expect(settings.mcpPath).toBe("/mcp");
    expect(settings.host).toBe("0.0.0.0");
    expect(settings.allowedHosts).toContain("mcp.example.com");
  });

  it("preserves an issuer trailing slash", () => {
    const settings = resolveHttpConfig({
      ...oidcEnv,
      MCP_AUTH_ISSUER: "https://tenant.example.test/",
    });
    expect(settings.auth.kind).toBe("oidc");
    if (settings.auth.kind !== "oidc") return;
    expect(settings.auth.issuer).toBe("https://tenant.example.test/");
  });

  it("accepts several audiences", () => {
    const settings = resolveHttpConfig({
      ...oidcEnv,
      MCP_AUTH_AUDIENCE:
        "api://11111111-1111-1111-1111-111111111111, 11111111-1111-1111-1111-111111111111",
    });
    if (settings.auth.kind !== "oidc") throw new Error("expected oidc");
    expect(settings.auth.audiences).toEqual([
      "api://11111111-1111-1111-1111-111111111111",
      "11111111-1111-1111-1111-111111111111",
    ]);
  });

  it("allows an explicit insecure local server and rejects mixing it with OIDC", () => {
    const settings = resolveHttpConfig({ MCP_AUTH_INSECURE_DEV: "true" });
    expect(settings.auth).toEqual({ kind: "insecure" });
    expect(settings.mcpPath).toBe("/mcp");
    expect(() =>
      resolveHttpConfig({ MCP_AUTH_INSECURE_DEV: "true", ...oidcEnv }),
    ).toThrow(/cannot be combined/);
  });

  it("rejects HTTP issuers that are not loopback", () => {
    expect(() =>
      resolveHttpConfig({
        ...oidcEnv,
        MCP_AUTH_ISSUER: "http://idp.example.test/realms/app",
      }),
    ).toThrow(/HTTPS/);
  });

  it("rejects a reserved MCP path", () => {
    expect(() =>
      resolveHttpConfig({
        ...oidcEnv,
        MCP_RESOURCE_URL:
          "https://mcp.example.com/.well-known/oauth-protected-resource",
      }),
    ).toThrow(/reserved/);
    expect(() =>
      resolveHttpConfig({
        ...oidcEnv,
        MCP_RESOURCE_URL: "https://mcp.example.com/healthz",
      }),
    ).toThrow(/reserved/);
  });

  it.each([
    [{ MCP_PORT: "nope" }, /MCP_PORT/],
    [{ MCP_PORT: "0" }, /MCP_PORT/],
    [{ MCP_PORT: "70000" }, /MCP_PORT/],
    [{ MCP_HOST: "http://127.0.0.1" }, /MCP_HOST/],
    [{ MCP_AUTH_INSECURE_DEV: "maybe" }, /MCP_AUTH_INSECURE_DEV/],
    [{ MCP_ALLOWED_HOSTS: "https://mcp.example.com" }, /hostnames/],
    [{ MCP_AUTH_REQUIRED_SCOPES: 'mcp"access' }, /OAuth token/],
    [{ MCP_AUTH_AUDIENCE: "," }, /at least one audience/],
    [{ MCP_AUTH_AUDIENCE: 'api://"quoted"' }, /invalid audience/],
    [{ MCP_AUTH_JWKS_URI: "http://idp.example.test/jwks" }, /HTTPS/],
    [{ MCP_RESOURCE_URL: "https://user:pass@mcp.example.com/mcp" }, /userinfo/],
    [{ MCP_RESOURCE_URL: "https://mcp.example.com/mcp?x=1" }, /query/],
    [{ MCP_RESOURCE_URL: "https://mcp.example.com/mcp#frag" }, /fragment/],
    [{ MCP_AUTH_ISSUER: "not a url" }, /absolute URL/],
  ] as const)("rejects invalid HTTP settings %j", (patch, pattern) => {
    expect(() => resolveHttpConfig({ ...oidcEnv, ...patch })).toThrow(pattern);
  });

  it("treats an explicit false insecure flag as authenticated mode", () => {
    expect(() => resolveHttpConfig({ MCP_AUTH_INSECURE_DEV: "false" })).toThrow(
      /MCP_AUTH_ISSUER/,
    );
  });
});
