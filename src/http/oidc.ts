import {
  type AuthInfo,
  OAuthError,
  OAuthErrorCode,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import {
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
  errors as joseErrors,
  jwtVerify,
} from "jose";
import { z } from "zod";
import {
  assertHttpsOrLoopback,
  HttpConfigError,
  type OidcAuthSettings,
} from "./config.js";

const DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_DOCUMENT_BYTES = 512 * 1024;
/** Clock skew accepted while checking `exp` / `nbf`. The bearer gate is aligned with it. */
export const CLOCK_TOLERANCE_SECONDS = 30;

const ALLOWED_ALGORITHMS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
] as const;

const discoverySchema = z.object({
  issuer: z.string().min(1),
  jwks_uri: z.url(),
});

export type DiscoveredProvider = {
  issuer: string;
  jwksUri: string;
};

const invalidToken = (message: string): OAuthError =>
  new OAuthError(OAuthErrorCode.InvalidToken, message);

const readStringClaim = (payload: JWTPayload, name: string): string | undefined => {
  const value = payload[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** OAuth `scope` and Entra delegated `scp` are both accepted. */
export const readScopes = (payload: JWTPayload): string[] => {
  const scopes: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string") {
      scopes.push(...value.split(" ").filter((scope) => scope.length > 0));
      return;
    }
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (typeof entry === "string" && entry.length > 0) scopes.push(entry);
    }
  };
  collect(payload.scope);
  collect(payload.scp);
  return [...new Set(scopes)];
};

export const readRoles = (payload: JWTPayload): string[] => {
  const value = payload.roles;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (role): role is string => typeof role === "string" && role.length > 0,
  );
};

const readClientId = (payload: JWTPayload): string =>
  readStringClaim(payload, "azp") ??
  readStringClaim(payload, "client_id") ??
  readStringClaim(payload, "appid") ??
  readStringClaim(payload, "sub") ??
  "unknown";

const mapVerificationError = (error: unknown): OAuthError => {
  if (error instanceof OAuthError) return error;
  if (error instanceof joseErrors.JWTExpired) return invalidToken("Token has expired");
  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    if (error.claim === "aud") return invalidToken("Token audience is not accepted");
    if (error.claim === "iss") return invalidToken("Token issuer is not accepted");
    if (error.claim === "exp" || error.claim === "nbf") {
      return invalidToken("Token is not valid at this time");
    }
    return invalidToken("Token claims are not accepted");
  }
  if (
    error instanceof joseErrors.JWSSignatureVerificationFailed ||
    error instanceof joseErrors.JWKSNoMatchingKey ||
    error instanceof joseErrors.JOSEAlgNotAllowed ||
    error instanceof joseErrors.JWSInvalid ||
    error instanceof joseErrors.JWTInvalid
  ) {
    return invalidToken("Token signature is invalid");
  }
  return invalidToken("Token is invalid");
};

export const openIdDiscoveryUrl = (issuer: string): URL => {
  const base = issuer.endsWith("/") ? issuer : `${issuer}/`;
  return new URL(".well-known/openid-configuration", base);
};

const fetchDocument = async (
  url: URL,
  label: string,
  fetchImpl: typeof fetch,
): Promise<unknown> => {
  assertHttpsOrLoopback(url, label);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    throw new HttpConfigError(`${label} request failed for ${url.href}: ${message}`);
  }
  if (!response.ok) {
    throw new HttpConfigError(
      `${label} request failed for ${url.href}: HTTP ${response.status}`,
    );
  }
  const text = await response.text();
  if (text.length > MAX_DOCUMENT_BYTES) {
    throw new HttpConfigError(`${label} document from ${url.href} is too large`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpConfigError(`${label} document from ${url.href} is not JSON`);
  }
};

