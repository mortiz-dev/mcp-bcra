# Changelog

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
