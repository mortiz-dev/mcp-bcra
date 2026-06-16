import { BcraHttpClient } from "../../shared/http/bcraClient.js";
import { TransparenciaProduct } from "./schemas.js";

const productPaths: Record<TransparenciaProduct, string> = {
  cajasAhorros: "CajasAhorros",
  cuentasCorrientes: "CuentasCorrientes",
  prestamosPersonales: "PrestamosPersonales",
  prestamosHipotecarios: "PrestamosHipotecarios",
  prestamosPrendarios: "PrestamosPrendarios",
  tarjetas: "Tarjetas",
  cajasSeguridad: "CajasSeguridad",
  paquetes: "Paquetes",
};

export interface TransparenciaApi {
  getProduct(params: {
    producto: TransparenciaProduct;
    codigoEntidad: number;
  }): Promise<unknown>;
}

export const createTransparenciaApi = (
  client: BcraHttpClient
): TransparenciaApi => ({
  getProduct(params: {
    producto: TransparenciaProduct;
    codigoEntidad: number;
  }): Promise<unknown> {
    return client.getJson(
      `/transparencia/v1.0/${productPaths[params.producto]}`,
      {
        codigoEntidad: params.codigoEntidad,
      }
    );
  },
});
