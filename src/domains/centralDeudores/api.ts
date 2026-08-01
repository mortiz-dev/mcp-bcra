import {
  type BcraApiContext,
  type BcraHttpClient,
  toRequestOptions,
} from "../../shared/http/bcraClient.js";
import {
  type BcraResponse,
  parseBcraResponse,
} from "../../shared/http/responseSchema.js";

export interface CentralDeudoresApi {
  getClientDebt(clientId: string, context?: BcraApiContext): Promise<BcraResponse>;
  getClientDebtHistorical(
    clientId: string,
    context?: BcraApiContext,
  ): Promise<BcraResponse>;
}

export const createCentralDeudoresApi = (
  client: BcraHttpClient,
): CentralDeudoresApi => ({
  async getClientDebt(clientId, context) {
    const data = await client.getJson(
      `/CentralDeDeudores/v1.0/Deudas/${encodeURIComponent(clientId)}`,
      undefined,
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "central de deudores");
  },

  async getClientDebtHistorical(clientId, context) {
    const data = await client.getJson(
      `/CentralDeDeudores/v1.0/Deudas/Historicas/${encodeURIComponent(clientId)}`,
      undefined,
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "central de deudores historical");
  },
});
