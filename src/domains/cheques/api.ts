import {
  type BcraApiContext,
  type BcraHttpClient,
  toRequestOptions,
} from "../../shared/http/bcraClient.js";
import {
  type BcraResponse,
  parseBcraResponse,
} from "../../shared/http/responseSchema.js";

export interface ChequesApi {
  getRejectedChecks(clientId: string, context?: BcraApiContext): Promise<BcraResponse>;
  getEntities(context?: BcraApiContext): Promise<BcraResponse>;
  getReportedCheck(
    params: { codigoEntidad: number; numeroCheque: string },
    context?: BcraApiContext,
  ): Promise<BcraResponse>;
}

export const createChequesApi = (client: BcraHttpClient): ChequesApi => ({
  async getRejectedChecks(clientId, context) {
    const data = await client.getJson(
      `/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/${encodeURIComponent(clientId)}`,
      undefined,
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "rejected checks");
  },

  async getEntities(context) {
    const data = await client.getJson(
      "/cheques/v1.0/entidades",
      undefined,
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "entities");
  },

  async getReportedCheck(params, context) {
    const data = await client.getJson(
      `/cheques/v1.0/denunciados/${params.codigoEntidad}/${encodeURIComponent(params.numeroCheque)}`,
      undefined,
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "reported check");
  },
});
