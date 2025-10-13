import createServer from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Entrypoint: crea el servidor y lo conecta al transporte stdio.
const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);