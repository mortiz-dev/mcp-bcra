/**
 * Environment configuration for the optional Streamable HTTP server.
 * stdio does not read these values. Nothing in this module performs I/O.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TRUE_FLAGS = new Set(["1", "true", "yes", "on"]);
const FALSE_FLAGS = new Set(["0", "false", "no", "off"]);
const SCOPE_TOKEN = /^[\u0021\u0023-\u005B\u005D-\u007E]+$/;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8080;
const DEFAULT_MCP_PATH = "/mcp";

export class HttpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpConfigError";
  }
}

export type OidcAuthSettings = {
  issuer: string;
  audiences: string[];
  requiredScopes: string[];
  requiredRoles: string[];
  /** Overrides the JWKS URI from discovery. Unset in normal deployments. */
  jwksUri?: string;
  resourceMetadataUrl: string;
};

export type HttpServerSettings = {
  host: string;
  port: number;
  mcpPath: string;
  /** Public MCP endpoint. Required when OIDC is enabled. */
  resourceUrl?: URL;
  allowedHosts: string[];
  allowedOrigins: string[];
  auth: { kind: "insecure" } | ({ kind: "oidc" } & OidcAuthSettings);
};

export type TransportMode = "stdio" | "http";

const read = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name]?.trim();
  return value ? value : undefined;
};

const splitList = (value: string): string[] => [
  ...new Set(value.split(/[\s,]+/).filter((part) => part.length > 0)),
];

const readFlag = (env: NodeJS.ProcessEnv, name: string): boolean => {
  const value = read(env, name);
  if (value === undefined) return false;
  const normalized = value.toLowerCase();
  if (TRUE_FLAGS.has(normalized)) return true;
  if (FALSE_FLAGS.has(normalized)) return false;
  throw new HttpConfigError(
    `${name} must be true or false (received ${JSON.stringify(value)})`,
  );
};

const isLoopback = (hostname: string): boolean => LOOPBACK_HOSTS.has(hostname);

/** HTTPS, or HTTP only when the host is a loopback address (local tests). */
export const assertHttpsOrLoopback = (url: URL, label: string): void => {
  if (url.username || url.password) {
    throw new HttpConfigError(`${label} must not include userinfo`);
  }
  if (url.hash) throw new HttpConfigError(`${label} must not include a fragment`);
  if (url.search) throw new HttpConfigError(`${label} must not include a query string`);
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && isLoopback(url.hostname)) return;
  throw new HttpConfigError(
    `${label} must use HTTPS. HTTP is accepted only for localhost`,
  );
};

const parseUrl = (value: string, label: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpConfigError(`${label} must be an absolute URL`);
  }
  if (!url.hostname) throw new HttpConfigError(`${label} must include a host`);
  assertHttpsOrLoopback(url, label);
  return url;
};

const parsePort = (value: string | undefined): number => {
  if (value === undefined) return DEFAULT_PORT;
  if (!/^\d+$/.test(value)) {
    throw new HttpConfigError("MCP_PORT must be an integer from 1 to 65535");
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new HttpConfigError("MCP_PORT must be an integer from 1 to 65535");
  }
  return port;
};

const parseHost = (value: string | undefined): string => {
  const host = value ?? DEFAULT_HOST;
  if (host.includes("://") || host.includes("/") || /\s/.test(host)) {
    throw new HttpConfigError("MCP_HOST must be a bind address, not a URL");
  }
  return host;
};

const parseHostList = (value: string | undefined, label: string): string[] => {
  if (!value) return [];
  return splitList(value).map((entry) => {
    if (entry.includes("://") || entry.includes("/")) {
      throw new HttpConfigError(`${label} entries must be hostnames, not URLs`);
    }
    return entry.toLowerCase();
  });
};

const parseTokens = (value: string | undefined, label: string): string[] => {
  if (!value) return [];
  const tokens = splitList(value);
  for (const token of tokens) {
    if (!SCOPE_TOKEN.test(token)) {
      throw new HttpConfigError(
        `${label} contains a value that is not an OAuth token (no spaces or quotes)`,
      );
    }
  }
  return tokens;
};

