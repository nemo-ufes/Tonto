import { EmptyFileSystem, LangiumDocument } from "langium";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { CodeAction, Diagnostic, Position, TextDocument, TextEdit } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { getTontoProjectSourceFiles } from "../cli/utils/buildFolderDocuments.js";
import { readOrCreateDefaultTontoManifest } from "../cli/utils/readManifest.js";
import { builtInLibs } from "../language/workspace/builtins/index.js";
import { createTontoServices } from "../language/tonto-module.js";

export type ModelInput = { source?: string; path?: string };
type LocatedDiagnostic = Diagnostic & { uri: string };

/** Each request uses a fresh Langium workspace so changed files never leave a stale index. */
export class TontoMcpWorkspace {
  private readonly held = new Map<string, string>();
  constructor(private readonly rootPath: string) {}

  private assertInside(root: string, file: string): void {
    const relative = path.relative(root, file);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("Model paths must stay inside the MCP project root.");
    }
  }

  private async modelPath(file = "__mcp_model__.tonto"): Promise<string> {
    const root = await realpath(this.rootPath);
    const resolved = path.resolve(root, file);
    this.assertInside(root, resolved);
    if (path.extname(resolved) !== ".tonto") {
      throw new Error("Model paths must have the .tonto extension.");
    }
    // Check the nearest existing ancestor too, including symlinks for unsaved paths.
    let ancestor = resolved;
    while (true) {
      try {
        this.assertInside(root, await realpath(ancestor));
        break;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        ancestor = path.dirname(ancestor);
      }
    }
    return resolved;
  }

  async hold(file: string, source?: string) {
    const resolved = await this.modelPath(file);
    if (source === undefined) this.held.delete(resolved);
    else this.held.set(resolved, source);
    return { held: [...this.held.keys()].map((file) => URI.file(file).toString()) };
  }

  async build(input: ModelInput) {
    if (input.source === undefined && input.path === undefined) {
      throw new Error("Provide source or path.");
    }
    const root = await realpath(this.rootPath);
    const targetPath = await this.modelPath(input.path);
    const sources = new Map<string, string>();
    const files = await getTontoProjectSourceFiles(root, readOrCreateDefaultTontoManifest(root));
    for (const file of files.sort()) {
      await this.modelPath(file);
      if (!(await stat(file)).isFile()) continue;
      sources.set(file, await readFile(file, "utf8"));
    }
    for (const [file, source] of this.held) sources.set(file, source);
    if (input.source !== undefined) sources.set(targetPath, input.source);
    if (!sources.has(targetPath)) sources.set(targetPath, await readFile(targetPath, "utf8"));

    const services = createTontoServices(EmptyFileSystem);
    const documents: LangiumDocument[] = [];
    for (const lib of builtInLibs) {
      documents.push(services.shared.workspace.LangiumDocumentFactory.fromString(lib.content, URI.parse(lib.uri)));
    }
    for (const [file, source] of sources) {
      documents.push(services.shared.workspace.LangiumDocumentFactory.fromString(source, URI.file(file)));
    }
    for (const document of documents) services.shared.workspace.LangiumDocuments.addDocument(document);
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    const uri = URI.file(targetPath).toString();
    const document = documents.find((item) => item.uri.toString() === uri);
    if (!document) throw new Error("Target model was not loaded.");
    const diagnostics: LocatedDiagnostic[] = documents.flatMap((item) =>
      (item.diagnostics ?? []).map((diagnostic) => ({ ...diagnostic, uri: item.uri.toString() }))
    );
    const repairs: { diagnosticIndex: number; title: string; edits: TextEdit[] }[] = [];
    for (const [diagnosticIndex, diagnostic] of (document.diagnostics ?? []).entries()) {
      const actions = await services.Tonto.lsp.CodeActionProvider?.getCodeActions(document, {
        textDocument: { uri }, range: diagnostic.range, context: { diagnostics: [diagnostic] },
      });
      for (const action of actions ?? []) {
        if (!CodeAction.is(action)) continue;
        const edits = action.edit?.changes?.[uri];
        if (edits?.length) repairs.push({ diagnosticIndex, title: action.title, edits });
      }
    }
    return { services, document, uri, diagnostics, repairs };
  }

  async validate(input: ModelInput) {
    const result = await this.build(input);
    return this.validationResult(result);
  }

  private validationResult(result: Awaited<ReturnType<TontoMcpWorkspace["build"]>>) {
    return {
      uri: result.uri,
      valid: !result.diagnostics.some((diagnostic) => diagnostic.severity === 1),
      diagnostics: result.diagnostics,
      targetDiagnostics: result.document.diagnostics ?? [],
      repairs: result.repairs,
    };
  }

  async ast(input: ModelInput) {
    const result = await this.build(input);
    const ast: unknown = JSON.parse(result.services.Tonto.serializer.JsonSerializer.serialize(
      result.document.parseResult.value, { refText: true, textRegions: true }
    ));
    return { ...this.validationResult(result), ast };
  }

  async apply(input: ModelInput & { edits?: TextEdit[]; diagnosticIndex?: number; repairTitle?: string }) {
    if ((input.edits !== undefined) === (input.diagnosticIndex !== undefined)) {
      throw new Error("Provide either edits or diagnosticIndex, exclusively.");
    }
    const result = await this.build(input);
    const choices = result.repairs.filter((repair) => repair.diagnosticIndex === input.diagnosticIndex &&
      (input.repairTitle === undefined || repair.title === input.repairTitle));
    if (!input.edits && choices.length !== 1) throw new Error("Select exactly one available repair.");
    const edits = input.edits ?? choices[0].edits;
    const source = applyModelEdits(result.document.textDocument, edits);
    return { source, saved: false, ...await this.validate({ path: URI.parse(result.uri).fsPath, source }) };
  }

  async complete(input: ModelInput & { line: number; character: number }) {
    const result = await this.build(input);
    checkPosition(result.document.textDocument, input);
    const completion = await result.services.Tonto.lsp.CompletionProvider?.getCompletion(result.document, {
      textDocument: { uri: result.uri }, position: { line: input.line, character: input.character },
    });
    return { uri: result.uri, completion: completion ?? { isIncomplete: false, items: [] } };
  }

  async diff(input: { before: string; after: string; path?: string }) {
    const before = await this.validate({ path: input.path, source: input.before });
    const after = await this.validate({ path: input.path, source: input.after });
    const remaining = [...before.diagnostics];
    const introduced: LocatedDiagnostic[] = [];
    const unchanged: LocatedDiagnostic[] = [];
    for (const diagnostic of after.diagnostics) {
      const index = remaining.findIndex((previous) => previous.uri === diagnostic.uri &&
        previous.code === diagnostic.code && previous.message === diagnostic.message &&
        previous.severity === diagnostic.severity);
      if (index === -1) introduced.push(diagnostic);
      else { remaining.splice(index, 1); unchanged.push(diagnostic); }
    }
    return { valid: after.valid, introduced, resolved: remaining, unchanged };
  }
}

function checkPosition(document: TextDocument, position: Position): void {
  const lines = document.getText().split(/\r\n|\r|\n/);
  if (!Number.isInteger(position.line) || !Number.isInteger(position.character) ||
      position.line < 0 || position.line >= lines.length || position.character < 0 ||
      position.character > lines[position.line].length) {
    throw new Error("Position is outside the model (use zero-based UTF-16 positions).");
  }
}

export function applyModelEdits(document: TextDocument, edits: TextEdit[]): string {
  const offsets = edits.map((edit) => {
    checkPosition(document, edit.range.start);
    checkPosition(document, edit.range.end);
    const start = document.offsetAt(edit.range.start);
    const end = document.offsetAt(edit.range.end);
    if (end < start) throw new Error("Edit range ends before it starts.");
    return { start, end };
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < offsets.length; index++) {
    if (offsets[index].start < offsets[index - 1].end || offsets[index].start === offsets[index - 1].start) {
      throw new Error("Edit ranges overlap or share a start position.");
    }
  }
  return TextDocument.applyEdits(document, edits);
}
