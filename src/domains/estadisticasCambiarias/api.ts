import {
  type BcraApiContext,
  type BcraHttpClient,
  toRequestOptions,
} from "../../shared/http/bcraClient.js";
import {
  type BcraResponse,
  parseBcraResponse,
} from "../../shared/http/responseSchema.js";

export type FxQuoteParams = { fecha?: string };
export type FxQuoteByCurrencyParams = {
  codMoneda: string;
  fechadesde?: string;
  fechahasta?: string;
  limit?: number;
  offset?: number;
};

export interface EstadisticasCambiariasApi {
  getCurrencies(context?: BcraApiContext): Promise<BcraResponse>;
  getQuotes(params?: FxQuoteParams, context?: BcraApiContext): Promise<BcraResponse>;
  getQuoteByCurrency(
    params: FxQuoteByCurrencyParams,
    context?: BcraApiContext,
  ): Promise<BcraResponse>;
}

export const createEstadisticasCambiariasApi = (
  client: BcraHttpClient,
): EstadisticasCambiariasApi => ({
  async getCurrencies(context) {
    const data = await client.getJson(
      "/estadisticascambiarias/v1.0/Maestros/Divisas",
      undefined,
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "currencies");
  },

  async getQuotes(params, context) {
    const data = await client.getJson(
      "/estadisticascambiarias/v1.0/Cotizaciones",
      { fecha: params?.fecha },
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "exchange quotes");
  },

  async getQuoteByCurrency(params, context) {
    const data = await client.getJson(
      `/estadisticascambiarias/v1.0/Cotizaciones/${encodeURIComponent(params.codMoneda)}`,
      {
        fechadesde: params.fechadesde,
        fechahasta: params.fechahasta,
        limit: params.limit,
        offset: params.offset,
      },
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "currency exchange quote");
  },
});
