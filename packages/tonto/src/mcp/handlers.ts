import { CompositeGeneratorNode } from "langium/generate";
import { z } from "zod";
import { URI } from "vscode-uri";
import { isModel } from "../language/generated/ast.js";
import { parseProjectModular } from "../cli/utils/parseProjectModular.js";
import { readOrCreateDefaultTontoManifest } from "../cli/utils/readManifest.js";
import { TransformTontoToGufo } from "../cli/requests/gufoTransform.js";
import { knowledge } from "./knowledge.js";
import { digestDocuments } from "./digest.js";
import { applyModelEdits, TontoMcpWorkspace } from "./workspace.js";

const model = { source: z.string().optional().describe("Unsaved text overrides path."), path: z.string().optional() };
const position = z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() });
const edit = z.object({ range: z.object({ start: position, end: position }), newText: z.string() });
export const toolDefinitions = {
  tonto_validate: { description: "Parse, link and validate the project. Positions are zero-based UTF-16.", schema: z.object(model) },
  tonto_ast: { description: "Return linked AST, references, ranges and diagnostics, including partial AST for invalid source.", schema: z.object(model) },
  tonto_apply: { description: "Preview explicit edits or exactly one editor repair; never saves or holds source.", schema: z.object({ ...model, edits: z.array(edit).min(1).optional(), diagnosticIndex: z.number().int().nonnegative().optional(), repairTitle: z.string().optional() }) },
  tonto_diff: { description: "Compare project diagnostics by URI, code, severity and message, preserving duplicate counts.", schema: z.object({ before: z.string(), after: z.string(), path: model.path }) },
  tonto_hold: { description: "Hold unsaved source for subsequent requests or omit source to release. Session-local; never saves.", schema: z.object({ path: z.string(), source: z.string().optional() }) },
  tonto_complete: { description: "Editor completion at a zero-based UTF-16 position.", schema: z.object({ ...model, line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }) },
  tonto_guide: { description: "Read the current repository grammar guide.", schema: z.object({}) },
  tonto_rules: { description: "Read current validator rule messages.", schema: z.object({}) },
  tonto_tables: { description: "Read supported categories, relations and validator nature tables.", schema: z.object({}) },
  tonto_patterns: { description: "Read patterns checked against current language services.", schema: z.object({}) },
  tonto_explain: { description: "Explain a validator diagnostic or language term using current knowledge.", schema: z.object({ term: z.string().min(1) }) },
  tonto_format: { description: "Preview the current language formatter output without saving.", schema: z.object(model) },
  tonto_digest: { description: "Summarize declarations in the linked model and its diagnostics.", schema: z.object(model) },
  tonto_repair: { description: "Preview unambiguous editor repairs, revalidate and return unsaved source.", schema: z.object(model) },
  tonto_gufo: { description: "Preview the existing OntoUML gUFO transformation without writing files.", schema: z.object({ ...model, label: z.string().optional(), description: z.string().optional() }) },
};
export type TontoToolName = keyof typeof toolDefinitions;
export const vscodeToolNames = (Object.keys(toolDefinitions) as TontoToolName[]).filter(name => name !== "tonto_hold");

/** The same schema parsing and implementation serve MCP and VS Code. */
export class TontoAgentHandlers {
  readonly workspace: TontoMcpWorkspace;
  constructor(private readonly root: string) { this.workspace = new TontoMcpWorkspace(root); }
  async invoke(name: TontoToolName, raw: unknown, cancelled: () => boolean = () => false): Promise<unknown> {
    if (cancelled()) throw new Error("Tonto request cancelled.");
    const input = toolDefinitions[name].schema.parse(raw);
    const result = await this.execute(name, input);
    if (cancelled()) throw new Error("Tonto request cancelled.");
    return result;
  }
  private async execute(name: TontoToolName, input: Record<string, unknown>): Promise<unknown> {
    const parsed = input as { source?: string; path?: string };
    switch (name) {
      case "tonto_validate": return this.workspace.validate(parsed);
      case "tonto_ast": return this.workspace.ast(parsed);
      case "tonto_apply": return this.workspace.apply(input as z.infer<typeof toolDefinitions.tonto_apply.schema>);
      case "tonto_diff": return this.workspace.diff(input as z.infer<typeof toolDefinitions.tonto_diff.schema>);
      case "tonto_hold": return this.workspace.hold(input.path as string, input.source as string | undefined);
      case "tonto_complete": return this.workspace.complete(input as z.infer<typeof toolDefinitions.tonto_complete.schema>);
      case "tonto_guide": return knowledge.guide;
      case "tonto_rules": return knowledge.rules;
      case "tonto_tables": return knowledge.tables;
      case "tonto_patterns": return { ...knowledge.patterns, examples: await Promise.all(knowledge.patterns.examples.map(async example => ({ ...example, ...await this.workspace.validate({ source: example.source }) }))) };
      case "tonto_explain": {
        const term = String(input.term).toLowerCase();
        const rules = Object.entries(knowledge.rules.rules).filter(([key, value]) => `${key} ${value}`.toLowerCase().includes(term));
        const lines = knowledge.guide.text.split("\n").filter(line => line.toLowerCase().includes(term));
        return { term: input.term, rules, guide: lines, found: rules.length + lines.length > 0 };
      }
      case "tonto_format": {
        const built = await this.workspace.build(parsed);
        const edits = await built.services.Tonto.lsp.Formatter?.formatDocument(built.document, {
          textDocument: { uri: built.uri }, options: { tabSize: 2, insertSpaces: true },
        }) ?? [];
        const source = applyModelEdits(built.document.textDocument, edits);
        return { source, saved: false, edits, ...await this.workspace.validate({ path: URI.parse(built.uri).fsPath, source }) };
      }
      case "tonto_digest": {
        const built = await this.workspace.build(parsed);
        return { uri: built.uri, ...digestDocuments(built.documents, built.uri), diagnostics: built.diagnostics };
      }
      case "tonto_repair": {
        const built = await this.workspace.build(parsed);
        let source = built.document.textDocument.getText();
        const edits = built.repairs.filter(repair => built.repairs.filter(other => other.diagnosticIndex === repair.diagnosticIndex).length === 1).flatMap(repair => repair.edits);
        try { source = applyModelEdits(built.document.textDocument, edits); }
        catch { return { source, saved: false, applied: false, reason: "Unambiguous repairs overlap; apply one with tonto_apply.", ...await this.workspace.validate(parsed) }; }
        return { source, saved: false, applied: edits.length > 0, ...await this.workspace.validate({ path: URI.parse(built.uri).fsPath, source }) };
      }
      case "tonto_gufo": {
        const built = await this.workspace.build(parsed);
        if (built.diagnostics.some(d => d.severity === 1)) return { available: false, saved: false, reason: "Fix project errors before gUFO transformation.", diagnostics: built.diagnostics };
        try {
          const project = parseProjectModular({ models: built.documents.filter(doc => doc.uri.scheme === "file" && isModel(doc.parseResult.value)).map(doc => doc.parseResult.value as import("../language/generated/ast.js").Model), manifest: readOrCreateDefaultTontoManifest(this.root), folderAbsolutePath: this.root, fileNode: new CompositeGeneratorNode(), label: input.label as string | undefined, description: input.description as string | undefined });
          const response = await TransformTontoToGufo(project);
          return { available: "result" in response, saved: false, ...response };
        } catch (error) { return { available: false, saved: false, reason: error instanceof Error ? error.message : String(error) }; }
      }
    }
  }
}
