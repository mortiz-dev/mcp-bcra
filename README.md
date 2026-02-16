# MCP BCRA

Servidor Model Context Protocol (MCP) para consumir APIs del Banco Central de la Republica Argentina (BCRA).

## Stack

- Bun (runtime/package manager recomendado)
- TypeScript
- `@modelcontextprotocol/sdk`
- `zod`
- Vitest

## Herramientas MCP

- `get-bcra-client-central-deudores`
- `get-bcra-client-central-deudores-historical`
- `get-bcra-client-cheques-rechazados`
- `get-bcra-entities`
- `get-bcra-variables`
- `get-bcra-var-hist`

## Requisitos

- Bun `>= 1.3`
- Node.js `>= 18` (fallback)

## Instalacion

```bash
bun install
```

## Scripts

```bash
bun run build
bun run test
bun run dev
bun run start
```

## Arquitectura modular

- `src/shared/http`: cliente HTTP BCRA y errores tipados.
- `src/shared/mcp`: formato de respuesta MCP.
- `src/shared/validation`: validadores zod reutilizables.
- `src/domains/centralDeudores`: schemas, API y tools del dominio.
- `src/domains/cheques`: schemas, API y tools del dominio.
- `src/domains/estadisticas`: schemas, API y tools del dominio.
- `src/tools/registerAllTools.ts`: orquestador de registro.

## Seguridad y robustez

- Sin bypass de TLS.
- Timeout configurable por `BCRA_HTTP_TIMEOUT_MS` (default `15000`).
- Manejo tipado de errores (`HTTP_ERROR`, `TIMEOUT`, `NETWORK_ERROR`, `UPSTREAM_INVALID_JSON`, `UPSTREAM_EMPTY_BODY`).
- Respuesta MCP homogenea con `ok`, `data` o `error`.

## Breaking change: Estadisticas v4

En esta version se reemplazo la integracion de Estadisticas por `v4.0`.

Cambios:

1. `get-bcra-var-hist` ahora usa `idVariable` (en lugar de `IdVariable`).
2. `desde` y `hasta` son opcionales y usan formato `YYYY-MM-DD`.
3. Los endpoints internos de Estadisticas apuntan a `/estadisticas/v4.0/Monetarias`.

## Desarrollo

Convencion para nueva tool:

1. Agregar `schemas.ts` en el dominio.
2. Agregar llamada en `api.ts` del dominio.
3. Registrar en `tools.ts` del dominio.
4. Incluir test de exito y de falla.

## Licencia

ISC
