# MCP BCRA

Servidor Model Context Protocol de solo lectura para consultar APIs públicas del Banco Central de la República Argentina (BCRA).

La versión 2 implementa MCP `2026-07-28` mediante `@modelcontextprotocol/server` v2 y mantiene compatibilidad stdio con clientes MCP de la era 2025. Todas las tools publican schemas de entrada y salida, metadatos de seguridad y respuestas estructuradas.

## Requisitos

- Node.js 22 o 24 LTS.
- Bun 1.3.11 para desarrollo y gestión del lockfile.

## Instalación y ejecución

Desde el checkout:

```bash
bun install
bun run build
node dist/index.js
```

Una vez publicado en npm, el binario se podrá ejecutar con:

```bash
npx mcp-bcra
```

El servidor usa stdio. `stdout` queda reservado para el protocolo MCP; los errores operativos se escriben en `stderr`.

### Claude Desktop

```json
{
  "mcpServers": {
    "bcra": {
      "command": "node",
      "args": ["/RUTA/ABSOLUTA/mcp-bcra/dist/index.js"]
    }
  }
}
```

También puede usarse `bun` como comando. Siempre use rutas absolutas en clientes de escritorio.

## Herramientas

Todas aceptan `idioma` opcional (`es-AR` o `en-US`). La disponibilidad efectiva de traducciones depende de cada API del BCRA.

| Tool | Parámetros específicos |
|---|---|
| `get-bcra-client-central-deudores` | `clientId`: CUIT, CUIL o CDI de 11 dígitos |
| `get-bcra-client-central-deudores-historical` | `clientId`: CUIT, CUIL o CDI de 11 dígitos |
| `get-bcra-client-cheques-rechazados` | `clientId`: CUIT, CUIL o CDI de 11 dígitos |
| `get-bcra-entities` | Sin parámetros específicos |
| `get-bcra-cheque-denunciado` | `codigoEntidad`, `numeroCheque` numérico de hasta 19 caracteres |
| `get-bcra-variables` | `idVariable`, `categoria`, `tipoSerie`, `periodicidad`, `unidadExpresion`, `limit`, `offset` opcionales |
| `get-bcra-var-hist` | `idVariable`; `desde`, `hasta`, `limit` (máximo 3000), `offset` opcionales |
| `get-bcra-metodologia` | `idVariable`, `limit`, `offset` opcionales |
| `get-bcra-fx-currencies` | Sin parámetros específicos |
| `get-bcra-fx-quotes` | `fecha` opcional |
| `get-bcra-fx-quote-by-currency` | `codMoneda`; `fechadesde`, `fechahasta`, `limit` (10–1000), `offset` opcionales |
| `get-bcra-transparencia-producto` | `producto`; `codigoEntidad` opcional |

Las fechas usan `YYYY-MM-DD`, deben existir en el calendario y el final no puede ser anterior al inicio. Los números son JSON numbers estrictos: no se convierten strings ni booleanos.

Productos válidos de Transparencia:

- `cajasAhorros`
- `paquetes`
- `plazosFijos`
- `prestamosPrendarios`
- `prestamosHipotecarios`
- `prestamosPersonales`
- `tarjetas`

Si `codigoEntidad` se omite, Transparencia consulta todas las entidades disponibles.

## Contrato de respuesta

Un resultado exitoso mantiene texto JSON para clientes anteriores y agrega `structuredContent` validado:

```json
{
  "ok": true,
  "data": {
    "status": 200,
    "results": []
  }
}
```

Una falla funcional se devuelve con `isError: true` y un payload acotado. Los detalles internos de la respuesta upstream no se exponen al cliente MCP.

## Seguridad y resiliencia

El único cliente HTTP compartido aplica:

