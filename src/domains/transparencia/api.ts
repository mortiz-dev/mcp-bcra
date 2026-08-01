import {
  type BcraApiContext,
  type BcraHttpClient,
  toRequestOptions,
} from "../../shared/http/bcraClient.js";
import {
  type BcraResponse,
  parseBcraResponse,
} from "../../shared/http/responseSchema.js";
import type { TransparenciaProduct } from "./schemas.js";

const productPaths: Record<TransparenciaProduct, string> = {
  cajasAhorros: "CajasAhorros",
  paquetes: "PaquetesProductos",
  plazosFijos: "PlazosFijos",
  prestamosPrendarios: "Prestamos/Prendarios",
  prestamosHipotecarios: "Prestamos/Hipotecarios",
  prestamosPersonales: "Prestamos/Personales",
  tarjetas: "TarjetasCredito",
};

export interface TransparenciaApi {
  getProduct(
    params: { producto: TransparenciaProduct; codigoEntidad?: number },
    context?: BcraApiContext,
  ): Promise<BcraResponse>;
}

export const createTransparenciaApi = (client: BcraHttpClient): TransparenciaApi => ({
  async getProduct(params, context) {
    const data = await client.getJson(
      `/transparencia/v1.0/${productPaths[params.producto]}`,
      { codigoEntidad: params.codigoEntidad },
      toRequestOptions(context),
    );
    return parseBcraResponse(data, "transparency product");
  },
});
