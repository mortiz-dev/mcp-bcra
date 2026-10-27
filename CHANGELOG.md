# Changelog

## Unreleased

## 2.0.0 — unpublished

Not on npm yet. The 2026-07-31 MCP v2 migration is included here, together with the answer-oriented tools prepared for the first manual publish.

- Added `server.json` and `package.json` `mcpName` for the official MCP Registry. Publishing to npm and the registry stays manual.
- Added answer-oriented tools for Transparencia rate rankings, the ex-post real rate of a fixed-term deposit, and a daily macro snapshot. Existing tool contracts are unchanged.
- Rankings drop null and zero sort rates by default. Fixed-term rankings can filter the published `plazoMinimoInvertirDias` integer; that value is not a day count and is not translated. The macro snapshot reports observation age on every indicator. Policy-rate series 160 stays in place and is documented as discontinued upstream.
- Rankings drop rates outside a per-denomination plausibility interval and list them in `valoresDescartados`. The default fence is a modified z-score of 3.5 (log scale for loan CFT). When the MAD is 0, the fence falls back to Tukey's IQR and then to a mean-absolute-deviation scale. A rate equal to the hard floor is atypical. `incluirValoresAtipicos` puts discarded rows back with `atipico: true`.
- Rankings stay inside one denomination. The default is pesos. `denominacion` accepts `pesos`, `uva`, `dolares`, or `todas`, and `todas` returns a separate ordered list per denomination. Loan rows with a missing denomination stay out of those buckets. Fixed-term rows with a missing denomination are classified from the product name (UVA, then dollar keywords, otherwise pesos), marked `denominacionInferida`, and keep the product name. A published denomination always wins. Credit cards publish no denomination and stay an implicit peso ranking.
- Documented one-command `npx` setup for Claude Desktop, Cursor and VS Code.
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