- HTTPS obligatorio y origen fijo `https://api.bcra.gob.ar`.
- Rechazo de URLs absolutas, paths ambiguos, fragmentos y redirects inesperados.
- Deadline total configurable, incluyendo cola, fetch, body y backoff.
- Cancelación MCP propagada hasta `fetch` y diferenciada de timeout.
- Respuesta exitosa limitada a 2 MiB por defecto y cuerpo de error limitado a 32 KiB.
- Máximo de 4 requests concurrentes, 5 inicios por segundo y cola FIFO de 32.
- Hasta 2 reintentos adicionales solo para GET con HTTP 429, 502, 503 o 504; respeta `Retry-After` y el deadline.
- Validación Zod tanto de inputs como de la envoltura upstream `{status, metadata?, results}`.
- Tools anotadas `readOnlyHint: true` y `openWorldHint: true` porque consultan un servicio externo.

Variables operativas:

| Variable | Default | Rango aceptado |
|---|---:|---:|
| `BCRA_HTTP_TIMEOUT_MS` | 15000 | 100–60000 |
| `BCRA_HTTP_MAX_RESPONSE_BYTES` | 2097152 | 65536–10485760 |
| `BCRA_HTTP_MAX_CONCURRENCY` | 4 | 1–16 |
| `BCRA_HTTP_RATE_LIMIT_PER_SECOND` | 5 | 1–20 |

Los valores fuera de rango se ignoran y se usa el default seguro. Los límites son por proceso; varias instancias pueden compartir la misma IP y deben coordinar capacidad externamente.

Este proyecto expone únicamente stdio local. Si se agrega un transporte HTTP remoto, debe incorporarse autenticación/autorización, validación de origen/host, TLS en el borde y límites distribuidos antes de exponerlo.

## Privacidad y uso responsable

Las consultas por CUIT/CUIL/CDI pueden involucrar información financiera personal. El operador es responsable de contar con base legal, autorización y controles de acceso adecuados. No registre identificadores, respuestas personales ni argumentos completos de tools.

Los datos provienen de APIs públicas del [BCRA](https://www.bcra.gob.ar/BCRAyVos/catalogo-de-APIs-banco-central.asp), pueden sufrir demoras, cambios o indisponibilidad y deben contrastarse con la fuente oficial. Este servidor no brinda asesoramiento financiero, crediticio ni legal, y no debe tomar decisiones reguladas o adversas de manera automática.

## Migración a 2.0.0

Cambios incompatibles:

1. Requiere Node.js 22 o superior y usa los paquetes MCP v2 separados.
2. Transparencia elimina `cuentasCorrientes` y `cajasSeguridad`, corrige las rutas oficiales, agrega `plazosFijos` y hace `codigoEntidad` opcional.
3. `clientId` exige exactamente 11 dígitos; los campos numéricos ya no se convierten implícitamente.
4. Las fechas ahora se validan como fechas reales y los rangos invertidos fallan.
5. Los límites y offsets están acotados.
6. Los éxitos incorporan `structuredContent`; los errores se marcan con `isError: true`.
7. Se agrega `get-bcra-metodologia` y filtros completos de Estadísticas v4.
8. El entrypoint importable pasa a `dist/server.js`; `dist/index.js` queda como binario stdio.

Un cliente que solo consumía el bloque de texto puede seguir parseando `{ok,data}`. Los clientes modernos deben preferir `structuredContent`.

## Desarrollo y release

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

`bun run smoke:live` realiza consultas públicas y no personales contra el BCRA, incluidos todos los productos de Transparencia. No forma parte del CI determinista.

Arquitectura:

- Cada dominio contiene `schemas.ts`, `api.ts` y `tools.ts`.
- `api.ts` solo conoce `BcraHttpClient` y valida la respuesta upstream.
- `tools.ts` declara contratos MCP, pasa cancelación y transforma resultados.
- `src/shared/http` centraliza origen, rate, retry, timeout, tamaños y errores.
- `src/shared/mcp` centraliza registro, anotaciones y respuestas.
- `src/tools/registerAllTools.ts` crea un único cliente compartido y registra las 12 tools.

Para agregar una tool, actualice schemas, API, registro, pruebas de dominio/protocolo y este README si cambia el contrato.
