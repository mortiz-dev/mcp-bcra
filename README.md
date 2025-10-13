# MCP BCRA

Proyecto MCP que expone varias herramientas que consumen APIs del BCRA.

## Estructura principal

- `src/manifest.ts` - metadatos del servidor (nombre, versión, descripción)
- `src/server.ts` - función `createServer()` que crea el `McpServer` y registra herramientas
- `src/tools/bcra.ts` - registrador de herramientas BCRA (schemas y fetch helpers)
- `src/index.ts` - entrypoint que conecta el servidor al `StdioServerTransport`

## Requisitos

- Node.js >= 18
- pnpm (opcional)

## Instalación

Instalar dependencias:

```powershell
pnpm install
```

Si `pnpm install` falla con `ERR_INVALID_URL` — normalmente es un problema de configuración del registro en `.npmrc` o variables de entorno apuntando a una URL inválida. Revisa:

- Archivo `.npmrc` en el proyecto o en tu carpeta de usuario (`%USERPROFILE%\.npmrc`) y elimina líneas con `registry=` que apunten a URL vacía.
- Variables de entorno como `NPM_CONFIG_REGISTRY` o `npm_config_registry`.

Si necesitas, corre `pnpm install --registry=https://registry.npmjs.org/` para forzar el registro oficial.

## Scripts

- `pnpm run build` - compila TypeScript
- `pnpm run start` - ejecuta `dist/index.js` (asegúrate de compilar primero)
- `pnpm test` - ejecuta los tests (usa Vitest). Nota: instala devDependencies antes de ejecutar.

## Tests

Se incluyeron tests básicos en `test/`:

- `test/tools.bcra.test.ts` - prueba el helper `textResponse`
- `test/server.test.ts` - crea el server y verifica que expone métodos esperados

Para ejecutarlos:

```powershell
pnpm install
pnpm test
```

## Seguridad

El código presente desactiva la verificación TLS con `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` en varias herramientas — esto es peligroso en producción. Reemplazar por certificados válidos o eliminar la línea en producción.

## Cómo contribuir

Abre una issue o PR con mejoras. Para añadir una nueva herramienta, edita `src/tools/bcra.ts` y registra la nueva tool con `server.tool(name, schema?, handler)`.
# MCP-BCRA

Un servidor Model Context Protocol (MCP) para acceder a las APIs del Banco Central de la República Argentina (BCRA).

## Descripción

Este proyecto implementa un servidor MCP que actúa como intermediario para consultar información de las APIs del BCRA, como el Central de Deudores, historial de cheques rechazados y listado de entidades financieras.

El servicio utiliza la librería `@modelcontextprotocol/sdk` para implementar el protocolo MCP, permitiendo que modelos de lenguaje puedan acceder a las APIs del BCRA de manera estructurada.

## Herramientas disponibles

El servidor provee las siguientes herramientas:

1. **get-bcra-client-central-deudores**: Consulta información de deudores en el Central de Deudores del BCRA.
2. **get-bcra-client-cheques-rechazados**: Obtiene información sobre cheques rechazados para un cliente específico.
3. **get-bcra-client-central-deudores-historical**: Recupera datos históricos de deudores en el BCRA.
4. **get-bcra-entities**: Lista todas las entidades financieras registradas en el BCRA.

## Requisitos

- Node.js (versión recomendada: 18 o superior)
- TypeScript
- Acceso a las APIs del BCRA (para uso en producción)

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/mcp-bcra.git
cd mcp-bcra

# Instalar dependencias
npm install
```

## Compilación

```bash
npm run build
```

## Ejecución

```bash
# Ejecutar en modo normal
npm start

# Ejecutar en modo desarrollo (con auto-recarga)
npm run dev
```

## Uso como servidor MCP

Este servidor está diseñado para ser utilizado como un proveedor de herramientas MCP para modelos de lenguaje. Para utilizarlo, conéctalo a un cliente MCP compatible que pueda comunicarse a través del protocolo MCP.

Ejemplo de uso desde un cliente MCP:

```javascript
// Consultar información de un cliente en el Central de Deudores
const result = await callTool("get-bcra-client-central-deudores", {
  clientId: "30123456789" // CUIT/CUIL del cliente
});
```

## Advertencias

⚠️ El código actual incluye la desactivación de verificación SSL (`NODE_TLS_REJECT_UNAUTHORIZED="0"`), lo cual no es recomendado para entornos de producción.

## Licencia

ISC

---

> Nota: Este proyecto es un servidor MCP y requiere ser invocado a través de un cliente compatible con el Modelo de Protocolo de Contexto (MCP).