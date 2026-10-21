# MCP BCRA

Read-only Model Context Protocol server for the public APIs of the Banco Central de la República Argentina (BCRA).

Version 2 implements MCP `2026-07-28` with `@modelcontextprotocol/server` v2 and keeps stdio compatibility with MCP clients from the 2025 era. Every tool publishes input and output schemas, security metadata, and structured responses.

Local stdio is the default and does not use authentication. An optional Streamable HTTP mode adds an OAuth 2.1 resource server for a shared deployment. See [HTTP server mode](#http-server-mode) and [docs/http-server.md](docs/http-server.md).

## Requirements

- Node.js 22 or 24 LTS.
- Bun 1.3.11 for development and the lockfile.

## Install and run

From a checkout:

```bash
bun install
bun run build
node dist/index.js
```

Once the package is on npm:

```bash
npx mcp-bcra
```

The default transport is stdio. `stdout` is reserved for MCP. Operational errors go to `stderr`. No `MCP_*` variable is required, and setting them does not change stdio.

### Claude Desktop

```json
{
  "mcpServers": {
    "bcra": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/mcp-bcra/dist/index.js"]
    }
  }
}
```

`bun` works as the command as well. Desktop clients need absolute paths.

## Tools

Every tool accepts an optional `idioma` (`es-AR` or `en-US`). Whether a translation is available depends on each BCRA API.

| Tool | Specific parameters |
|---|---|
| `get-bcra-client-central-deudores` | `clientId`: 11-digit CUIT, CUIL, or CDI |
| `get-bcra-client-central-deudores-historical` | `clientId`: 11-digit CUIT, CUIL, or CDI |
| `get-bcra-client-cheques-rechazados` | `clientId`: 11-digit CUIT, CUIL, or CDI |
| `get-bcra-entities` | No specific parameters |
| `get-bcra-cheque-denunciado` | `codigoEntidad`, numeric `numeroCheque` of up to 19 characters |
| `get-bcra-variables` | Optional `idVariable`, `categoria`, `tipoSerie`, `periodicidad`, `unidadExpresion`, `limit`, `offset` |
| `get-bcra-var-hist` | `idVariable`; optional `desde`, `hasta`, `limit` (maximum 3000), `offset` |
| `get-bcra-metodologia` | Optional `idVariable`, `limit`, `offset` |
| `get-bcra-series-excel-catalog` | Optional `idVariable`, `buscar`, `limit` (1–100, default 50), `offset` |
| `get-bcra-fx-currencies` | No specific parameters |
| `get-bcra-fx-quotes` | Optional `fecha` |
| `get-bcra-fx-quote-by-currency` | `codMoneda`; optional `fechadesde`, `fechahasta`, `limit` (10–1000), `offset` |
| `get-bcra-transparencia-producto` | `producto`; optional `codigoEntidad` |

Dates use `YYYY-MM-DD`, must be real calendar dates, and the end cannot be before the start. Numbers are strict JSON numbers: strings and booleans are not coerced.

Valid Transparencia products:

- `cajasAhorros`
- `paquetes`
- `plazosFijos`
- `prestamosPrendarios`
- `prestamosHipotecarios`
- `prestamosPersonales`
- `tarjetas`

If `codigoEntidad` is omitted, Transparencia queries every available entity.

### Excel series catalog

`get-bcra-series-excel-catalog` reads the [official XLSX variable list, Series.xlsm](https://www.bcra.gob.ar/datos-monetarios-diarios/). It returns the API identifier, description, series type, periodicity, unit, and currency, plus `sourceUrl`, `sourcePage`, `format`, `total`, and `results`. `buscar` filters the description without case sensitivity. `idVariable` selects an exact identifier. Pagination is applied after filtering. The spreadsheet is a **catalog**. It does not contain historical observations. Use `get-bcra-var-hist` with the `idVariable` you found.

The file is downloaded on each call from a fixed path on `www.bcra.gob.ar`. The response size is limited, and an unexpected column layout fails with `UPSTREAM_SCHEMA_MISMATCH`. The sheet is in Spanish. `idioma` is only an HTTP preference and does not translate cells. This integration accepts XLSX. Historical `.xls` files and `.xlsm` workbooks published by the BCRA need a per-document adapter and validation before their data can be exposed.

## Response contract

A success keeps a JSON text block for older clients and adds validated `structuredContent`:

```json
{
  "ok": true,
  "data": {
    "status": 200,
    "results": []
  }
}
```

A functional failure is returned with `isError: true` and a bounded payload. Internal upstream response details are not sent to the MCP client.

## Security and resilience

The single shared HTTP client applies:

- HTTPS only, and fixed origins `https://api.bcra.gob.ar` for JSON and `https://www.bcra.gob.ar` for the XLSX catalog.
- Rejection of absolute URLs, ambiguous paths, fragments, and unexpected redirects.
- A configurable total deadline, including queue, fetch, body, and backoff.
- MCP cancellation propagated to `fetch`, distinct from a timeout.
- Successful responses limited to 2 MiB by default, and error bodies limited to 32 KiB.
- At most 4 concurrent requests, 5 starts per second, and a FIFO queue of 32.
- Up to 2 extra retries only for GET with HTTP 429, 502, 503, or 504. `Retry-After` and the deadline are honored.
- Zod validation of inputs and of the upstream envelope `{status, metadata?, results}`.
- Tools annotated `readOnlyHint: true` and `openWorldHint: true` because they call an external service.

Operational variables:

| Variable | Default | Accepted range |
|---|---:|---:|
| `BCRA_HTTP_TIMEOUT_MS` | 15000 | 100–60000 |
| `BCRA_HTTP_MAX_RESPONSE_BYTES` | 2097152 | 65536–10485760 |
| `BCRA_HTTP_MAX_CONCURRENCY` | 4 | 1–16 |
| `BCRA_HTTP_RATE_LIMIT_PER_SECOND` | 5 | 1–20 |

Values outside the range are ignored and the safe default is used. Limits are per process. Several instances can share one egress IP and must coordinate capacity outside this process.

## HTTP server mode

Set `MCP_TRANSPORT=http` to serve MCP on Streamable HTTP. The process is then an OAuth 2.1 resource server: it validates bearer JWTs against an OIDC issuer and publishes [Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728) at `/.well-known/oauth-protected-resource`. That document's `authorization_servers` value is the configured issuer. Failed authentication returns `401` or `403` with a `WWW-Authenticate: Bearer` challenge that includes `resource_metadata`.

The server does not issue tokens and does not need a client secret. It only validates them. HTTP mode exits on startup unless `MCP_AUTH_ISSUER`, `MCP_AUTH_AUDIENCE`, and `MCP_RESOURCE_URL` are all set. `MCP_AUTH_INSECURE_DEV=true` is the explicit local exception and must not be reachable from a network.

| Variable | Role |
|---|---|
| `MCP_TRANSPORT` | `stdio` (default) or `http` |
| `MCP_HOST` / `MCP_PORT` | Bind address and port. Defaults: `127.0.0.1` and `8080` |
| `MCP_RESOURCE_URL` | Public MCP URL. Its path is the local path, usually `https://mcp.example.com/mcp` |
| `MCP_AUTH_ISSUER` | OIDC issuer. Must match token `iss` exactly |
| `MCP_AUTH_AUDIENCE` | Expected `aud`. Comma-separated to accept more than one |
| `MCP_AUTH_REQUIRED_SCOPES` | Optional scopes (`scope` or Entra `scp`) |
| `MCP_AUTH_REQUIRED_ROLES` | Optional `roles` claim values |
| `MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS` | Extra hostnames for `Host` and browser `Origin` checks |
| `MCP_AUTH_INSECURE_DEV` | `true` disables authentication. Cannot be combined with OIDC variables |

Terminate TLS at a reverse proxy, forward the original `Host`, and do not log `Authorization`. `GET /healthz` is unauthenticated and returns `{"status":"ok"}`. Step-by-step identity-provider setup, including the container, is in [docs/http-server.md](docs/http-server.md).

### Microsoft Entra ID

Use two app registrations in the company tenant.

1. **API registration (this server).** Expose an API. Set the Application ID URI to `api://<api-application-client-id>` and add a scope such as `mcp.access`. In the manifest, set `accessTokenAcceptedVersion` to `2` so tokens are v2. Point the server at issuer `https://login.microsoftonline.com/<tenant-id>/v2.0` and set `MCP_AUTH_AUDIENCE` to that client id or to the Application ID URI, matching the token `aud` claim. v1 tokens (`https://sts.windows.net/<tenant-id>/`) do not match the v2 issuer.
2. **MCP client registration** (or the client's own registration). Grant it permission to request that scope. The client keeps any secret or certificate it needs. The MCP server never receives a client secret. It only validates tokens.

Delegated Entra tokens carry the scope in `scp`. Set `MCP_AUTH_REQUIRED_SCOPES=mcp.access`. Application-only tokens usually carry app roles in `roles` instead. Use `MCP_AUTH_REQUIRED_ROLES` for that flow.

### Okta and Auth0

Okta: set `MCP_AUTH_ISSUER` to the authorization-server issuer (`https://<org>.okta.com/oauth2/default` or a custom authorization server) and `MCP_AUTH_AUDIENCE` to that server's audience. Add a custom scope and require it. The server does not need an Okta client secret.

Auth0: set `MCP_AUTH_ISSUER` to `https://<tenant>.auth0.com/` with the trailing slash Auth0 puts on `iss`. Set `MCP_AUTH_AUDIENCE` to the API identifier and require one of its permissions. The server does not need an Auth0 client secret.

### Container

The repository `Dockerfile` builds a Node 22 image. It does not enable insecure mode.

```bash
docker build -t mcp-bcra .
docker run --rm -p 8080:8080 \
  -e MCP_TRANSPORT=http \
  -e MCP_HOST=0.0.0.0 \
  -e MCP_RESOURCE_URL=https://mcp.example.com/mcp \
  -e MCP_AUTH_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0 \
  -e MCP_AUTH_AUDIENCE=api://<api-application-client-id> \
  -e MCP_AUTH_REQUIRED_SCOPES=mcp.access \
  -e MCP_ALLOWED_HOSTS=mcp.example.com \
  mcp-bcra
```

`compose.yaml` is a minimal Compose file with the same variables. Replace the placeholder issuer, audience, and host.

## Privacy and responsible use

Queries by CUIT, CUIL, or CDI can involve personal financial information. The operator is responsible for a lawful basis, authorization, and access control. Do not log identifiers, personal responses, or full tool arguments.

Data comes from the public [BCRA API catalog](https://www.bcra.gob.ar/BCRAyVos/catalogo-de-APIs-banco-central.asp). It can be delayed, changed, or unavailable, and it should be checked against the official source. This server does not give financial, credit, or legal advice, and it must not make regulated or adverse decisions automatically.

## Migration to 2.0.0

Breaking changes:

1. Requires Node.js 22 or newer and the split MCP v2 packages.
2. Transparencia removes `cuentasCorrientes` and `cajasSeguridad`, corrects the official routes, adds `plazosFijos`, and makes `codigoEntidad` optional.
3. `clientId` must be exactly 11 digits. Numeric fields are no longer coerced.
4. Dates are validated as real dates, and inverted ranges fail.
5. Limits and offsets are bounded.
6. Successes include `structuredContent`. Errors are marked `isError: true`.
7. Adds `get-bcra-metodologia` and the full Estadísticas v4 filters.
8. The importable entrypoint is `dist/server.js`. `dist/index.js` is the stdio binary.

A client that only parsed the text block can keep parsing `{ok,data}`. Newer clients should prefer `structuredContent`.

HTTP mode does not change tool contracts or the stdio entrypoint. Leave `MCP_TRANSPORT` unset to keep the previous local behavior.

## Development and release

```bash
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run test:coverage
bun run build
bun run pack:check
bun run audit
bun run release:check
```

`bun run smoke:live` runs public, non-personal queries against the BCRA, including every Transparencia product. It is not part of deterministic CI.

Recommended later work: read series that the BCRA publishes only as XLS, starting with the [daily and monthly UVA loans](https://www.bcra.gob.ar/prestamos-y-otros-activos-de-las-entidades-financieras/), with an explicit schema, unit, period, and source per observation. Also compare the XLSX catalog with Estadísticas v4 periodically to detect discontinued ids or metadata changes.

Architecture:

- Each domain has `schemas.ts`, `api.ts`, and `tools.ts`.
- `api.ts` only knows `BcraHttpClient` and validates the upstream response.
- `tools.ts` declares MCP contracts, forwards cancellation, and maps results.
- `src/shared/http` centralizes origin, rate, retry, timeout, sizes, and errors.
- `src/shared/mcp` centralizes registration, annotations, and responses.
- `src/tools/registerAllTools.ts` creates one shared client and registers the 13 tools.
- `src/http` is the optional Streamable HTTP resource server. stdio does not load it.

To add a tool, update the schemas, API, registration, domain and protocol tests, and this README when the contract changes.

## Migration: Excel catalog

`get-bcra-series-excel-catalog` is added without changing the existing tools. Clients that show a fixed list should include the new tool. Its result uses a catalog contract, not the `{status, results}` envelope of the JSON APIs. Its `idVariable` can be passed to `get-bcra-var-hist`. A custom `BcraHttpClient` must implement `getDocument` to use this tool. `getJson` is still enough for the earlier tools.
