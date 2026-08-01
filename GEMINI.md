# MCP BCRA — Project Context

Servidor MCP TypeScript/Bun de solo lectura para APIs públicas del BCRA. Usa `@modelcontextprotocol/server` v2, Zod 4 y Vitest.

## Arquitectura obligatoria

- Cada dominio tiene `schemas.ts`, `api.ts` y `tools.ts`.
- `api.ts` no conoce MCP; consume `BcraHttpClient` y valida la respuesta upstream.
- `tools.ts` usa `registerMcpTool`, declara input/output schemas y propaga `context.mcpReq.signal`.
- `src/shared/http` es la única implementación HTTP.
- `src/tools/registerAllTools.ts` crea un cliente compartido y registra todos los dominios.
- No usar `any`, desactivar TLS ni aceptar URLs arbitrarias.
- Todo error de integración usa `DomainApiError`.

## Comandos

```bash
bun install
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
bun run pack:check
```

Antes de release use `bun run release:check`. El smoke real, público y sin identificadores personales es `bun run smoke:live`.

## MCP v2

- Importar servidor desde `@modelcontextprotocol/server`.
- El binario stdio debe usar `serveStdio(() => createServer())`, no conexión directa, para negociar MCP 2026 y legado.
- Toda tool debe tener título, descripción, input schema, output schema y annotations.
- Éxitos: texto compatible y `structuredContent`.
- Fallas funcionales: `isError: true`, sin detalles sensibles.
- Cancelación: `context.mcpReq.signal` hasta el cliente HTTP.

## Testing mínimo

- HTTP: URL/origen, redirects, HTTP error, timeout, cancelación, JSON inválido, body vacío/grande, retry, rate/concurrencia/cola.
- API: path/query y schema upstream.
- MCP: negociación real, lista de tools, metadatos, respuesta estructurada, error e input inválido.
- stdio: MCP moderno y legado contra `dist/index.js`.
