import { z } from "zod";
import {
  nonEmptyString,
  numericString,
  positiveInt,
} from "../../shared/validation/common.js";

export const clientIdInput = { clientId: nonEmptyString };
export const clientIdSchema = z.object(clientIdInput);

export const reportedCheckInput = {
  codigoEntidad: positiveInt,
  numeroCheque: numericString,
};
export const reportedCheckSchema = z.object(reportedCheckInput);
