import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TontoMcpWorkspace } from "./workspace.js";

const model = {
  source: z.string().optional().describe("Unsaved model text; overrides the file at path for this request."),
  path: z.string().optional().describe(".tonto path within the project root. Required when source is omitted."),
};
const position = z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() });
const edit = z.object({ range: z.object({ start: position, end: position }), newText: z.string() });

async function toolResult(action: () => Promise<unknown>) {
  try {
    const result = await action();
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text" as const,
      text: error instanceof Error ? error.message : String(error) }] };
  }
}

export function createTontoMcpServer(root: string) {
  const server = new McpServer({ name: "tonto", version: "0.4.14" });
  const workspace = new TontoMcpWorkspace(root);
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  server.registerTool("tonto_validate", {
    description: "Parse, link and validate a Tonto model in its project. Returns project diagnostics, target diagnostics and available editor repairs. Positions are zero-based UTF-16.",
    inputSchema: model, annotations: readOnly,
  }, (input) => toolResult(() => workspace.validate(input)));
  server.registerTool("tonto_ast", {
    description: "Return the linked Langium AST with reference text, reference targets and source ranges, plus diagnostics. Invalid source still returns its partial AST.",
    inputSchema: model, annotations: readOnly,
  }, (input) => toolResult(() => workspace.ast(input)));
  server.registerTool("tonto_apply", {
    description: "Apply explicit non-overlapping LSP text edits OR one repair selected by target diagnosticIndex and optional repairTitle. Returns edited source and fresh project diagnostics. Does not save or hold the result.",
    inputSchema: { ...model, edits: z.array(edit).min(1).optional(),
      diagnosticIndex: z.number().int().nonnegative().optional(), repairTitle: z.string().optional() },
    annotations: readOnly,
  }, (input) => toolResult(() => workspace.apply(input)));
  server.registerTool("tonto_diff", {
    description: "Compare project diagnostics before and after replacing one model. Match by URI, code, severity and message, ignoring shifted locations; preserve duplicate counts.",
    inputSchema: { before: z.string(), after: z.string(), path: model.path }, annotations: readOnly,
  }, (input) => toolResult(() => workspace.diff(input)));
  server.registerTool("tonto_hold", {
    description: "Hold unsaved model text at a project path for imports in subsequent requests. Omit source to release the held model. Session-local; never saves files.",
    inputSchema: { path: z.string(), source: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (input) => toolResult(() => workspace.hold(input.path, input.source)));
  server.registerTool("tonto_complete", {
    description: "Return Tonto editor completion proposals at a zero-based UTF-16 line and character.",
    inputSchema: { ...model, line: z.number().int().nonnegative(), character: z.number().int().nonnegative() },
    annotations: readOnly,
  }, (input) => toolResult(() => workspace.complete(input)));
  return server;
}

export async function startTontoMcpServer(root = process.cwd()): Promise<void> {
  const server = createTontoMcpServer(root);
  await server.connect(new StdioServerTransport());
}
