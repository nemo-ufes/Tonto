import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  buildTontoDiagramGraph, loadTontoDiagramWorkspace, parseTontoDiagramSpec,
  type TontoDiagramGraph, type TontoDiagramSpec, type TontoDiagramIssue,
} from "tonto-cli";
import { projectSvgView } from "tonto-cli/lib/view/projection.js";
import { legacyGraphToSvgView, legacySpecToViewFile, canonicalizeLegacyViewFile } from "tonto-cli/lib/view/model/legacy.js";
import { readViewFile, emptyViewFile, reconcile, type ViewFile } from "tonto-cli/lib/view/model/viewfile.js";
import { placeNewNodes, sizeOf, autoLayout, applyLayoutConstraints, render, darkTheme, lightTheme } from "tonto-cli/lib/view/canvas/index.js";
import { invalidateMovedRoutes } from "tonto-cli/lib/view/model/routes.js";
import { contentAfter, expandInverseIds } from "tonto-cli/lib/view/model/index.js";
import { filterItemsOf, filterView } from "./recovered-filters.js";
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
          void panel.panel.webview.postMessage({ type: "select", ids });
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
      await this.sendNative(state, base);
      try {
        const resolved = await this.resolveState(state.document, text);
        if (state.disposed || version !== state.requestVersion) return;
        state.sourcePath = resolved.graph?.projectRoot;
        if (resolved.issues.some(issue => issue.severity === "error") && state.last?.viewModel) {
          await this.sendNative(state, { ...state.last, documentText: text, status: "error", issues: resolved.issues });
          return;
        }
        state.last = resolved;
        await this.sendNative(state, resolved);
      } catch (error) {
        if (!state.disposed && version === state.requestVersion) await this.sendNative(state, { ...base, status: "error", issues: [{ severity: "error", message: error instanceof Error ? error.message : String(error) }] });
      }
    });
  }

  /** Send the recovered panel's native protocol, without the previous editor shell. */
  private async sendNative(state: PanelState, snapshot: DocumentState): Promise<void> {
    const catalog = snapshot.viewModel ?? { nodes: [], edges: [], groups: [], gensets: [] };
    const file = snapshot.arrangement ?? emptyViewFile();
    const view = filterView(catalog, file.content.hidden ?? []);
    const positions = placeNewNodes(view, Object.fromEntries(view.nodes.map(node => [node.id, sizeOf(node, file.display)])), file.nodes);
    await state.panel.webview.postMessage({ type: "model", view, positions,
      routes: file.edges, display: file.display, content: file.content, layout: file.layout,
      constraints: file.constraints, packages: snapshot.graph?.workspace.packages.map(pkg => pkg.name) ?? [],
      filters: filterItemsOf(catalog), viewport: file.viewport, fit: !file.viewport,
      ...(snapshot.status === "error" ? { stale: snapshot.issues.map(issue => issue.message).join("\n") } : {}) });
  }

  private async receiveNative(state: PanelState, message: Message): Promise<boolean> {
    const type = message.type;
    const accepted = ["moved", "rerouted", "viewport", "display", "content", "layout", "hide", "show", "pin", "constraint", "autoLayout", "undo", "redo", "export", "moveToNewWindow"];
    if (!accepted.includes(type)) return false;
    if (type === "undo" || type === "redo" || type === "moveToNewWindow") {
      state.panel.reveal(state.panel.viewColumn, false);
      await vscode.commands.executeCommand(type === "moveToNewWindow" ? "workbench.action.moveEditorToNewWindow" : type);
      return true;
    }
    if (this.isLegacy(state.document)) return true;
    const file = this.parseView(state.document.getText());
    const catalog = state.last?.viewModel ?? { nodes: [], edges: [], groups: [], gensets: [] };
    const view = filterView(catalog, file.content.hidden ?? []);
    const sizes = Object.fromEntries(view.nodes.map(node => [node.id, sizeOf(node, file.display)]));
    const positions = placeNewNodes(view, sizes, file.nodes);
    const knownNodes = new Set(catalog.nodes.map(node => node.id));
    const knownEdges = new Set(catalog.edges.map(edge => edge.id));
    const ids = stringList(message.ids) ? [...new Set(message.ids)] : [];
    const selectedNodes = ids.filter(id => knownNodes.has(id));
    if (type === "export") {
      const target = await vscode.window.showSaveDialog({ defaultUri: state.document.uri.with({ path: state.document.uri.path.replace(/\.tontoview$/, ".svg") }), filters: { SVG: ["svg"], PNG: ["png"] } });
      if (target) {
        const dark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
        const { svg } = render({ view, positions, routes: file.edges, display: file.display, direction: file.layout.direction, theme: dark ? darkTheme : lightTheme });
        await vscode.workspace.fs.writeFile(target, target.path.toLowerCase().endsWith(".png") ? await this.rasterize(state, svg) : Buffer.from(svg));
      }
      return true;
    }
    if (type === "moved" && isRecord(message.positions)) {
      for (const [id, value] of Object.entries(message.positions)) {
        if (!knownNodes.has(id) || !isRecord(value) || ![value.x, value.y].every(n => typeof n === "number" && Number.isFinite(n))) continue;
        const old = file.nodes[id] ?? positions[id];
        file.nodes[id] = { ...old, x: Number(value.x), y: Number(value.y) };
        for (const dimension of ["width", "height"] as const) {
          if (typeof value[dimension] === "number" && Number.isFinite(value[dimension]) && Number(value[dimension]) > 0) file.nodes[id][dimension] = Number(value[dimension]);
          else if (message.resized === true) delete file.nodes[id][dimension];
        }
      }
      file.edges = invalidateMovedRoutes(file, catalog, Object.keys(message.positions));
      if (stringList(message.rerouted)) for (const id of message.rerouted) if (knownEdges.has(id)) delete file.edges[id];
    } else if (type === "rerouted" && typeof message.edge === "string" && knownEdges.has(message.edge)) {
      if (isRecord(message.route)) {
        const next = readViewFile({ ...file, edges: { [message.edge]: message.route } });
        file.edges[message.edge] = next.edges[message.edge];
      } else delete file.edges[message.edge];
    } else if (type === "viewport" && isRecord(message.viewport)) {
      file.viewport = readViewFile({ ...file, viewport: message.viewport }).viewport;
    } else if (type === "display" && isRecord(message.display)) {
      const previous = file.display;
      file.display = readViewFile({ ...file, display: { ...file.display, ...message.display } }).display;
      if (previous.routing !== file.display.routing) {
        for (const edge of catalog.edges) delete file.edges[edge.id];
      } else {
        const after = placeNewNodes(view, Object.fromEntries(view.nodes.map(node => [node.id, sizeOf(node, file.display)])), file.nodes);
        file.edges = invalidateMovedRoutes(file, catalog, view.nodes.filter(node => positions[node.id]?.width !== after[node.id]?.width || positions[node.id]?.height !== after[node.id]?.height).map(node => node.id), after);
      }
    } else if (type === "content" && isRecord(message.content)) {
      file.content = contentAfter(file.content, readViewFile({ ...file, content: { ...file.content, ...message.content } }).content);
    } else if (type === "hide" || type === "show") {
      const hidden = new Set(file.content.hidden ?? []);
      const expanded = expandInverseIds(catalog.edges, ids.filter(id => knownNodes.has(id) || knownEdges.has(id)));
      for (const id of expanded) { if (type === "hide") hidden.add(id); else hidden.delete(id); }
      file.content.hidden = [...hidden];
    } else if (type === "pin" && typeof message.pinned === "boolean") {
      const pinned = new Set(file.constraints.pinned);
      for (const id of selectedNodes) { if (message.pinned) pinned.add(id); else pinned.delete(id); }
      file.constraints.pinned = [...pinned].sort();
    } else if (type === "constraint" && typeof message.action === "string" && ["align-x", "align-y", "distribute-x", "distribute-y", "clear"].includes(message.action)) {
      const selected = new Set(selectedNodes);
      const axis = message.action.endsWith("-x") ? "x" : "y";
      const trim = (groups: typeof file.constraints.alignments, minimum: number) => groups.map(group => message.action === "clear" || group.axis === axis ? { ...group, nodes: group.nodes.filter(id => !selected.has(id)) } : group).filter(group => group.nodes.length >= minimum);
      file.constraints.alignments = trim(file.constraints.alignments, 2);
      file.constraints.distributions = trim(file.constraints.distributions, 3);
      if (message.action === "clear") file.constraints.pinned = file.constraints.pinned.filter(id => !selected.has(id));
      else if (message.action.startsWith("align") && selectedNodes.length >= 2) file.constraints.alignments.push({ axis, nodes: selectedNodes });
      else if (selectedNodes.length >= 3) file.constraints.distributions.push({ axis, nodes: selectedNodes });
      applyLayoutConstraints(positions, file.constraints, { direction: file.layout.direction });
      for (const [id, position] of Object.entries(positions)) file.nodes[id] = { ...file.nodes[id], x: position.x, y: position.y };
      file.edges = invalidateMovedRoutes(file, catalog, selectedNodes);
    } else if (type === "layout" || type === "autoLayout") {
      if (type === "layout" && isRecord(message.layout)) file.layout = readViewFile({ ...file, layout: { ...file.layout, ...message.layout } }).layout;
      const documentVersion = state.document.version;
      const generation = state.requestVersion;
      const only = stringList(message.only) ? message.only.filter(id => knownNodes.has(id)) : undefined;
      const result = await autoLayout(view, sizes, positions, { ...file.layout, only, constraints: file.constraints, routing: file.display.routing, taxonomyOnly: file.display.taxonomyOnly, packageContainers: file.display.showPackageGroups });
      if (state.disposed || state.document.version !== documentVersion || state.requestVersion !== generation) return true;
      for (const [id, position] of Object.entries(result.positions)) file.nodes[id] = { ...file.nodes[id], x: position.x, y: position.y };
      file.edges = invalidateMovedRoutes(file, catalog, only ?? view.nodes.map(node => node.id));
      for (const [id, points] of Object.entries(result.routes)) file.edges[id] = { ...file.edges[id], points };
    } else return true;
    await this.writeView(state.document, readViewFile(file));
    return true;
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
    if (value.type === "ready") { this.sendTheme(state); this.enqueue(state); return; }
    if (value.type === "raster") {
      if (typeof value.id !== "number") return;
      const pending = this.rasters.get(value.id);
      if (!pending || pending.panel !== state) return;
      clearTimeout(pending.timer); this.rasters.delete(value.id);
      if (typeof value.data === "string" && /^[A-Za-z0-9+/=]+$/.test(value.data) && value.data.length < 64 * 1024 * 1024) pending.resolve(Buffer.from(String(value.data), "base64"));
      else pending.reject(new Error(typeof value.error === "string" ? value.error : "Invalid PNG response."));
      return;
    }
    if (value.type === "reveal" && typeof value.id === "string") {
      const model = state.last?.viewModel;
      const location = model?.nodes.find(node => node.id === value.id)?.source ?? model?.edges.find(edge => edge.id === value.id)?.source_;
      if (location) {
        const source = await vscode.workspace.openTextDocument(vscode.Uri.parse(location.uri));
        await vscode.window.showTextDocument(source, { viewColumn: vscode.ViewColumn.One, selection: new vscode.Range(location.line, location.character, location.endLine, location.endCharacter) });
      }
      return;
    }
    if (value.type === "selected") return;
    if (await this.receiveNative(state, value)) return;
  }

  private rasterize(state: PanelState, svg: string): Promise<Uint8Array> {
    const id = ++this.rasterId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.rasters.delete(id); reject(new Error("PNG export timed out.")); }, 15000);
      this.rasters.set(id, { panel: state, resolve, reject, timer });
      void state.panel.webview.postMessage({ type: "rasterise", id, svg, scale: 2 });
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link href="${styleUri}" rel="stylesheet">
<title>Tonto diagram</title>
</head>
<body>
<div id="shell">
    <div id="toolbar">
        <button id="fit" title="Fit to view" aria-pressed="false">Fit</button>
        <button id="arrange" title="Arrange the whole diagram automatically">Arrange</button>
        <button id="newWindow" class="icon-button" title="Move into a New Window" aria-label="Move into a New Window">
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M 9.5 2.5 H 13.5 V 6.5 M 13.5 2.5 L 7 9 M 11.5 8.5 V 13.5 H 2.5 V 4.5 H 7.5"></path>
            </svg>
        </button>
        <span class="distance-control" role="group" aria-label="Association distance">
            <button id="distanceDown" title="Reduce association distance">−</button>
            <span id="distance" class="distance" title="Association distance used by Arrange">Distance 100%</span>
            <button id="distanceUp" title="Increase association distance">+</button>
        </span>
        <button id="zoomOut" title="Zoom out">−</button>
        <span id="scale" class="scale">100%</span>
        <button id="zoomIn" title="Zoom in">+</button>
        <button id="hide" title="Hide the selected classes or associations" disabled>Hide</button>
        <button id="optionsButton" title="What is drawn">⚙</button>
        <button id="exportButton" title="Export as SVG or PNG">Export</button>
        <span class="spacer"></span>
        <span id="stale" class="stale" hidden></span>
    </div>
    <div id="options" class="panel" hidden></div>
    <div id="viewport">
        <div id="canvas"></div>
    </div>
    <div id="legend" class="legend" hidden></div>
</div>
<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
