# Changelog

## Unreleased

- Added an opt-in Streamable HTTP transport (`MCP_TRANSPORT=http`) that acts as an OAuth 2.1 resource server: OIDC JWT validation (issuer, audience, expiry, signature, optional scopes and roles), Protected Resource Metadata at `/.well-known/oauth-protected-resource`, and `401`/`403` `WWW-Authenticate` challenges.
- HTTP mode refuses to start without issuer, audience, and resource URL unless `MCP_AUTH_INSECURE_DEV=true`.
- stdio stays the default and does not require authentication.
- Documented Microsoft Entra ID, Okta, and Auth0 setup, and added a Dockerfile plus a Compose example.
- Cross-origin HTTP responses expose `WWW-Authenticate`, `Mcp-Session-Id`, and `MCP-Protocol-Version` to browser clients.
- A client disconnect aborts the in-flight HTTP request so upstream BCRA calls stop.

## 2.0.0 — 2026-07-31

- Migrated to MCP SDK v2 with modern `2026-07-28` negotiation and legacy stdio compatibility.
- Added titles, descriptions, output schemas, structured content and read-only/open-world annotations to every tool.
- Propagated MCP cancellation to all BCRA requests and marked tool failures with `isError`.
- Corrected all Transparencia routes, removed unsupported products, added `plazosFijos` and made entity filtering optional.
- Added Statistics v4 methodology and complete variable filters.
- Added strict CUIT/CUIL/CDI, cheque, entity, currency, date, range and pagination validation.
- Hardened the shared HTTP client against origin escape, redirects, oversized responses, overload and unbounded retry.
- Added bounded concurrency/rate control, deadline-aware retries and `Retry-After` support.
- Added upstream response validation, real MCP protocol tests, modern/legacy stdio E2E, coverage, lint, package verification and CI.
- Fixed package exports, executable entrypoint, declarations, license and release metadata.

See the migration section in `README.md` for breaking changes.
