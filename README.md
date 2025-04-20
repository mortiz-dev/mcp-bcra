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