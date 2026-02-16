import { BcraHttpClient } from "../../shared/http/bcraClient.js";

export interface CentralDeudoresApi {
  getClientDebt(clientId: string): Promise<unknown>;
  getClientDebtHistorical(clientId: string): Promise<unknown>;
}

export const createCentralDeudoresApi = (
  client: BcraHttpClient
): CentralDeudoresApi => ({
  getClientDebt(clientId: string): Promise<unknown> {
    return client.getJson(`/CentralDeDeudores/v1.0/Deudas/${encodeURIComponent(clientId)}`);
  },

  getClientDebtHistorical(clientId: string): Promise<unknown> {
    return client.getJson(
      `/CentralDeDeudores/v1.0/Deudas/Historicas/${encodeURIComponent(clientId)}`
    );
  },
});
