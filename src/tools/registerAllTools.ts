import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createBcraHttpClient } from "../shared/http/bcraClient.js";
import { createCentralDeudoresApi } from "../domains/centralDeudores/api.js";
import { registerCentralDeudoresTools } from "../domains/centralDeudores/tools.js";
import { createChequesApi } from "../domains/cheques/api.js";
import { registerChequesTools } from "../domains/cheques/tools.js";
import { createEstadisticasApi } from "../domains/estadisticas/api.js";
import { registerEstadisticasTools } from "../domains/estadisticas/tools.js";
import { createEstadisticasCambiariasApi } from "../domains/estadisticasCambiarias/api.js";
import { registerEstadisticasCambiariasTools } from "../domains/estadisticasCambiarias/tools.js";
import { createTransparenciaApi } from "../domains/transparencia/api.js";
import { registerTransparenciaTools } from "../domains/transparencia/tools.js";

export const registerAllTools = (server: McpServer): void => {
  const client = createBcraHttpClient();

  registerCentralDeudoresTools(server, createCentralDeudoresApi(client));
  registerChequesTools(server, createChequesApi(client));
  registerEstadisticasTools(server, createEstadisticasApi(client));
  registerEstadisticasCambiariasTools(
    server,
    createEstadisticasCambiariasApi(client)
  );
  registerTransparenciaTools(server, createTransparenciaApi(client));
};

export default registerAllTools;
