import { BcraHttpClient } from "../../shared/http/bcraClient.js";

export interface EstadisticasApi {
  getVariables(): Promise<unknown>;
  getVariableHistory(params: {
    idVariable: number;
    desde?: string;
    hasta?: string;
  }): Promise<unknown>;
}

export const createEstadisticasApi = (
  client: BcraHttpClient
): EstadisticasApi => ({
  getVariables(): Promise<unknown> {
    return client.getJson("/estadisticas/v4.0/Monetarias");
  },

  getVariableHistory(params: {
    idVariable: number;
    desde?: string;
    hasta?: string;
  }): Promise<unknown> {
    return client.getJson(`/estadisticas/v4.0/Monetarias/${params.idVariable}`, {
      desde: params.desde,
      hasta: params.hasta,
    });
  },
});
