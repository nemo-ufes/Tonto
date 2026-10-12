import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  buildTontoDiagramGraph, loadTontoDiagramWorkspace, parseTontoDiagramSpec, serializeTontoDiagramSpec,
  updateTontoDiagramLayout, type TontoDiagramGraph, type TontoDiagramSpec, type TontoDiagramIssue,
} from "tonto-cli";
import { projectSvgView } from "tonto-cli/lib/view/projection.js";
import { legacyGraphToSvgView, legacySpecToViewFile, canonicalizeLegacyViewFile } from "tonto-cli/lib/view/model/legacy.js";
import { readViewFile, emptyViewFile, reconcile, type ViewFile } from "tonto-cli/lib/view/model/viewfile.js";
import type { ViewModel } from "tonto-cli/lib/view/model/model.js";
import * as vscode from "vscode";
import { isTontoSourceInDiagramScope } from "./tontodiagram-source-scope.js";
import { inferViewSource, namedViewPath } from "./view-paths.js";

type DocumentState = {
  type: "documentState"; status: "loading" | "ready" | "error"; documentText: string;
  graph?: TontoDiagramGraph; viewModel?: ViewModel; arrangement?: ViewFile; isLegacy: boolean;
  issues: TontoDiagramIssue[];
};
type PanelState = {
  panel: vscode.WebviewPanel; document: vscode.TextDocument; sourcePath?: string; requestVersion: number;
  disposed: boolean; queue: Promise<void>; last?: DocumentState;
};
type Message = { type: string; [key: string]: unknown };
const isRecord = (value: unknown): value is Message => typeof value === "object" && value !== null && !Array.isArray(value);
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");

