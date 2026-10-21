# AGENTS.md

Guide for agents and contributors in this repository.

## Goal

Keep the BCRA MCP server modular, safe, and easy to extend.

## Standard flow

1. `bun install`
2. `bun run build`
3. `bun run test`
4. Small changes and continuous validation

## Architecture

- Each domain has `schemas.ts`, `api.ts`, and `tools.ts`.
- `api.ts` does not know about MCP. It only uses `BcraHttpClient`.
- `tools.ts` validates input and maps output to MCP.
- The central registry is `src/tools/registerAllTools.ts`.
- Every new tool goes through the shared layer (errors, response, and common validation).
- stdio is the default process in `src/index.ts`. Optional Streamable HTTP and OIDC resource-server auth live in `src/http` and must not change stdio behavior.
- Do not put secrets in source. HTTP auth is environment-only.

## Technical rules

- Do not disable TLS.
- Do not use `any` in domain or infrastructure code.
- Do not duplicate HTTP logic across domains.
- Keep integration errors typed with `DomainApiError`.

## Minimum tests

- Shared HTTP layer: success, HTTP error, timeout, and invalid JSON.
- Domain API layer: path and query construction.
- Domain tools layer: success and error mapped to an MCP response.
- Global registry: the registered tools are present.
- HTTP mode: JWT validation against a local JWKS, and stdio remains the default.

## Documentation

If a tool's parameters or contract change, update `README.md` with a migration section. HTTP auth changes belong in `README.md` and `docs/http-server.md`.
