import { BcraHttpClient } from "../../shared/http/bcraClient.js";

export interface ChequesApi {
  getRejectedChecks(clientId: string): Promise<unknown>;
  getEntities(): Promise<unknown>;
}

export const createChequesApi = (client: BcraHttpClient): ChequesApi => ({
  getRejectedChecks(clientId: string): Promise<unknown> {
    return client.getJson(
      `/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/${encodeURIComponent(clientId)}`
    );
  },

  getEntities(): Promise<unknown> {
    return client.getJson("/cheques/v1.0/entidades");
  },
});
