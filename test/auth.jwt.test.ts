import {
  OAuthError,
  OAuthErrorCode,
  verifyBearerToken,
} from "@modelcontextprotocol/server";
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createOidcTokenVerifier } from "../src/http/oidc.js";

const ISSUER =
  "https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0";
const AUDIENCE = "api://11111111-1111-1111-1111-111111111111";
const METADATA = "https://mcp.example.com/.well-known/oauth-protected-resource";

type SignOptions = {
  issuer?: string;
  audience?: string;
  expiresAt?: number;
  omitExpiry?: boolean;
  omitSubject?: boolean;
  notBefore?: number;
};

const fixture = async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  const publicJwk: JWK = { ...jwk, alg: "RS256", kid: "test-key", use: "sig" };
  const keys = createLocalJWKSet({ keys: [publicJwk] });
  const sign = (claims: Record<string, unknown>, options?: SignOptions) => {
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
      .setIssuer(options?.issuer ?? ISSUER)
      .setAudience(options?.audience ?? AUDIENCE)
      .setIssuedAt();
    if (!options?.omitSubject) jwt.setSubject("user-1");
    if (options?.notBefore !== undefined) jwt.setNotBefore(options.notBefore);
    if (!options?.omitExpiry) {
      jwt.setExpirationTime(options?.expiresAt ?? Math.floor(Date.now() / 1000) + 600);
    }
    return jwt.sign(privateKey);
  };

  const verifierFor = (requiredRoles: string[] = []) =>
    createOidcTokenVerifier({
      issuer: ISSUER,
      audiences: [AUDIENCE],
      keys,
      requiredRoles,
    });

  const check = (
    token: string,
    requiredScopes: string[] = ["mcp.access"],
    requiredRoles: string[] = [],
  ) =>
    verifyBearerToken(`Bearer ${token}`, {
      verifier: verifierFor(requiredRoles),
      requiredScopes,
      resourceMetadataUrl: METADATA,
    });

  return { sign, check };
};

describe("OIDC access token validation", () => {
  it("accepts a valid token, including an Entra scp claim", async () => {
    const { sign, check } = await fixture();
    const scopeToken = await sign({ scope: "mcp.access", azp: "client-app" });
    const scopeInfo = await check(scopeToken);
    expect(scopeInfo.clientId).toBe("client-app");
    expect(scopeInfo.scopes).toEqual(["mcp.access"]);
    expect(scopeInfo.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const scpToken = await sign({ scp: "mcp.access" });
    const scpInfo = await check(scpToken);
    expect(scpInfo.scopes).toEqual(["mcp.access"]);
  });

  it("rejects an expired token", async () => {
    const { sign, check } = await fixture();
    const token = await sign(
      { scope: "mcp.access" },
      { expiresAt: Math.floor(Date.now() / 1000) - 120 },
    );
    await expect(check(token)).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
      message: "Token has expired",
    });
  });

  it("rejects a token for the wrong audience", async () => {
    const { sign, check } = await fixture();
    const token = await sign({ scope: "mcp.access" }, { audience: "api://other-api" });
    await expect(check(token)).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
      message: "Token audience is not accepted",
    });
  });

  it("rejects a token from the wrong issuer", async () => {
    const { sign, check } = await fixture();
    const token = await sign(
      { scope: "mcp.access" },
      {
        issuer:
          "https://login.microsoftonline.com/ffffffff-ffff-ffff-ffff-ffffffffffff/v2.0",
      },
    );
    await expect(check(token)).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
      message: "Token issuer is not accepted",
    });
  });

  it("rejects a token that is missing a required scope", async () => {
    const { sign, check } = await fixture();
    const token = await sign({ scope: "other.read" });
    await expect(check(token)).rejects.toBeInstanceOf(OAuthError);
    await expect(check(token)).rejects.toMatchObject({
      code: OAuthErrorCode.InsufficientScope,
    });
  });

  it("rejects a token that is missing a required role", async () => {
    const { sign, check } = await fixture();
    const denied = await sign({ scope: "mcp.access", roles: ["Other.Role"] });
    await expect(check(denied, ["mcp.access"], ["MCP.User"])).rejects.toMatchObject({
      code: OAuthErrorCode.InsufficientScope,
      message: "Missing required role",
    });

    const allowed = await sign({ scope: "mcp.access", roles: ["MCP.User"] });
    await expect(check(allowed, ["mcp.access"], ["MCP.User"])).resolves.toMatchObject({
      scopes: ["mcp.access"],
    });
  });

  it("rejects a token with no expiry, a future not-before, or a malformed token", async () => {
    const { sign, check } = await fixture();
    const noExp = await sign({ scope: "mcp.access" }, { omitExpiry: true });
    await expect(check(noExp)).rejects.toMatchObject({
      message: "Token has no expiration time",
    });

    const notYet = await sign(
      { scope: "mcp.access" },
      { notBefore: Math.floor(Date.now() / 1000) + 3600 },
    );
    await expect(check(notYet)).rejects.toMatchObject({
      message: "Token is not valid at this time",
    });

    await expect(check("not-a-jwt")).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
    });
  });

  it("reads scope lists and client ids from common OIDC claims", async () => {
    const { sign, check } = await fixture();
    const listed = await sign({ scp: ["mcp.access"] });
    await expect(check(listed)).resolves.toMatchObject({ scopes: ["mcp.access"] });

    const appOnly = await sign(
      { appid: "app-client", scope: "mcp.access" },
      { omitSubject: true },
    );
    await expect(check(appOnly)).resolves.toMatchObject({ clientId: "app-client" });

    const anonymous = await sign({ scope: "mcp.access" }, { omitSubject: true });
    await expect(check(anonymous)).resolves.toMatchObject({ clientId: "unknown" });

    const stringRole = await sign({ scope: "mcp.access", roles: "MCP.User" });
    await expect(check(stringRole, ["mcp.access"], ["MCP.User"])).rejects.toMatchObject(
      {
        message: "Missing required role",
      },
    );
  });

  it("rejects a token signed by a different key", async () => {
    const { check } = await fixture();
    const other = await generateKeyPair("RS256", { extractable: true });
    const token = await new SignJWT({ scope: "mcp.access" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(other.privateKey);
    await expect(check(token)).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
      message: "Token signature is invalid",
    });
  });
});