const parseAudiences = (value: string): string[] => {
  const audiences = splitList(value);
  if (audiences.length === 0) {
    throw new HttpConfigError("MCP_AUTH_AUDIENCE must list at least one audience");
  }
  for (const audience of audiences) {
    if (audience.length > 512 || /[\s"]/.test(audience)) {
      throw new HttpConfigError("MCP_AUTH_AUDIENCE contains an invalid audience");
    }
  }
  return audiences;
};

const mcpPathFrom = (resourceUrl: URL | undefined): string => {
  if (!resourceUrl) return DEFAULT_MCP_PATH;
  const path = resourceUrl.pathname;
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if (normalized === "/healthz" || normalized.startsWith("/.well-known/")) {
    throw new HttpConfigError(
      "MCP_RESOURCE_URL path uses a reserved route (/healthz or /.well-known/)",
    );
  }
  return normalized;
};

/** Resource identifier without a trailing slash (RFC 8707 / MCP canonical URI). */
export const canonicalResource = (url: URL): string => {
  const path =
    url.pathname.length > 1 && url.pathname.endsWith("/")
      ? url.pathname.slice(0, -1)
      : url.pathname;
  if (path === "/") return url.origin;
  return `${url.origin}${path}`;
};

export const protectedResourceMetadataUrl = (resourceUrl: URL): string => {
  const url = new URL(resourceUrl.origin);
  url.pathname = "/.well-known/oauth-protected-resource";
  return url.href;
};

const localhostHosts = (): string[] => ["localhost", "127.0.0.1", "[::1]"];

export const resolveTransport = (env: NodeJS.ProcessEnv): TransportMode => {
  const raw = env.MCP_TRANSPORT?.trim().toLowerCase() ?? "";
  if (raw === "" || raw === "stdio") return "stdio";
  if (raw === "http") return "http";
  throw new HttpConfigError(
    `MCP_TRANSPORT must be "stdio" or "http" (received ${JSON.stringify(env.MCP_TRANSPORT)})`,
  );
};

/**
 * Resolve HTTP server settings. Call this only after selecting HTTP mode.
 * Refuses to enable HTTP without a complete OIDC resource-server configuration
 * unless MCP_AUTH_INSECURE_DEV is explicitly true.
 */
export const resolveHttpConfig = (env: NodeJS.ProcessEnv): HttpServerSettings => {
  const host = parseHost(read(env, "MCP_HOST"));
  const port = parsePort(read(env, "MCP_PORT"));
  const insecure = readFlag(env, "MCP_AUTH_INSECURE_DEV");
  const issuer = read(env, "MCP_AUTH_ISSUER");
  const audience = read(env, "MCP_AUTH_AUDIENCE");
  const resource = read(env, "MCP_RESOURCE_URL");
  const jwksUri = read(env, "MCP_AUTH_JWKS_URI");
  const requiredScopes = parseTokens(
    read(env, "MCP_AUTH_REQUIRED_SCOPES"),
    "MCP_AUTH_REQUIRED_SCOPES",
  );
  const requiredRoles = parseTokens(
    read(env, "MCP_AUTH_REQUIRED_ROLES"),
    "MCP_AUTH_REQUIRED_ROLES",
  );
  const extraHosts = parseHostList(read(env, "MCP_ALLOWED_HOSTS"), "MCP_ALLOWED_HOSTS");
  const extraOrigins = parseHostList(
    read(env, "MCP_ALLOWED_ORIGINS"),
    "MCP_ALLOWED_ORIGINS",
  );

  const authConfigured = Boolean(
    issuer || audience || jwksUri || requiredScopes.length || requiredRoles.length,
  );
  if (insecure && authConfigured) {
    throw new HttpConfigError(
      "MCP_AUTH_INSECURE_DEV cannot be combined with OIDC settings. Remove the auth variables, or unset the insecure flag and provide MCP_AUTH_ISSUER, MCP_AUTH_AUDIENCE, and MCP_RESOURCE_URL.",
    );
  }

  const resourceUrl = resource ? parseUrl(resource, "MCP_RESOURCE_URL") : undefined;
  const mcpPath = mcpPathFrom(resourceUrl);
  const resourceHost = resourceUrl?.hostname.toLowerCase();
  const allowedHosts = [
    ...new Set([
      ...localhostHosts(),
      ...(resourceHost ? [resourceHost] : []),
      ...extraHosts,
    ]),
  ];
  const allowedOrigins = [
    ...new Set([
      ...localhostHosts(),
      ...(resourceHost ? [resourceHost] : []),
      ...extraOrigins,
    ]),
  ];

  if (insecure) {
    return {
      host,
      port,
      mcpPath,
      resourceUrl,
      allowedHosts,
      allowedOrigins,
      auth: { kind: "insecure" },
    };
  }

  if (!issuer || !audience || !resourceUrl) {
    const missing = [
      issuer ? undefined : "MCP_AUTH_ISSUER",
      audience ? undefined : "MCP_AUTH_AUDIENCE",
      resourceUrl ? undefined : "MCP_RESOURCE_URL",
    ].filter((name): name is string => name !== undefined);
    throw new HttpConfigError(
      `HTTP mode requires OIDC resource-server settings (${missing.join(", ")}). The server validates bearer tokens and does not start without them. Set MCP_AUTH_INSECURE_DEV=true only for a private local process.`,
    );
  }

  parseUrl(issuer, "MCP_AUTH_ISSUER");
  const audiences = parseAudiences(audience);
  if (jwksUri) parseUrl(jwksUri, "MCP_AUTH_JWKS_URI");

  return {
    host,
    port,
    mcpPath,
    resourceUrl,
    allowedHosts,
    allowedOrigins,
    auth: {
      kind: "oidc",
      // Preserve the configured issuer exactly, including a trailing slash.
      // Auth0 publishes `iss` with one; Entra v2 does not.
      issuer,
      audiences,
      requiredScopes,
      requiredRoles,
      ...(jwksUri ? { jwksUri } : {}),
      resourceMetadataUrl: protectedResourceMetadataUrl(resourceUrl),
    },
  };
};
