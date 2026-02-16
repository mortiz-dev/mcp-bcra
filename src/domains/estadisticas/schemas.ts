import { isoDate, positiveInt } from "../../shared/validation/common.js";

export const varHistoryInput = {
  idVariable: positiveInt,
  desde: isoDate.optional(),
  hasta: isoDate.optional(),
};
