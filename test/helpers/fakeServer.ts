import { ToolHandlerResult } from "../../src/shared/mcp/response.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolHandlerResult>;

type RegisteredTool = {
  schema?: unknown;
  handler: ToolHandler;
};

export class FakeServer {
  tools = new Map<string, RegisteredTool>();

  tool(name: string, schemaOrHandler: unknown, maybeHandler?: unknown): void {
    if (typeof schemaOrHandler === "function") {
      this.tools.set(name, {
        handler: schemaOrHandler as ToolHandler,
      });
      return;
    }

    this.tools.set(name, {
      schema: schemaOrHandler,
      handler: maybeHandler as ToolHandler,
    });
  }
}

export const parseToolResult = (result: ToolHandlerResult): unknown =>
  JSON.parse(result.content[0].text);
