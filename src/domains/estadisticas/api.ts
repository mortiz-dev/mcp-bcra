import { BcraHttpClient } from "../../shared/http/bcraClient.js";

export type PaginationParams = {
  limit?: number;
  offset?: number;
};

export interface EstadisticasApi {
  getVariables(params?: PaginationParams): Promise<unknown>;
  getVariableHistory(params: {
    idVariable: number;
    desde?: string;
    hasta?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown>;
}

export const createEstadisticasApi = (
  client: BcraHttpClient
): EstadisticasApi => ({
  getVariables(params?: PaginationParams): Promise<unknown> {
    return client.getJson("/estadisticas/v4.0/Monetarias", {
      limit: params?.limit,
      offset: params?.offset,
    });
  },

  getVariableHistory(params: {
    idVariable: number;
    desde?: string;
    hasta?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    return client.getJson(`/estadisticas/v4.0/Monetarias/${params.idVariable}`, {
      desde: params.desde,
      hasta: params.hasta,
      limit: params.limit,
      offset: params.offset,
    });
  },
});