export class TontoDiagramEditorProvider implements vscode.CustomTextEditorProvider, vscode.Disposable {
  static readonly viewType = "tonto.diagram.editor";
  static readonly viewFileType = "tonto.view.editor";
  private readonly panels = new Set<PanelState>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private rasterId = 0;
  private readonly rasters = new Map<number, { panel: PanelState; resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly context: vscode.ExtensionContext) {
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.tonto");
    this.disposables.push(watcher, watcher.onDidCreate(uri => this.scheduleSource(uri.fsPath)),
      watcher.onDidChange(uri => this.scheduleSource(uri.fsPath)), watcher.onDidDelete(uri => this.scheduleSource(uri.fsPath)),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.path.endsWith(".tonto")) this.scheduleSource(event.document.uri.fsPath);
        else if (this.isDiagram(event.document)) this.refreshDocument(event.document);
      }),
      vscode.workspace.onDidSaveTextDocument(document => {
        if (document.uri.path.endsWith(".tonto")) this.scheduleSource(document.uri.fsPath);
      }),
      vscode.workspace.onDidCloseTextDocument(document => {
        if (document.uri.path.endsWith(".tonto")) this.scheduleSource(document.uri.fsPath);
      }),
      vscode.window.onDidChangeTextEditorSelection(event => {
        const position = event.selections[0]?.active;
        if (!position) return;
        for (const panel of this.panels) {
          const ids = panel.last?.viewModel?.nodes.filter(node => {
            const location = node.source;
            return location?.uri === event.textEditor.document.uri.toString() && position.line >= location.line &&
              position.line <= location.endLine;
          }).map(node => node.id) ?? [];
          void panel.panel.webview.postMessage({ type: "selectElements", ids });
        }
      }),
      vscode.window.onDidChangeActiveColorTheme(() => {
        for (const panel of this.panels) this.sendTheme(panel);
      }),
      vscode.commands.registerCommand("tonto.view.convert", async (resource?: vscode.Uri) => {
        const document = resource ? await vscode.workspace.openTextDocument(resource) :
          vscode.window.activeTextEditor?.document ?? [...this.panels].find(panel => panel.panel.active)?.document;
        if (document?.uri.path.endsWith(".tontodiagram")) await this.convert(document);
        else void vscode.window.showErrorMessage("Open a .tontodiagram to convert it.");
      }),
      vscode.commands.registerCommand("tonto.view.open", () => this.chooseView()),
      vscode.commands.registerCommand("tonto.view.saveAs", () => this.saveNamedView()),
    );
  }

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new TontoDiagramEditorProvider(context);
    const options = { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true };
    return vscode.Disposable.from(provider,
      vscode.window.registerCustomEditorProvider(this.viewFileType, provider, options));
  }

  dispose(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    for (const raster of this.rasters.values()) { clearTimeout(raster.timer); raster.reject(new Error("Diagram closed.")); }
    for (const panel of this.panels) panel.panel.dispose();
    vscode.Disposable.from(...this.disposables).dispose();
    this.panels.clear(); this.rasters.clear();
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    if (document.uri.scheme !== "file") throw new Error("Tonto views require a filesystem workspace.");
    panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "pack", "webview")] };
    panel.webview.html = createDiagramEditorHtml(this.context.extensionUri, panel.webview);
    const state: PanelState = { panel, document, requestVersion: 0, disposed: false, queue: Promise.resolve() };
    this.panels.add(state);
    panel.onDidDispose(() => {
      state.disposed = true; this.panels.delete(state);
      for (const [id, raster] of this.rasters) if (raster.panel === state) {
        clearTimeout(raster.timer); raster.reject(new Error("Diagram closed.")); this.rasters.delete(id);
      }
    });
    panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.receive(state, message).catch(error => vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)));
    });
    if (!this.isLegacy(document)) await this.ensureSource(document);
    this.enqueue(state);
  }

  private isLegacy(document: vscode.TextDocument): boolean { return document.uri.path.endsWith(".tontodiagram"); }
  private isDiagram(document: vscode.TextDocument): boolean { return /\.tonto(diagram|view)$/.test(document.uri.path); }
  private sendTheme(state: PanelState): void {
    void state.panel.webview.postMessage({ type: "theme", dark: vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Light && vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.HighContrastLight });
  }
  private scheduleSource(source: string): void {
    clearTimeout(this.pending.get(source));
    // Invalidate immediately: a queued build must not briefly show obsolete buffers.
    for (const panel of this.panels) if (!panel.sourcePath || isTontoSourceInDiagramScope(source, panel.sourcePath)) panel.requestVersion++;
    this.pending.set(source, setTimeout(() => {
      this.pending.delete(source);
      for (const panel of this.panels) if (!panel.sourcePath || isTontoSourceInDiagramScope(source, panel.sourcePath)) this.enqueue(panel);
    }, 300));
  }
  private refreshDocument(document: vscode.TextDocument): void {
    for (const panel of this.panels) if (panel.document.uri.toString() === document.uri.toString()) this.enqueue(panel);
  }
  private enqueue(state: PanelState): void {
    const version = ++state.requestVersion;
    state.queue = state.queue.catch(() => undefined).then(async () => {
      if (state.disposed || version !== state.requestVersion) return;
      const text = state.document.getText();
      const base: DocumentState = { ...state.last, type: "documentState", status: "loading", documentText: text, isLegacy: this.isLegacy(state.document), issues: [] };
      await state.panel.webview.postMessage(base);
      try {
        const resolved = await this.resolveState(state.document, text);
        if (state.disposed || version !== state.requestVersion) return;
        state.sourcePath = resolved.graph?.projectRoot;
        if (resolved.issues.some(issue => issue.severity === "error") && state.last?.viewModel) {
          await state.panel.webview.postMessage({ ...state.last, documentText: text, status: "error", issues: resolved.issues });
          return;
        }
        state.last = resolved;
        await state.panel.webview.postMessage(resolved);
      } catch (error) {
        if (!state.disposed && version === state.requestVersion) await state.panel.webview.postMessage({ ...base, status: "error", issues: [{ severity: "error", message: error instanceof Error ? error.message : String(error) }] });
      }
    });
  }

  private overlays(): Map<string, string> {
    return new Map(vscode.workspace.textDocuments.filter(document => document.uri.scheme === "file" && document.uri.path.endsWith(".tonto"))
      .map(document => [path.resolve(document.uri.fsPath), document.getText()]));
  }
  private async resolveState(document: vscode.TextDocument, text: string): Promise<DocumentState> {
    const isLegacy = this.isLegacy(document);
    let spec: TontoDiagramSpec;
    let arrangement: ViewFile;
    const issues: TontoDiagramIssue[] = [];
    if (isLegacy) {
      const parsed = parseTontoDiagramSpec(text);
      if (!parsed.spec) throw new Error(parsed.issues.map(issue => issue.message).join("\n"));
      spec = parsed.spec; issues.push(...parsed.issues);
      arrangement = emptyViewFile();
    } else {
      arrangement = this.parseView(text);
      const raw: unknown = JSON.parse(text);
      spec = this.viewSpec(arrangement, isRecord(raw) && typeof raw.title === "string" ? raw.title : path.basename(document.uri.fsPath, ".tontoview"));
    }
    const boundSource = spec.source ? vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), spec.source)) : document.uri;
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(boundSource)?.uri.fsPath;
    const workspace = await loadTontoDiagramWorkspace(spec.source, document.uri.fsPath, this.overlays(), workspaceRoot);
    const graph = await buildTontoDiagramGraph(spec, document.uri.fsPath, { workspace });
    issues.push(...graph.issues);
    let viewModel: ViewModel;
    if (isLegacy) {
      viewModel = legacyGraphToSvgView(graph);
      const semantic = projectSvgView(workspace.ontologyModels, { includedPackages: graph.packages, showExternalReferences: true, showDatatypes: true, hidden: [] });
      for (const node of viewModel.nodes) node.source = semantic.nodes.find(candidate => candidate.package === node.package && candidate.name === node.name)?.source;
      arrangement = legacySpecToViewFile(spec, graph, spec.source).file;
    } else {
      const includedPackages = arrangement.content.includedPackages ?? (arrangement.content.scope === "file" && workspace.sourceModel
        ? graph.workspace.packages.filter(pkg => pkg.sourcePath === workspace.sourcePath).map(pkg => pkg.name) : undefined);
      viewModel = projectSvgView(workspace.ontologyModels, { ...arrangement.content, hidden: [], includedPackages }, arrangement.focus);
      const reconciled = reconcile(arrangement, viewModel);
      if (reconciled.orphans.length) issues.push({ severity: "warning", message: `Saved placements no longer resolve: ${reconciled.orphans.join(", ")}. They remain in this view.` });
    }
    return { type: "documentState", status: issues.some(issue => issue.severity === "error") ? "error" : "ready", documentText: text, isLegacy, graph, viewModel, arrangement, issues };
  }

  private parseView(text: string): ViewFile {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || value.version !== 1) throw new Error("A Tonto view must be a version-1 JSON object.");
    return readViewFile(value);
  }
  private viewSpec(file: ViewFile, title: string): TontoDiagramSpec {
    return { title, source: file.source, imports: file.content.includedPackages ?? [],
      filter: { include: [], relations: [], external: file.content.showExternalReferences, datatypes: file.content.showDatatypes },
      presentation: { direction: file.layout.direction === "RIGHT" ? "LR" : "TB", stereotypes: file.display.showRelationStereotypes, attributes: file.display.showAttributes },
      nodes: Object.entries(file.nodes).map(([target, placement]) => ({ target: target.replaceAll("::", "."), x: placement.x, y: placement.y })),
      relations: [], viewport: file.viewport ?? { x: 0, y: 0, zoom: 1 } };
  }
  private async writeView(document: vscode.TextDocument, file: ViewFile): Promise<void> {
    const previous: unknown = JSON.parse(document.getText());
    // Preserve unknown extension fields rather than destroy another tool's metadata.
    await this.replace(document, JSON.stringify({ ...(isRecord(previous) ? previous : {}), ...file }, null, 2) + "\n");
  }
  private async replace(document: vscode.TextDocument, text: string): Promise<void> {
    if (text === document.getText()) return;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
    if (!await vscode.workspace.applyEdit(edit)) throw new Error("The diagram changed before this edit could be applied.");
    // VS Code owns dirty state, Save and Undo; a drag must never force a save.
  }
  private async ensureSource(document: vscode.TextDocument): Promise<void> {
    const file = this.parseView(document.getText());
    if (file.source) return;
    const parent = path.dirname(path.dirname(document.uri.fsPath));
    const names = (await vscode.workspace.fs.readDirectory(vscode.Uri.file(parent))).filter(([, type]) => type === vscode.FileType.File).map(([name]) => name);
    const inferred = inferViewSource(document.uri.fsPath, names);
    if (inferred) { file.source = path.relative(path.dirname(document.uri.fsPath), inferred).split(path.sep).join("/"); await this.writeView(document, file); return; }
    const selected = await vscode.window.showOpenDialog({ title: "Choose the Tonto source for this view", canSelectMany: false, filters: { Tonto: ["tonto"] } });
    if (!selected?.[0]) throw new Error("Choose a model source before opening this Tonto view.");
    file.source = path.relative(path.dirname(document.uri.fsPath), selected[0].fsPath).split(path.sep).join("/");
    await this.writeView(document, file);
  }

  private async receive(state: PanelState, value: unknown): Promise<void> {
    if (!isRecord(value) || typeof value.type !== "string" || state.disposed) return;
    const document = state.document;
    if (value.type === "ready") { this.sendTheme(state); this.enqueue(state); return; }
    if (value.type === "rasterized") {
      if (typeof value.id !== "number") return;
      const pending = this.rasters.get(value.id);
      if (!pending || pending.panel !== state) return;
      clearTimeout(pending.timer); this.rasters.delete(value.id);
      if (typeof value.dataUrl === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.dataUrl) && value.dataUrl.length < 64 * 1024 * 1024) pending.resolve(Buffer.from(value.dataUrl.split(",")[1], "base64"));
      else pending.reject(new Error(typeof value.error === "string" ? value.error : "Invalid PNG response."));
      return;
    }
    if (value.type === "revealSource" && typeof value.id === "string") {
      const model = state.last?.viewModel;
      const location = model?.nodes.find(node => node.id === value.id)?.source ?? model?.edges.find(edge => edge.id === value.id)?.source_;
      if (location) {
        const source = await vscode.workspace.openTextDocument(vscode.Uri.parse(location.uri));
        await vscode.window.showTextDocument(source, { viewColumn: vscode.ViewColumn.One, selection: new vscode.Range(location.line, location.character, location.endLine, location.endCharacter) });
      }
      return;
    }
    if (value.type === "selection") return;
    if (value.type === "convertView") { await this.convert(document); return; }
    if (value.type === "requestExport" && (value.format === "svg" || value.format === "png" || value.format === "plantuml")) {
      if (value.format === "plantuml") { await vscode.commands.executeCommand("tonto.diagram.plantuml.openProject", vscode.Uri.file(state.last?.graph?.source ?? document.uri.fsPath)); return; }
      if (typeof value.svg !== "string" || value.svg.length > 16 * 1024 * 1024 || !value.svg.startsWith("<svg")) throw new Error("Export requires the current rendered SVG.");
      const target = await vscode.window.showSaveDialog({ defaultUri: document.uri.with({ path: document.uri.path.replace(/\.tonto(diagram|view)$/, `.${value.format}`) }), filters: { [value.format.toUpperCase()]: [value.format] } });
      if (!target) return;
      const bytes = value.format === "svg" ? Buffer.from(value.svg, "utf8") : await this.rasterize(state, value.svg);
      await vscode.workspace.fs.writeFile(target, bytes); return;
    }
    if (value.type === "updateSource" && typeof value.text === "string" && value.text.length < 8 * 1024 * 1024) {
      await this.replace(document, value.text); return;
    }
    if (value.type === "updateArrangement" && isRecord(value.arrangement)) {
      if (this.isLegacy(document)) { await this.convert(document); return; }
      const next = readViewFile(value.arrangement);
      // The canvas cannot change which filesystem source this editor is bound to.
      next.source = this.parseView(document.getText()).source;
      await this.writeView(document, next); return;
    }
    if (!this.isLegacy(document)) {
      const file = this.parseView(document.getText());
      if (value.type === "updateImports" && stringList(value.imports)) file.content.includedPackages = dedupeSorted(value.imports);
      else if (value.type === "updateInclude" && stringList(value.include)) {
        const ids = new Set(value.include);
        file.content.hidden = value.include.length ? (state.last?.viewModel?.nodes ?? []).filter(node => !ids.has(node.id) && !ids.has(`${node.package}.${node.name}`) && !ids.has(node.name)).map(node => node.id) : [];
      } else if (value.type === "updatePresentation") {
        if (typeof value.attributes === "boolean") file.display.showAttributes = value.attributes;
        if (typeof value.stereotypes === "boolean") file.display.showRelationStereotypes = value.stereotypes;
        if (value.direction === "TB" || value.direction === "LR") file.layout.direction = value.direction === "LR" ? "RIGHT" : "DOWN";
      } else if (value.type === "updateFilterFlags") {
        if (typeof value.external === "boolean") file.content.showExternalReferences = value.external;
        if (typeof value.datatypes === "boolean") file.content.showDatatypes = value.datatypes;
      } else if (value.type === "updateTitle" && typeof value.title === "string" && value.title.trim()) {
        const raw: unknown = JSON.parse(document.getText());
        await this.replace(document, JSON.stringify({ ...(isRecord(raw) ? raw : {}), title: value.title.trim() }, null, 2) + "\n"); return;
      } else return;
      await this.writeView(document, file); return;
    }
    const parsed = parseTontoDiagramSpec(document.getText());
    if (!parsed.spec) return;
    let spec = parsed.spec;
    if (value.type === "updateLayout" && Array.isArray(value.nodes)) {
      const nodes = value.nodes.filter(isRecord).filter(node => typeof node.specifier === "string" && typeof node.x === "number" && Number.isFinite(node.x) && typeof node.y === "number" && Number.isFinite(node.y));
      spec = updateTontoDiagramLayout(spec, nodes.map(node => ({ target: String(node.specifier), x: Number(node.x), y: Number(node.y) })));
    } else if (value.type === "updateImports" && stringList(value.imports)) spec.imports = dedupeSorted(value.imports);
    else if (value.type === "updateInclude" && stringList(value.include)) spec.filter.include = dedupeSorted(value.include);
    else if (value.type === "updateTitle" && typeof value.title === "string" && value.title.trim()) spec.title = value.title.trim();
    else if (value.type === "updatePresentation") {
      if (typeof value.attributes === "boolean") spec.presentation.attributes = value.attributes;
      if (typeof value.stereotypes === "boolean") spec.presentation.stereotypes = value.stereotypes;
      if (["TB", "BT", "LR", "RL"].includes(String(value.direction))) spec.presentation.direction = value.direction as TontoDiagramSpec["presentation"]["direction"];
    } else if (value.type === "updateFilterFlags") {
      if (typeof value.external === "boolean") spec.filter.external = value.external;
      if (typeof value.datatypes === "boolean") spec.filter.datatypes = value.datatypes;
    } else return;
    await this.replace(document, serializeTontoDiagramSpec(spec));
  }

  private rasterize(state: PanelState, svg: string): Promise<Uint8Array> {
    const id = ++this.rasterId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.rasters.delete(id); reject(new Error("PNG export timed out.")); }, 15000);
      this.rasters.set(id, { panel: state, resolve, reject, timer });
      void state.panel.webview.postMessage({ type: "rasterize", id, svg, scale: 2 });
    });
  }
  private async convert(document: vscode.TextDocument): Promise<void> {
    if (!this.isLegacy(document)) return;
    const resolved = await this.resolveState(document, document.getText());
    const parsed = parseTontoDiagramSpec(document.getText());
    if (!parsed.spec || !resolved.graph || !resolved.arrangement) return;
    const conversion = legacySpecToViewFile(parsed.spec, resolved.graph);
    if (conversion.unmapped.length) {
      const choice = await vscode.window.showWarningMessage(`Conversion needs review: ${conversion.unmapped.join("; ")}`, { modal: true }, "Create View");
      if (choice !== "Create View") return;
    }
    const source = resolved.graph.source;
    const suggested = source?.endsWith(".tonto") ? namedViewPath(source, parsed.spec.title) : path.join(path.dirname(document.uri.fsPath), "views", `${parsed.spec.title.replace(/[^\w.-]+/g, "-")}.tontoview`);
    const target = await vscode.window.showSaveDialog({ title: "Convert to Tonto View", defaultUri: vscode.Uri.file(suggested), filters: { "Tonto View": ["tontoview"] } });
    if (!target) return;
    conversion.file.source = source?.endsWith(".tonto") ? path.relative(path.dirname(target.fsPath), source).split(path.sep).join("/") : undefined;
    await this.createView(target, canonicalizeLegacyViewFile(conversion.file, resolved.graph));
  }
  private async createView(uri: vscode.Uri, file: ViewFile): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(uri, { overwrite: false });
    edit.insert(uri, new vscode.Position(0, 0), JSON.stringify(file, null, 2) + "\n");
    if (!await vscode.workspace.applyEdit(edit)) throw new Error("The target view already exists or could not be created.");
    await vscode.commands.executeCommand("vscode.openWith", uri, TontoDiagramEditorProvider.viewFileType);
  }
  private async chooseView(): Promise<void> {
    const files = await vscode.workspace.findFiles("**/views/*.tontoview");
    const chosen = await vscode.window.showQuickPick(files.map(uri => ({ label: path.basename(uri.fsPath), description: vscode.workspace.asRelativePath(uri), uri })), { title: "Open Tonto View" });
    if (chosen) await vscode.commands.executeCommand("vscode.openWith", chosen.uri, TontoDiagramEditorProvider.viewFileType);
  }
  private async saveNamedView(): Promise<void> {
    const active = [...this.panels].find(panel => panel.panel.active);
    if (!active) return;
    if (this.isLegacy(active.document)) { await this.convert(active.document); return; }
    const name = await vscode.window.showInputBox({ title: "Save as Named Tonto View", validateInput: value => /[\p{L}\p{N}]/u.test(value) ? undefined : "Enter a view name." });
    if (!name) return;
    const file = this.parseView(active.document.getText());
    const source = file.source ? path.resolve(path.dirname(active.document.uri.fsPath), file.source) : undefined;
    if (!source) throw new Error("Select a source model before saving a named view.");
    const target = namedViewPath(source, name);
    file.source = path.relative(path.dirname(target), source).split(path.sep).join("/");
    await this.createView(vscode.Uri.file(target), file);
  }
}
function createDiagramEditorHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "pack", "webview", "diagram-editor.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "pack", "webview", "style.css"));

    const nonce = randomBytes(18).toString("base64");
    return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${webview.cspSource} https://fonts.googleapis.com; font-src ${webview.cspSource} https://fonts.gstatic.com;">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
        <link rel="stylesheet" href="${styleUri}">
        <title>Tonto Diagram Editor</title>
    </head>
    <body>
        <div id="root" data-diagram-name="${escapeHtml(path.basename(extensionUri.fsPath))}"></div>
        <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
    </body>
</html>`;
}

function dedupeSorted(values: string[]): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
