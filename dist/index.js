import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const server = new McpServer({
    name: "BCRA MCP",
    version: "0.0.1",
    description: "A Model Context Protocol server for BCRA API's",
});
// Capturar y silenciar los warnings de Node para evitar que se impriman en stdout y rompan el protocolo JSON
process.on('warning', () => { });
// Registramos la herramienta para obtener información de deudores del BCRA
const getBcraClientTool = server.tool("get-bcra-client", {
    clientId: z.string()
}, async ({ clientId }) => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Ignora la verificación SSL (⚠️ No usar en producción)
    console.error(`Fetching BCRA client data for ID: ${clientId}`);
    const response = await fetch(`https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/${clientId}`);
    const data = await response.json();
    return {
        content: [
            { type: "text", text: JSON.stringify(data) }
        ]
    };
});
// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
