import {
  type BcraApiContext,
  type BcraHttpClient,
  toRequestOptions,
} from "../../shared/http/bcraClient.js";
import {
  type BcraResponse,
  parseBcraResponse,
} from "../../shared/http/responseSchema.js";

export type VariablesParams = {
  idVariable?: number;
  categoria?: string;
  tipoSerie?: string;
  periodicidad?: string;
  unidadExpresion?: string;
  limit?: number;
  offset?: number;
};

export type VariableHistoryParams = {
  idVariable: number;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
};

export type MethodologyParams = {
  idVariable?: number;
  limit?: number;
  offset?: number;
};

export interface EstadisticasApi {
  getVariables(
    params?: VariablesParams,
    context?: BcraApiContext,
  ): Promise<BcraResponse>;
  getVariableHistory(
    params: VariableHistoryParams,
    context?: BcraApiContext,
  ): Promise<BcraResponse>;
  getMethodology(
    params?: MethodologyParams,
    context?: BcraApiContext,
  ): Promise<BcraResponse>;
}

export const createEstadisticasApi = (client: BcraHttpClient): EstadisticasApi => ({
  async getVariables(params, context) {
    const data = await client.getJson(
      "/estadisticas/v4.0/Monetarias",
      {
        idVariable: params?.idVariable,
        categoria: params?.categoria,
        tipoSerie: params?.tipoSerie,
        periodicidad: params?.periodicidad,
        unidadExpresion: params?.unidadExpresion,
        limit: params?.limit,
        offset: params?.offset,
      },
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "statistics variables");
  },

  async getVariableHistory(params, context) {
    const data = await client.getJson(
      `/estadisticas/v4.0/Monetarias/${params.idVariable}`,
      {
        desde: params.desde,
        hasta: params.hasta,
        limit: params.limit,
        offset: params.offset,
      },
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "statistics history");
  },

  async getMethodology(params, context) {
    const data = await client.getJson(
      "/estadisticas/v4.0/metodologia",
      {
        idVariable: params?.idVariable,
        limit: params?.limit,
        offset: params?.offset,
      },
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "statistics methodology");
  },
});
