# AGENTS.md

Guia para agentes y colaboradores en este repositorio.

## Objetivo

Mantener un servidor MCP del BCRA modular, seguro y facil de extender.

## Flujo estandar

1. `bun install`
2. `bun run build`
3. `bun run test`
4. Cambios pequenos + validacion continua

## Convenciones de arquitectura

- Cada dominio debe tener `schemas.ts`, `api.ts` y `tools.ts`.
- `api.ts` nunca conoce MCP; solo consume `BcraHttpClient`.
- `tools.ts` valida input y transforma salida a formato MCP.
- El registro central vive en `src/tools/registerAllTools.ts`.
- Toda nueva tool debe pasar por capa shared (errores, respuesta y validacion comun).

## Reglas tecnicas

- No deshabilitar TLS.
- No usar `any` en codigo de dominio/infraestructura.
- No duplicar logica HTTP entre dominios.
- Mantener errores tipados con `DomainApiError`.

## Testing minimo

- Capa shared HTTP: success + error HTTP + timeout + JSON invalido.
- Capa dominio API: construccion de path/query.
- Capa dominio tools: mapping success/error a respuesta MCP.
- Registro global: verificacion de tools registradas.

## Documentacion

Si cambian parametros o contratos de una tool, actualizar `README.md` con seccion de migracion.
