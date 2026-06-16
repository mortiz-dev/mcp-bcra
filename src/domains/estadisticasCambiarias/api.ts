import { BcraHttpClient } from "../../shared/http/bcraClient.js";

type FxQuoteParams = {
  fecha?: string;
};

type FxQuoteByCurrencyParams = {
  codMoneda: string;
  fechadesde?: string;
  fechahasta?: string;
  limit?: number;
  offset?: number;
};

export interface EstadisticasCambiariasApi {
  getCurrencies(): Promise<unknown>;
  getQuotes(params?: FxQuoteParams): Promise<unknown>;
  getQuoteByCurrency(params: FxQuoteByCurrencyParams): Promise<unknown>;
}

export const createEstadisticasCambiariasApi = (
  client: BcraHttpClient
): EstadisticasCambiariasApi => ({
  getCurrencies(): Promise<unknown> {
    return client.getJson("/estadisticascambiarias/v1.0/Maestros/Divisas");
  },

  getQuotes(params?: FxQuoteParams): Promise<unknown> {
    return client.getJson("/estadisticascambiarias/v1.0/Cotizaciones", {
      fecha: params?.fecha,
    });
  },

  getQuoteByCurrency(params: FxQuoteByCurrencyParams): Promise<unknown> {
    return client.getJson(
      `/estadisticascambiarias/v1.0/Cotizaciones/${encodeURIComponent(params.codMoneda)}`,
      {
        fechadesde: params.fechadesde,
        fechahasta: params.fechahasta,
        limit: params.limit,
        offset: params.offset,
      }
    );
  },
});
