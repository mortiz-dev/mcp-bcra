import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  hostHeaderValidationResponse,
  OAuthError,
  OAuthErrorCode,
  type OAuthTokenVerifier,
  originValidationResponse,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import createServer from "../server.js";
import type { HttpServerSettings } from "./config.js";
import {
  buildProtectedResourceMetadata,
  metadataHttpResponse,
  metadataPaths,
} from "./metadata.js";

export type HttpApp = {
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
};

export type CreateHttpAppOptions = {
  settings: HttpServerSettings;
  verifier?: OAuthTokenVerifier;
  createMcpServer?: () => ReturnType<typeof createServer>;
};

const stripTrailingSlash = (path: string): string =>
  path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

const jsonError = (status: number, error: string): Response =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

const allowedOrigin = (
  request: Request,
  allowedHosts: readonly string[],
): string | undefined => {
  const origin = request.headers.get("origin");
  if (!origin) return undefined;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return allowedHosts.includes(hostname) ? origin : undefined;
  } catch {
    return undefined;
  }
};

const withCors = (response: Response, origin: string | undefined): Response => {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const preflight = (origin: string, request: Request): Response => {
  const requested = request.headers.get("access-control-request-headers");
  const headers = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  });
  if (requested) {
    headers.set("Access-Control-Allow-Headers", requested);
    headers.append("Vary", "Access-Control-Request-Headers");
  }
  return new Response(null, { status: 204, headers });
};

/**
 * Streamable HTTP application: protected-resource metadata, health, and the
 * MCP endpoint. Authentication is applied only when OIDC settings are present.
 */
export const createHttpApp = (options: CreateHttpAppOptions): HttpApp => {
  const { settings } = options;
  if (settings.auth.kind === "oidc" && !options.verifier) {
    throw new Error("OIDC HTTP mode requires a token verifier");
  }

  const mcp = createMcpHandler(() => (options.createMcpServer ?? createServer)());
  const metadata =
    settings.auth.kind === "oidc" && settings.resourceUrl
      ? buildProtectedResourceMetadata(settings.auth, settings.resourceUrl)
      : undefined;
  const metadataPathSet = new Set(
    settings.auth.kind === "oidc" ? metadataPaths(settings.mcpPath) : [],
  );
  const gate =
    settings.auth.kind === "oidc" && options.verifier
      ? requireBearerAuth({
          verifier: options.verifier,
          requiredScopes: [...settings.auth.requiredScopes],
          resourceMetadataUrl: settings.auth.resourceMetadataUrl,
        })
      : undefined;
  const challengeOptions =
    settings.auth.kind === "oidc"
      ? {
          requiredScopes: [...settings.auth.requiredScopes],
          resourceMetadataUrl: settings.auth.resourceMetadataUrl,
        }
      : undefined;

  return {
    async fetch(request: Request): Promise<Response> {
      const rejectedHost = hostHeaderValidationResponse(request, settings.allowedHosts);
      if (rejectedHost) return rejectedHost;

      const url = new URL(request.url);
      const path = stripTrailingSlash(url.pathname);

      if (metadata && metadataPathSet.has(path)) {
        return metadataHttpResponse(request, metadata);
      }

      if (path === "/healthz") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return jsonError(405, "method_not_allowed");
        }
        const response = Response.json(
          { status: "ok" },
          { headers: { "Cache-Control": "no-store" } },
        );
        return request.method === "HEAD"
          ? new Response(null, { status: 200, headers: response.headers })
          : response;
      }

      if (path !== settings.mcpPath) return jsonError(404, "not_found");

      const rejectedOrigin = originValidationResponse(request, settings.allowedOrigins);
      if (rejectedOrigin) return rejectedOrigin;

      const origin = allowedOrigin(request, settings.allowedOrigins);
      if (request.method === "OPTIONS") {
        return origin
          ? preflight(origin, request)
          : jsonError(405, "method_not_allowed");
      }

      if (url.searchParams.has("access_token") || url.searchParams.has("token")) {
        return bearerAuthChallengeResponse(
          new OAuthError(
            OAuthErrorCode.InvalidToken,
            "Access tokens must be sent in the Authorization header",
          ),
          challengeOptions,
        );
      }

      if (!gate) return withCors(await mcp.fetch(request), origin);

      const auth = await gate(request);
      if (auth instanceof Response) return withCors(auth, origin);
      return withCors(await mcp.fetch(request, { authInfo: auth }), origin);
    },
    close: () => mcp.close(),
  };
};
