import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TontoAgentHandlers, toolDefinitions, TontoToolName } from "./handlers.js";

export function createTontoMcpServer(root: string) {
  const server = new McpServer({ name: "tonto", version: "0.4.14" });
  const handlers = new TontoAgentHandlers(root);
  for (const name of ["tonto_validate", "tonto_ast", "tonto_apply", "tonto_diff", "tonto_hold", "tonto_complete"] as TontoToolName[]) {
    const definition = toolDefinitions[name];
    server.registerTool(name, { description: definition.description, inputSchema: definition.schema.shape,
      annotations: { readOnlyHint: name !== "tonto_hold", destructiveHint: false, openWorldHint: false } },
    async (input: unknown, extra: { signal: AbortSignal }) => {
      try { return { content: [{ type: "text" as const, text: JSON.stringify(await handlers.invoke(name, input, () => extra.signal.aborted)) }] }; }
      catch (error) { return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] }; }
    });
  }
  return server;
}
export async function startTontoMcpServer(root = process.cwd()): Promise<void> {
  await createTontoMcpServer(root).connect(new StdioServerTransport());
}
