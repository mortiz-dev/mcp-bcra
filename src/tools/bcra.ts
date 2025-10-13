import { z } from "zod";

// Helper to create a simple text response
export const textResponse = (data: unknown) => ({
  content: [
    { type: "text", text: JSON.stringify(data) }
  ]
});

export const registerBcraTools = (server: any) => {
  // get client central deudores
  server.tool("get-bcra-client-central-deudores",
    { clientId: z.string() },
    async ({ clientId }: { clientId: string }) => {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      console.error(`Fetching BCRA client data for ID: ${clientId}`);
      const res = await fetch(`https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/${clientId}`);
      const data = await res.json();
      return textResponse(data);
    }
  );

  server.tool("get-bcra-client-cheques-rechazados",
    { clientId: z.string() },
    async ({ clientId }: { clientId: string }) => {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      console.error(`Fetching BCRA client data for ID: ${clientId}`);
      const res = await fetch(`https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/${clientId}`);
      const data = await res.json();
      return textResponse(data);
    }
  );

  server.tool("get-bcra-client-central-deudores-historical",
    { clientId: z.string() },
    async ({ clientId }: { clientId: string }) => {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      console.error(`Fetching BCRA client history for ID: ${clientId}`);
      const res = await fetch(`https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/Historicas/${clientId}`);
      const data = await res.json();
      return textResponse(data);
    }
  );

  server.tool("get-bcra-entities",
    async () => {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      const res = await fetch(`https://api.bcra.gob.ar/cheques/v1.0/entidades`);
      const data = await res.json();
      return textResponse(data);
    }
  );

  server.tool("get-bcra-variables",
    async () => {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      const res = await fetch(`https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias`);
      const data = await res.json();
      return textResponse(data);
    }
  );

  server.tool("get-bcra-var-hist",
    { IdVariable: z.number(), fechaDesde: z.string(), fechaHasta: z.string() },
    async ({ IdVariable, fechaDesde, fechaHasta }: any) => {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      console.error(`Fetching BCRA variable ${IdVariable} from ${fechaDesde} to ${fechaHasta}`);
      const res = await fetch(`https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/${IdVariable}?desde=${fechaDesde}&hasta=${fechaHasta}`);
      const data = await res.json();
      return textResponse(data);
    }
  );
};

export default registerBcraTools;
