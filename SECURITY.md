# Security Policy

## Supported versions

Security fixes are provided for the latest major release only.

## Reporting a vulnerability

Do not open a public issue with exploit details, personal identifiers, credentials, access tokens, or BCRA response data. Use GitHub's private vulnerability reporting for this repository. Include the affected version, impact, reproduction steps with synthetic data, and a proposed mitigation when available.

## Security model

The default deployment is a local stdio process. It performs read-only GET requests to the fixed HTTPS origins `api.bcra.gob.ar` and `www.bcra.gob.ar`. stdio does not authenticate MCP clients. Do not expose a stdio process on a network socket.

An optional Streamable HTTP mode (`MCP_TRANSPORT=http`) is an OAuth 2.1 resource server. It validates bearer JWTs using the configured issuer's OpenID Connect discovery document and JWKS. It publishes OAuth 2.0 Protected Resource Metadata and answers failed authentication with `401` or `403` plus `WWW-Authenticate`. The process does not store a client secret and does not issue tokens. HTTP mode refuses to start until issuer, audience, and resource URL are set, unless `MCP_AUTH_INSECURE_DEV=true`. That flag disables authentication and must not be used on a reachable network.

Terminate TLS at a reverse proxy. The HTTP listener validates `Host` and a present `Origin`. Per-process BCRA rate limits are not a cluster-wide limiter. Do not log `Authorization` headers, raw tokens, CUIT/CUIL/CDI values, or financial responses.

Never include real CUIT/CUIL/CDI values, access tokens, or financial responses in bug reports, tests, or logs.