export const discoverOpenIdProvider = async (
  issuer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveredProvider> => {
  const url = openIdDiscoveryUrl(issuer);
  const body = await fetchDocument(url, "OpenID discovery", fetchImpl);
  const parsed = discoverySchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpConfigError(
      `OpenID discovery document from ${url.href} is missing issuer or jwks_uri`,
    );
  }
  if (parsed.data.issuer !== issuer) {
    throw new HttpConfigError(
      `OpenID discovery issuer ${JSON.stringify(parsed.data.issuer)} does not match MCP_AUTH_ISSUER ${JSON.stringify(issuer)}. Use the issuer exactly as the provider publishes it, including a trailing slash when the provider uses one.`,
    );
  }
  const jwksUrl = new URL(parsed.data.jwks_uri);
  assertHttpsOrLoopback(jwksUrl, "jwks_uri");
  return { issuer: parsed.data.issuer, jwksUri: parsed.data.jwks_uri };
};

const assertJwksDocument = (body: unknown, url: URL): void => {
  if (typeof body !== "object" || body === null || !("keys" in body)) {
    throw new HttpConfigError(`JWKS document from ${url.href} is missing keys`);
  }
  const keys = body.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new HttpConfigError(`JWKS document from ${url.href} does not contain keys`);
  }
};

export type TokenVerifierOptions = {
  issuer: string;
  audiences: readonly string[];
  keys: JWTVerifyGetKey;
  requiredRoles: readonly string[];
  clockToleranceSeconds?: number;
};

/**
 * Validate an access token as an OIDC JWT: signature (JWKS), issuer, audience,
 * expiry, and optional role claims. Required scopes are enforced by the MCP
 * bearer gate from the scopes returned here.
 */
export const createOidcTokenVerifier = (
  options: TokenVerifierOptions,
): OAuthTokenVerifier => {
  const clockToleranceSeconds =
    options.clockToleranceSeconds ?? CLOCK_TOLERANCE_SECONDS;
  const audiences = [...options.audiences];
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let payload: JWTPayload;
      try {
        const verified = await jwtVerify(token, options.keys, {
          issuer: options.issuer,
          audience: audiences,
          algorithms: [...ALLOWED_ALGORITHMS],
          clockTolerance: clockToleranceSeconds,
        });
        payload = verified.payload;
      } catch (error) {
        throw mapVerificationError(error);
      }

      const expiresAt = payload.exp;
      if (typeof expiresAt !== "number") {
        throw invalidToken("Token has no expiration time");
      }

      if (options.requiredRoles.length > 0) {
        const roles = new Set(readRoles(payload));
        const missingRole = options.requiredRoles.some((role) => !roles.has(role));
        if (missingRole) {
          throw new OAuthError(
            OAuthErrorCode.InsufficientScope,
            "Missing required role",
          );
        }
      }

      // `requireBearerAuth` rejects `expiresAt` in the past with no skew.
      // jose already applied the tolerance, so report a still-valid timestamp
      // when the token is inside that window.
      const nowSeconds = Math.floor(Date.now() / 1000);
      return {
        token,
        clientId: readClientId(payload),
        scopes: readScopes(payload),
        expiresAt: Math.max(expiresAt, nowSeconds + 1),
        extra: { roles: readRoles(payload) },
      };
    },
  };
};

/** Discover the issuer, check `iss`, and build a remote-JWKS verifier. */
export const createConfiguredVerifier = async (
  auth: OidcAuthSettings,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenVerifier> => {
  const discovered = await discoverOpenIdProvider(auth.issuer, fetchImpl);
  const jwksUri = auth.jwksUri ?? discovered.jwksUri;
  const jwksUrl = new URL(jwksUri);
  assertHttpsOrLoopback(jwksUrl, "JWKS URI");
  const document = await fetchDocument(jwksUrl, "JWKS", fetchImpl);
  assertJwksDocument(document, jwksUrl);
  return createOidcTokenVerifier({
    issuer: auth.issuer,
    audiences: auth.audiences,
    requiredRoles: auth.requiredRoles,
    keys: createRemoteJWKSet(jwksUrl, {
      timeoutDuration: DISCOVERY_TIMEOUT_MS,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60 * 1000,
    }),
  });
};
