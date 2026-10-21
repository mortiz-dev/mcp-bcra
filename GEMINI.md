# MCP BCRA — Project Context

Read-only TypeScript/Bun MCP server for public BCRA APIs. It uses `@modelcontextprotocol/server` v2, Zod 4, and Vitest.

## Required architecture

- Each domain has `schemas.ts`, `api.ts`, and `tools.ts`.
- `api.ts` does not know about MCP. It uses `BcraHttpClient` and validates the upstream response.
- `tools.ts` uses `registerMcpTool`, declares input and output schemas, and forwards `context.mcpReq.signal`.
- `src/shared/http` is the only BCRA HTTP implementation.
- `src/tools/registerAllTools.ts` creates one shared client and registers every domain.
- `src/http` is optional Streamable HTTP with OIDC bearer validation. stdio does not import it.
- Do not use `any`, disable TLS, or accept arbitrary URLs.
- Every integration error uses `DomainApiError`.

## Commands

```bash
bun install
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
bun run pack:check
```

Before a release, use `bun run release:check`. The live public smoke, with no personal identifiers, is `bun run smoke:live`.

## MCP v2

- Import the server from `@modelcontextprotocol/server`.
- The stdio binary must use `serveStdio(() => createServer())`, not a direct connection, so it can negotiate MCP 2026 and the legacy era.
- Every tool needs a title, description, input schema, output schema, and annotations.
- Success: compatible text plus `structuredContent`.
- Functional failures: `isError: true`, with no sensitive details.
- Cancellation: `context.mcpReq.signal` down to the HTTP client.
- HTTP mode is opt-in via `MCP_TRANSPORT=http` and must refuse to listen without OIDC settings unless `MCP_AUTH_INSECURE_DEV=true`.

## Minimum tests

- HTTP client: URL and origin, redirects, HTTP error, timeout, cancellation, invalid JSON, empty or large body, retry, rate, concurrency, and queue.
- API: path, query, and upstream schema.
- MCP: real negotiation, tool list, metadata, structured response, error, and invalid input.
- stdio: modern and legacy MCP against `dist/index.js`.
- Auth: local JWKS cases for a valid token, expiry, audience, issuer, and missing scope.
