import { canonicalResource, type OidcAuthSettings } from "./config.js";

export type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: ["header"];
  resource_name: string;
  scopes_supported?: string[];
};

export const buildProtectedResourceMetadata = (
  auth: OidcAuthSettings,
  resourceUrl: URL,
): ProtectedResourceMetadata => ({
  resource: canonicalResource(resourceUrl),
  authorization_servers: [auth.issuer],
  bearer_methods_supported: ["header"],
  resource_name: "BCRA MCP",
  ...(auth.requiredScopes.length > 0
    ? { scopes_supported: [...auth.requiredScopes] }
    : {}),
});

/** Root well-known path plus the RFC 9728 path-inserted alias. */
export const metadataPaths = (mcpPath: string): string[] => {
  const suffix = mcpPath === "/" ? "" : mcpPath;
  const pathAware = `/.well-known/oauth-protected-resource${suffix}`;
  const root = "/.well-known/oauth-protected-resource";
  return pathAware === root ? [root] : [root, pathAware];
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300",
} as const;

export const metadataHttpResponse = (
  request: Request,
  document: ProtectedResourceMetadata,
): Response => {
  if (request.method === "OPTIONS") {
    const requested = request.headers.get("access-control-request-headers");
    const headers = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    });
    if (requested) {
      headers.set("Access-Control-Allow-Headers", requested);
      headers.set("Vary", "Access-Control-Request-Headers");
    }
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return Response.json(
      { error: "method_not_allowed" },
      {
        status: 405,
        headers: {
          Allow: "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
  const response = Response.json(document, { headers: CORS });
  if (request.method === "HEAD") {
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return response;
};
