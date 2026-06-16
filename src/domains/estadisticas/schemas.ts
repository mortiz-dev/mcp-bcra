import { z } from "zod";
import {
  isoDate,
  paginationInput,
  positiveInt,
} from "../../shared/validation/common.js";

export const variablesInput = {
  ...paginationInput,
};
export const variablesSchema = z.object(variablesInput);

export const varHistoryInput = {
  idVariable: positiveInt,
  desde: isoDate.optional(),
  hasta: isoDate.optional(),
  ...paginationInput,
};
export const varHistorySchema = z.object(varHistoryInput);
