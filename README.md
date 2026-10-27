# MCP BCRA

[![CI](https://github.com/mortiz-dev/mcp-bcra/actions/workflows/ci.yml/badge.svg)](https://github.com/mortiz-dev/mcp-bcra/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-bcra)](https://www.npmjs.com/package/mcp-bcra)
[![license](https://img.shields.io/github/license/mortiz-dev/mcp-bcra)](./LICENSE)

**English:** Read-only MCP server for Argentina's central bank. Compare peso, UVA and dollar deposit and loan rates, see whether a plazo fijo beat CER inflation, and read today's official dollar, reserves and monetary base.

**Español:** Servidor MCP de solo lectura del BCRA. Compará tasas de plazos fijos y préstamos en pesos, UVA o dólares, mirá si un plazo fijo le ganó a la inflación del CER, y consultá el dólar oficial, las reservas y la base monetaria de hoy.

Node.js 22 or later. The server speaks stdio. `stdout` is reserved for MCP; operational errors go to `stderr`. Nothing here is financial advice, and the package is not published until the owner runs the manual steps at the end of this file.

## Install

One command, after `npm publish`. Until then, use a local checkout (`bun install && bun run build` and `node dist/index.js`).

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bcra": {
      "command": "npx",
      "args": ["-y", "mcp-bcra"]
    }
  }
}
```

### Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "bcra": {
      "command": "npx",
      "args": ["-y", "mcp-bcra"]
    }
  }
}
```

### VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "bcra": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-bcra"]
    }
  }
}
```

## Questions this server can answer

| Question | Tool |
|---|---|
| Which bank pays the highest peso plazo fijo? / ¿Qué banco paga más un plazo fijo en pesos? | `get-bcra-ranking-tasas` with `producto: "plazosFijos"` (pesos is the default) |
| Which peso personal loan is cheapest? / ¿Cuál es el préstamo personal en pesos más barato? | `get-bcra-ranking-tasas` with `producto: "prestamosPersonales"` |
| Did a 30% TNA beat inflation last month? / ¿Un plazo fijo al 30% le ganó a la inflación? | `get-bcra-tasa-real-plazo-fijo` |
| What is the official dollar, and where are reserves, today? / ¿A cuánto está el dólar oficial y las reservas? | `get-bcra-snapshot-macro` |
| What does the BCRA publish about this CUIT? / ¿Qué situación crediticia publica el BCRA para este CUIT? | `get-bcra-client-central-deudores` |

## Data sources and limits

The figures come from public [BCRA APIs](https://www.bcra.gob.ar/BCRAyVos/catalogo-de-APIs-banco-central.asp): Central de Deudores, cheques, Estadísticas monetarias v4, Estadísticas cambiarias, the Transparencia v1.0 product catalog, and the official Series Excel catalog. There is no login and no private data except the CUIT/CUIL/CDI the caller chooses to send.

- Freshness: every macro indicator includes `fechaUltimaObservacion`, `diasDesdeUltimaObservacion` and `vigente` (true when the last point is at most 21 days old). Policy-rate series 160 stopped on 2025-07-10 and is not replaced.
- Outliers: rankings drop rates outside a per-denomination fence (modified z-score 3.5). If the MAD is 0, the fence is Tukey's IQR, then a mean-absolute-deviation scale. A rate equal to the hard floor is `atipico`. Discarded rows come back in `valoresDescartados`.
- Currency: loan rows use the published `denominacion`. Fixed-term rows leave that field empty, so the currency is inferred from `nombreCorto` and `nombreCompleto` (UVA, then dólar/USD/u$s, otherwise pesos) and marked `denominacionInferida: true`. A published value always wins. Cards have no currency field and are treated as pesos.
- The fixed-term plazo filter is the integer BCRA publishes (live values 0–5), not a count of days.

The rest of this file is the reference for parameters, formulas and local development.

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
| `get-bcra-series-excel-catalog` | `idVariable`, `buscar`, `limit` (1–100, default 50), `offset` opcionales |
| `get-bcra-fx-currencies` | Sin parámetros específicos |
| `get-bcra-fx-quotes` | `fecha` opcional |
| `get-bcra-fx-quote-by-currency` | `codMoneda`; `fechadesde`, `fechahasta`, `limit` (10–1000), `offset` opcionales |
| `get-bcra-transparencia-producto` | `producto`; `codigoEntidad` opcional |
| `get-bcra-ranking-tasas` | `producto` (`plazosFijos`, `prestamosPersonales`, `prestamosHipotecarios`, `prestamosPrendarios`, `tarjetas`); `modo` (`entidad` por defecto u `oferta`); `orden` (`asc` o `desc`); `buscar`, `limit` (1–500, default 100), `incluirTasasCero` (default `false`), `incluirValoresAtipicos` (default `false`) y `denominacion` (`pesos` por defecto, `uva`, `dolares` o `todas`) opcionales. En plazos fijos, `plazoMinimoInvertirDesde` y `plazoMinimoInvertirHasta` opcionales |
| `get-bcra-tasa-real-plazo-fijo` | `tasaNominalAnual` opcional; `desde`, `hasta` y `plazoDias` (1–3000) opcionales. Sin fechas, toma 30 días hasta el último CER |
| `get-bcra-snapshot-macro` | Sin parámetros específicos |

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

### Herramientas de respuesta

Estas tres tools no reemplazan a las de consulta: arman una respuesta a partir de las mismas APIs.

`get-bcra-ranking-tasas` lee Transparencia y ordena ofertas. El campo de tasa sale de la respuesta real de cada producto:

- Plazos fijos: `tasaEfectivaAnualMinima`. La API no publica TNA.
- Préstamos personales, hipotecarios y prendarios: `costoFinancieroEfectivoTotalMaximo`, y también `tasaEfectivaAnualMaxima`. Si falta el CFT, esa oferta usa la TEA máxima.
- Tarjetas: `tasaEfectivaAnualMaximaFinanciacion`, y también `tasaEfectivaAnualMaximaAdelantoEfectivo`.

Por defecto hay una fila por entidad (la oferta extrema según el orden) y el orden favorece al usuario: mayor TEA mínima en plazos fijos y menor costo en préstamos y tarjetas. `modo: "oferta"` lista cada producto publicado. Cada fila trae código y nombre de entidad, tasas, fecha de información y la ruta de origen. Cajas de ahorro y paquetes no entran: no tienen un campo de tasa.

El ranking es de una sola denominación. El default es `pesos`. En préstamos, `pesos` es el texto publicado «Pesos», `uva` es «UVA» y `dolares` acepta «Dólares estadounidenses» y «Dolares estadounidenses». `denominacion: "todas"` no arma una lista mezclada: cada moneda va en `rankings` y `resultados` queda vacío. `limit` se aplica dentro de cada corte.

En plazos fijos el campo `denominacion` viene vacío. Solo en ese caso la moneda se infiere de `nombreCorto` y `nombreCompleto`: si el texto tiene UVA, es uva; si no, si tiene dolar, dólar, USD o u$s, es dólares; si no, es pesos. La fila lleva `denominacionInferida: true` y conserva el nombre que se usó. Una `denominacion` publicada gana y deja el flag en false. Un plazo fijo en euros no tiene palabra clave y entra en pesos. `ofertasDenominacionInferida` cuenta esas filas.

En préstamos, una fila sin `denominacion` no se trata como pesos. Se cuenta en `ofertasSinDenominacion` y, con `todas`, forma el corte `sinDenominacion`. Otras etiquetas publicadas (Euros o UVI) no se pliegan a pesos.

Las tarjetas no traen `denominacion`, ni la API ni el PDF del régimen. El catálogo entero se rankea como pesos y el corte lleva `implicita: true`. Pedir uva o dólares devuelve un corte vacío.

Por defecto se excluyen las ofertas cuyo campo de orden es nulo o cero (`excluyeTasasCero: true`). `incluirTasasCero: true` las vuelve a incluir. Un costo financiero distinto de cero se conserva aunque otra tasa de la misma fila sea 0. `ofertasSinTasa` cuenta las filas sin número en el campo de orden; `ofertasTasaCero` cuenta las que publican 0. Las tasas cero excluidas no se vuelven a contar en `ofertasFueraDePlazo`.

Con lo que queda dentro de la denominación pedida, cada corte calcula un intervalo de plausibilidad y, por defecto, saca del ranking lo que cae afuera (`excluyeValoresAtipicos: true`). Esos valores no se ocultan: van en `valoresDescartados` de ese corte, con entidad, campo, valor y motivo. Si se pidió una sola denominación, los mismos campos se espejan en la raíz. `incluirValoresAtipicos: true` los devuelve en el ranking con `atipico: true` y deja `valoresDescartados` vacío. `limitesPlausibilidad` trae el intervalo del corte.

La regla es el z modificado de Iglewicz y Hoaglin (1993): una tasa positiva queda afuera cuando `|0,6745 · (x − mediana) / MAD| > 3,5`. La MAD es la mediana de las desviaciones absolutas. El grupo es la denominación pedida, así las dos grafías de dólares comparten una sola valla. Con menos de 8 tasas positivas no se usa el z y solo rigen las cotas fijas. Si hay 8 o más y la MAD es 0, porque una moda atada aplasta la mediana de los desvíos (pasa en los hipotecarios en pesos), la valla pasa a ser la de Tukey: de `Q1 − 1,5·IQR` a `Q3 + 1,5·IQR`, en la misma escala. Si el IQR también es 0, la escala es la desviación absoluta media respecto de la mediana, llevada a un equivalente de MAD con el factor normal `0,6745 / sqrt(2/π)`, y se vuelve a usar el corte 3,5. Solo un grupo sin ninguna dispersión queda en las cotas fijas. `limitesPlausibilidad.metodo` dice cuál corrió: `z-modificado`, `iqr`, `desviacion-media` o `cota`. En `mad` va esa dispersión, en la escala transformada (el logaritmo, para el CFT).

Plazos fijos y tarjetas se miden en la escala de la tasa. El CFT de los préstamos se mide en logaritmo, porque la cola derecha en pesos es tan larga que una valla lineal cae por debajo de cero y dejaría pasar un CFT de 0,5. Las cotas fijas, en porcentaje anual, son plazos fijos `[0, 150]`, préstamos `[1, 10000]` y tarjetas `[1, 2500]`. Un valor por debajo de la cota queda afuera. Un valor igual a una cota mínima positiva también es atípico. El caso que motiva el piso inclusivo es un prendario en dólares publicado en 1. El piso de los plazos fijos es 0, así que una TEA cero sigue el filtro de tasas cero y no esta regla. El intervalo se recalcula en cada llamada, dentro de cada denominación.

En plazos fijos, `plazoMinimoInvertirDesde` y `plazoMinimoInvertirHasta` filtran el entero publicado en `plazoMinimoInvertirDias`, inclusive. Una fila sin ese número queda afuera cuando el filtro está puesto. Esos parámetros no aplican a préstamos ni tarjetas.

Ese entero no es una cantidad de días. El 2026-10-27 el catálogo vivo solo trae 0, 1, 2, 3, 4 y 5. El PDF del régimen ([Régimen de Transparencia v1.0](https://www.bcra.gob.ar/archivos/Catalogo/Content/files/pdf/regimen-transparencia-v1.pdf)) describe el campo como 30, 60, 90, 180 o 360, pero su propio ejemplo y la API publican 1 y 4. Esta tool no traduce el código: pedir 30 devuelve cero filas. Un valor 1 no es un plazo de un día. Algunos `nombreCorto` traen 30D, 60D, 90D, 180D o 365D junto a los códigos 1 a 5; eso no es una tabla oficial y no se usa para convertir.

Los préstamos publican `plazoMaximoOtorgable` en meses, según ese PDF, y queda en `contexto`. Las tarjetas no publican plazo. Ninguno de los dos se filtra con el rango de plazos fijos.

No hay filtro por tipo de entidad. Transparencia trae `codigoEntidad` y `descripcionEntidad`; el padrón `cheques/v1.0/entidades` trae `codigoEntidad` y `denominacion`. Ninguno publica clase, grupo o tipo. `buscar` compara el texto publicado (entidad y producto). No se infiere «banco» o «mutual» a partir del nombre.

`get-bcra-tasa-real-plazo-fijo` compara una TNA con la inflación del período medida por el CER (serie **30**, coeficiente de estabilización de referencia, diaria). Si no se pasa `tasaNominalAnual`, la TNA es la serie **12** (depósitos a 30 días en entidades financieras, nominal anual) en la fecha de inicio o el día hábil anterior. No usa BADLAR (serie 7) ni TAMAR (serie 44), que son tasas mayoristas, ni la inflación mensual (serie 27) o interanual (serie 28), porque no se alinean a un plazo arbitrario. La fórmula, con tasas de salida en porcentaje y base 365, es:

```text
tasa_nominal_del_periodo = (TNA / 100) * (dias / 365)
inflacion = CER(hasta) / CER(desde) - 1
tasa_real_del_periodo = (1 + tasa_nominal_del_periodo) / (1 + inflacion) - 1
tasa_real_anualizada = (1 + tasa_real_del_periodo) ^ (365 / dias) - 1
```

`get-bcra-snapshot-macro` devuelve último valor, valor anterior, variación absoluta, variación porcentual y serie de:

| Indicador | Serie | Por qué |
|---|---:|---|
| Tipo de cambio oficial | 5 | Tipo de cambio mayorista de referencia, en Principales Variables |
| Reservas internacionales | 1 | Saldo en millones de USD, en Principales Variables |
| Base monetaria | 15 | Saldo en millones de pesos, en Principales Variables |
| Tasa de política monetaria | 160 | Única serie TNA con ese nombre. No está en Principales Variables |

Cada indicador trae, siempre, `fechaUltimaObservacion` (la misma fecha que `ultimo.fecha`), `diasDesdeUltimaObservacion` (días de calendario entre esa fecha y `fechaConsulta`) y `vigente`. `vigente` es `true` cuando esa edad es de hasta 21 días. Si no lo es, `advertencia` explica el atraso.

La serie 160 está discontinuada aguas arriba: el BCRA dejó de actualizarla el 2025-07-10. La tool sigue leyendo esa serie y no la sustituye por TAMAR, BADLAR ni pases. `vigente` sale de la fecha publicada; si el BCRA volviera a informarla, pasaría a `true` sin cambiar de serie. El tipo de cambio minorista es la serie 4 y no se usa como referencia oficial.

### Catálogo Excel de series

`get-bcra-series-excel-catalog` lee el [listado XLSX oficial de variables de Series.xlsm](https://www.bcra.gob.ar/datos-monetarios-diarios/). Devuelve el identificador de API, descripción, tipo de serie, periodicidad, unidad y moneda, además de `sourceUrl`, `sourcePage`, `format`, `total` y `results`. `buscar` filtra la descripción sin distinguir mayúsculas; `idVariable` selecciona un identificador exacto. La paginación se aplica después de filtrar. Esta planilla es un **catálogo**, no contiene las observaciones históricas: para obtener valores use `get-bcra-var-hist` con el `idVariable` encontrado.

El archivo se descarga en cada llamada desde una ruta fija de `www.bcra.gob.ar`. Se limita el tamaño de la respuesta y se rechaza una estructura de columnas inesperada con `UPSTREAM_SCHEMA_MISMATCH`. La planilla está en español; `idioma` solo se envía como preferencia HTTP y no traduce sus celdas. Esta integración acepta XLSX; los archivos históricos `.xls` y los libros `.xlsm` publicados por el BCRA requieren adaptadores y validaciones por documento antes de exponer sus datos.

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

- HTTPS obligatorio y orígenes fijos `https://api.bcra.gob.ar` para JSON y `https://www.bcra.gob.ar` para el catálogo XLSX.
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

