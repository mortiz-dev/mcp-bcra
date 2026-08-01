import type {
  JSONValue,
  McpServer,
  ServerContext,
  StandardSchemaWithJSON,
  ToolAnnotations,
  ToolCallback,
} from "@modelcontextprotocol/server";
import type { z } from "zod";
import { successOutputSchema, toolError, toolSuccess } from "./response.js";

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: true,
};

type ToolRegistrationConfig<
  InputSchema extends z.ZodType & StandardSchemaWithJSON,
  DataSchema extends z.ZodType & StandardSchemaWithJSON,
> = {
  title: string;
  description: string;
  inputSchema: InputSchema;
  dataSchema: DataSchema;
  annotations?: ToolAnnotations;
};

export const registerMcpTool = <
  InputSchema extends z.ZodType & StandardSchemaWithJSON,
  DataSchema extends z.ZodType & StandardSchemaWithJSON,
>(
  server: McpServer,
  name: string,
  config: ToolRegistrationConfig<InputSchema, DataSchema>,
  callback: (
    args: StandardSchemaWithJSON.InferOutput<InputSchema>,
    context: ServerContext,
  ) => JSONValue | Promise<JSONValue>,
): void => {
  const handler = async (
    args: StandardSchemaWithJSON.InferOutput<InputSchema>,
    context: ServerContext,
  ) => {
    try {
      return toolSuccess(await callback(args, context));
    } catch (error) {
      return toolError(error);
    }
  };

  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      outputSchema: successOutputSchema(config.dataSchema),
      annotations: config.annotations ?? READ_ONLY_ANNOTATIONS,
    },
    handler as ToolCallback<InputSchema>,
  );
};
