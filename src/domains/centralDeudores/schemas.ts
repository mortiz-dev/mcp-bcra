import { z } from "zod";
import { nonEmptyString } from "../../shared/validation/common.js";

export const clientIdInput = { clientId: nonEmptyString };
export const clientIdSchema = z.object(clientIdInput);