## Publicación manual

npm y el MCP Registry no se publican desde CI. Hace falta un OK explícito de quien mantiene el repo. La metadata ya está preparada: `mcpName` en `package.json` y `server.json` en la raíz, con el esquema oficial `2025-12-11`.

El nombre del servidor es `io.github.mortiz-dev/mcp-bcra`. La descripción del registry tiene un máximo de 100 caracteres. No hay variables secretas: las APIs del BCRA son públicas.

1. Confirmar que `package.json`, `src/manifest.ts` y `server.json` tengan la misma versión. `2.0.0` todavía no está en npm. Si esa versión debe quedar reservada al changelog ya escrito, subir los tres archivos (por ejemplo a `2.1.0`) y mover las notas de `Unreleased`. `bun run pack:check` exige que coincidan.
2. `bun run release:check`
3. `bun run smoke:live`
4. `npm adduser` si hace falta, y después `npm publish --access public`. `prepack` compila. `publishConfig.access` ya es `public`.
5. Confirmar <https://www.npmjs.com/package/mcp-bcra> y que `npx mcp-bcra` negocie stdio.
6. Instalar `mcp-publisher` desde el release oficial del MCP Registry y correr `mcp-publisher --help`.
7. `mcp-publisher login github` con la cuenta `mortiz-dev`. Otro usuario no puede publicar ese nombre.
8. `mcp-publisher publish` en la raíz del repo. El registry solo guarda metadata: el paquete de npm tiene que existir antes, con el mismo `mcpName` y la misma versión.
9. Verificar con `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.mortiz-dev/mcp-bcra"`.

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

