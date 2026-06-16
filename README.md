# MCP BCRA

Servidor Model Context Protocol (MCP) para consumir APIs del Banco Central de la Republica Argentina (BCRA).

## Stack

- Bun (runtime/package manager recomendado)
- TypeScript
- `@modelcontextprotocol/sdk`
- `zod`
- Vitest

## Herramientas MCP

### Central de Deudores

- `get-bcra-client-central-deudores`
- `get-bcra-client-central-deudores-historical`
- `get-bcra-client-cheques-rechazados`

### Cheques

- `get-bcra-entities`
- `get-bcra-cheque-denunciado`

### Estadisticas

- `get-bcra-variables`
- `get-bcra-var-hist`

### Estadisticas Cambiarias

- `get-bcra-fx-currencies`
- `get-bcra-fx-quotes`
- `get-bcra-fx-quote-by-currency`

### Transparencia

- `get-bcra-transparencia-producto`

## Parametros principales

- `get-bcra-client-central-deudores`: `clientId`.
- `get-bcra-client-central-deudores-historical`: `clientId`.
- `get-bcra-client-cheques-rechazados`: `clientId`.
- `get-bcra-entities`: sin parametros.
- `get-bcra-cheque-denunciado`: `codigoEntidad`, `numeroCheque`.
- `get-bcra-variables`: `limit`, `offset` opcionales.
- `get-bcra-var-hist`: `idVariable`; `desde`, `hasta`, `limit`, `offset` opcionales.
- `get-bcra-fx-currencies`: sin parametros.
- `get-bcra-fx-quotes`: `fecha` opcional.
- `get-bcra-fx-quote-by-currency`: `codMoneda`; `fechadesde`, `fechahasta`, `limit`, `offset` opcionales. Cuando se informa `limit`, debe estar entre 11 y 999.
- `get-bcra-transparencia-producto`: `producto`, `codigoEntidad`.

Valores validos de `producto` para Transparencia:

- `cajasAhorros`
- `cuentasCorrientes`
- `prestamosPersonales`
- `prestamosHipotecarios`
- `prestamosPrendarios`
- `tarjetas`
- `cajasSeguridad`
- `paquetes`

## Requisitos

- Bun `>= 1.3`
- Node.js `>= 18` (fallback)

## Instalacion

```bash
bun install
bun run build
```

## Configuración en Clientes MCP

### Claude Desktop

Para usar este servidor en Claude Desktop, edita tu archivo de configuración:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Añade la siguiente configuración (asegúrate de usar la **ruta absoluta** a tu proyecto):

```json
{
  "mcpServers": {
    "bcra": {
      "command": "/RUTA/A/BUN",
      "args": ["/RUTA/ABSOLUTA/A/ESTE/PROYECTO/dist/index.js"]
    }
  }
}
```

> **Nota:** Se recomienda usar la ruta absoluta del ejecutable `bun` (puedes encontrarla ejecutando `which bun` en tu terminal) y la ruta absoluta al archivo `dist/index.js` de este proyecto para evitar errores de "No such file or directory" en Claude Desktop.

### Cursor

1. Ve a **Settings > Cursor Settings > MCP**.
2. Haz clic en **+ Add New MCP Server**.
3. Configura:
   - **Name:** BCRA
   - **Type:** `command`
   - **Command:** `bun run /RUTA/ABSOLUTA/A/ESTE/PROYECTO/dist/index.js`
4. Reinicia Cursor.

### MCP Inspector (Depuración)

Para probar las herramientas sin un cliente completo:

```bash
bunx @modelcontextprotocol/inspector bun dist/index.js
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
- `src/domains/estadisticasCambiarias`: schemas, API y tools del dominio.
- `src/domains/transparencia`: schemas, API y tools del dominio.
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

## Migracion: paginacion y cheques

- `get-bcra-variables` y `get-bcra-var-hist` ahora aceptan `limit` y `offset` opcionales. Esto permite recorrer resultados cuando la API del BCRA pagina respuestas.
- `get-bcra-client-cheques-rechazados` se mantiene para consultar cheques rechazados por identificacion dentro de Central de Deudores.
- `get-bcra-cheque-denunciado` consulta la API oficial de Cheques Denunciados por `codigoEntidad` y `numeroCheque`.

## Desarrollo

Convencion para nueva tool:

1. Agregar `schemas.ts` en el dominio.
2. Agregar llamada en `api.ts` del dominio.
3. Registrar en `tools.ts` del dominio.
4. Incluir test de exito y de falla.
