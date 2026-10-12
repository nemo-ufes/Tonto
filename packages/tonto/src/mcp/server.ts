import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TontoAgentHandlers, toolDefinitions, TontoToolName } from "./handlers.js";
import { knowledge, KnowledgeName } from "./knowledge.js";

export function createTontoMcpServer(root: string) {
  const server = new McpServer({ name: "tonto", version: "0.4.14" });
  const handlers = new TontoAgentHandlers(root);
  for (const name of Object.keys(toolDefinitions) as TontoToolName[]) {
    const definition = toolDefinitions[name];
    server.registerTool(name, { description: definition.description, inputSchema: definition.schema.shape,
      annotations: { readOnlyHint: name !== "tonto_hold", destructiveHint: false, openWorldHint: false } },
    async (input: unknown, extra: { signal: AbortSignal }) => {
      try { return { content: [{ type: "text" as const, text: JSON.stringify(await handlers.invoke(name, input, () => extra.signal.aborted)) }] }; }
      catch (error) { return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] }; }
    });
  }
  for (const name of Object.keys(knowledge) as KnowledgeName[]) {
    const uri = `tonto://${name}`;
    server.registerResource(name, uri, { description: knowledge[name].source, mimeType: "application/json" }, async () => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(knowledge[name]) }] }));
  }
  server.registerPrompt("draft", { description: "Draft a model grounded in current Tonto semantics.", argsSchema: { request: z.string() } }, ({ request }) => ({ messages: [{ role: "user", content: { type: "text", text: `Read tonto_guide and tonto_patterns, draft this model, then validate with tonto_validate. Return source without saving.\n${request}` } }] }));
  server.registerPrompt("review", { description: "Review a model with linked diagnostics and repair previews.", argsSchema: { path: z.string() } }, ({ path }) => ({ messages: [{ role: "user", content: { type: "text", text: `Review ${path} using tonto_validate, tonto_digest and tonto_rules. Explain diagnostics and preview unambiguous repairs with tonto_repair. Do not save.` } }] }));
  return server;
}
export async function startTontoMcpServer(root = process.cwd()): Promise<void> {
  await createTontoMcpServer(root).connect(new StdioServerTransport());
}