Próximas incorporaciones recomendadas: leer series que el BCRA publica solo en XLS, empezando por los [préstamos UVA diarios y mensuales](https://www.bcra.gob.ar/prestamos-y-otros-activos-de-las-entidades-financieras/), con esquema explícito, unidad, período y fuente por observación. También conviene comparar periódicamente las series del catálogo XLSX con Estadísticas v4 para detectar IDs discontinuados o cambios de metadatos.

Arquitectura:

- Cada dominio contiene `schemas.ts`, `api.ts` y `tools.ts`.
- `api.ts` no conoce MCP. Usa `BcraHttpClient` y valida la respuesta upstream.
- `tools.ts` declara contratos MCP, pasa cancelación y transforma resultados.
- `src/shared/http` centraliza origen, rate, retry, timeout, tamaños y errores.
- `src/shared/mcp` centraliza registro, anotaciones y respuestas.
- `src/tools/registerAllTools.ts` crea un único cliente compartido y registra las 16 tools.

Para agregar una tool, actualice schemas, API, registro, pruebas de dominio/protocolo y este README si cambia el contrato.

## Migración: catálogo Excel

Se agrega `get-bcra-series-excel-catalog` sin modificar las tools existentes. Los clientes que muestren una lista fija deben incluir la nueva tool. El resultado tiene contrato propio de catálogo y no la envoltura `{status, results}` de las APIs JSON. Su `idVariable` puede usarse en `get-bcra-var-hist`. Quien inyecte un `BcraHttpClient` propio debe implementar `getDocument` para usar esta tool; `getJson` sigue siendo suficiente para las anteriores.

## Migración: tools de respuesta

Se agregan `get-bcra-ranking-tasas`, `get-bcra-tasa-real-plazo-fijo` y `get-bcra-snapshot-macro` sin modificar las tools existentes. Los clientes que muestren una lista fija deben incluirlas. Sus resultados no usan la envoltura `{status, results}`: traen la respuesta ya ordenada o calculada, con las series y los campos de tasa que se usaron. Siguen siendo de solo lectura y no consultan por CUIT/CUIL. El ranking excluye por defecto tasas nulas y cero del campo de orden, y ordena una sola denominación (`pesos` por defecto). `denominacion: "todas"` deja `resultados` vacío y separa cada moneda en `rankings`. En plazos fijos, la moneda vacía se infiere del nombre y la fila marca `denominacionInferida`. En préstamos, una fila sin `denominacion` no entra en pesos. Las tarjetas, que no publican el campo, se rankean como pesos con `implicita: true`. El snapshot informa `fechaUltimaObservacion`, `diasDesdeUltimaObservacion` y `vigente` en cada indicador. La serie 160 sigue siendo la tasa de política y está discontinuada aguas arriba.
