import path from "node:path";
import {
    TontoDiagramDirection,
    TontoDiagramGraph,
    TontoDiagramIssue,
    TontoDiagramSpec,
    buildTontoDiagramGraph,
    parseTontoDiagramSpec,
    serializeTontoDiagramSpec,
    updateTontoDiagramLayout
} from "tonto-cli";
import * as vscode from "vscode";

type DiagramDocumentStateMessage = {
    type: "documentState";
    status: "loading" | "ready" | "error";
    documentText: string;
    graph?: TontoDiagramGraph;
    issues: TontoDiagramIssue[];
};

type DiagramReadyMessage = {
    type: "ready";
};

type DiagramSourceUpdateMessage = {
    type: "updateSource";
    text: string;
};

type DiagramLayoutUpdateMessage = {
    type: "updateLayout";
    nodes: Array<{
        id: string;
        specifier: string;
        x: number;
        y: number;
    }>;
};

type DiagramImportsUpdateMessage = {
    type: "updateImports";
    imports: string[];
};

type DiagramIncludeUpdateMessage = {
    type: "updateInclude";
    include: string[];
};

type DiagramPresentationUpdateMessage = {
    type: "updatePresentation";
    direction?: TontoDiagramDirection;
    stereotypes?: boolean;
    attributes?: boolean;
};

type DiagramFilterFlagsUpdateMessage = {
    type: "updateFilterFlags";
    external?: boolean;
    datatypes?: boolean;
};

type DiagramTitleUpdateMessage = {
    type: "updateTitle";
    title: string;
};

type DiagramExportRequestMessage = {
    type: "requestExport";
    format: "png" | "svg" | "plantuml";
};

type DiagramIncomingMessage =
    | DiagramReadyMessage
    | DiagramSourceUpdateMessage
    | DiagramLayoutUpdateMessage
    | DiagramImportsUpdateMessage
    | DiagramIncludeUpdateMessage
    | DiagramPresentationUpdateMessage
    | DiagramFilterFlagsUpdateMessage
    | DiagramTitleUpdateMessage
    | DiagramExportRequestMessage;

type DiagramEditorPanelState = {
    panel: vscode.WebviewPanel;
    sourcePath?: string;
    requestVersion: number;
    disposed: boolean;
};

export class TontoDiagramEditorProvider implements vscode.CustomTextEditorProvider, vscode.Disposable {
    public static readonly viewType = "tonto.diagram.editor";

    private readonly panelsByDocument = new Map<string, Set<DiagramEditorPanelState>>();
    private readonly documentsBySourcePath = new Map<string, Set<string>>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(async (event) => {
                if (event.document.languageId !== "tontodiagram") {
                    return;
                }

                await this.refreshDocumentEditors(event.document);
            }),
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                if (document.languageId === "tonto") {
                    await this.refreshEditorsForSourcePath(document.uri.fsPath);
                    return;
                }

                if (document.languageId === "tontodiagram") {
                    await this.refreshDocumentEditors(document);
                }
            }),
        );
    }

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new TontoDiagramEditorProvider(context);
        return vscode.Disposable.from(
            vscode.window.registerCustomEditorProvider(TontoDiagramEditorProvider.viewType, provider, {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: true,
            }),
            provider,
        );
    }

    public dispose(): void {
        for (const panelState of this.getPanelStates()) {
            panelState.panel.dispose();
        }

        vscode.Disposable.from(...this.disposables).dispose();
        this.disposables.length = 0;
        this.panelsByDocument.clear();
        this.documentsBySourcePath.clear();
    }

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "pack", "webview")],
        };
        webviewPanel.webview.html = createDiagramEditorHtml(this.context.extensionUri, webviewPanel.webview);

        const panelState: DiagramEditorPanelState = {
            panel: webviewPanel,
            requestVersion: 0,
            disposed: false,
        };
        this.registerPanel(document.uri, panelState);

        webviewPanel.onDidDispose(() => {
            panelState.disposed = true;
            this.unregisterPanel(document.uri, panelState);
        });

        webviewPanel.webview.onDidReceiveMessage(async (message: DiagramIncomingMessage) => {
            await this.handleIncomingMessage(document, message);
        });

        void this.pushDocumentState(document, panelState);
    }

    private async handleIncomingMessage(document: vscode.TextDocument, message: DiagramIncomingMessage): Promise<void> {
        if (message.type === "ready") {
            await this.refreshDocumentEditors(document);
            return;
        }

        if (message.type === "updateSource") {
            await this.replaceDocumentText(document, message.text);
            return;
        }

        if (message.type === "updateLayout") {
            const parsed = parseTontoDiagramSpec(document.getText());
            if (!parsed.spec) {
                return;
            }

            const updatedSpec = updateTontoDiagramLayout(
                parsed.spec,
                message.nodes.map((node) => ({
                    target: node.specifier,
                    x: node.x,
                    y: node.y,
                }))
            );

            await this.writeSpec(document, updatedSpec);
            return;
        }

        if (message.type === "updateImports") {
            await this.mutateSpec(document, (spec) => ({
                ...spec,
                imports: dedupeSorted(message.imports),
            }));
            return;
        }

        if (message.type === "updateInclude") {
            await this.mutateSpec(document, (spec) => ({
                ...spec,
                filter: {
                    ...spec.filter,
                    include: dedupeSorted(message.include),
                },
            }));
            return;
        }

        if (message.type === "updatePresentation") {
            await this.mutateSpec(document, (spec) => ({
                ...spec,
                presentation: {
                    direction: message.direction ?? spec.presentation.direction,
                    stereotypes: message.stereotypes ?? spec.presentation.stereotypes,
                    attributes: message.attributes ?? spec.presentation.attributes,
                },
            }));
            return;
        }

        if (message.type === "updateFilterFlags") {
            await this.mutateSpec(document, (spec) => ({
                ...spec,
                filter: {
                    ...spec.filter,
                    external: message.external ?? spec.filter.external,
                    datatypes: message.datatypes ?? spec.filter.datatypes,
                },
            }));
            return;
        }

        if (message.type === "updateTitle") {
            const trimmed = message.title.trim();
            if (!trimmed) {
                return;
            }
            await this.mutateSpec(document, (spec) => ({
                ...spec,
                title: trimmed,
            }));
            return;
        }

        if (message.type === "requestExport") {
            await this.handleExportRequest(document, message.format);
            return;
        }
    }

    private async handleExportRequest(document: vscode.TextDocument, format: "png" | "svg" | "plantuml"): Promise<void> {
        if (format === "plantuml") {
            await vscode.commands.executeCommand("tonto.diagram.plantuml.openProject", document.uri);
            return;
        }

        // PNG/SVG are produced inside the webview from the live ReactFlow canvas;
        // when the webview offers a ready-made blob we'll forward it via showSaveDialog.
        // For now surface the format as a not-yet-wired notification so the UX
        // makes it obvious the request was received but the host needs more work.
        vscode.window.showInformationMessage(`Tonto diagram: ${format.toUpperCase()} export is handled in the webview.`);
    }

    private async mutateSpec(
        document: vscode.TextDocument,
        mutate: (spec: TontoDiagramSpec) => TontoDiagramSpec,
    ): Promise<void> {
        const parsed = parseTontoDiagramSpec(document.getText());
        if (!parsed.spec) {
            return;
        }
        const next = mutate({ ...parsed.spec, source: undefined });
        await this.writeSpec(document, next);
    }

    private async writeSpec(document: vscode.TextDocument, spec: TontoDiagramSpec): Promise<void> {
        const serialized = serializeTontoDiagramSpec(spec);
        if (serialized !== document.getText()) {
            await this.replaceDocumentText(document, serialized);
        }
    }

    private async refreshDocumentEditors(document: vscode.TextDocument): Promise<void> {
        const documentPanels = this.panelsByDocument.get(document.uri.toString());
        if (!documentPanels) {
            return;
        }

        await Promise.all(
            [...documentPanels].map(async (panelState) => {
                await this.pushDocumentState(document, panelState);
            }),
        );
    }

    private async refreshEditorsForSourcePath(sourcePath: string): Promise<void> {
        const affectedDocuments = this.documentsBySourcePath.get(sourcePath);
        if (!affectedDocuments) {
            return;
        }

        await Promise.all(
            [...affectedDocuments].map(async (documentKey) => {
                const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === documentKey);
                if (!document) {
                    return;
                }

                await this.refreshDocumentEditors(document);
            }),
        );
    }

    private async pushDocumentState(document: vscode.TextDocument, panelState: DiagramEditorPanelState): Promise<void> {
        const requestVersion = ++panelState.requestVersion;
        const immediateState = this.createImmediateDocumentState(document);

        if (panelState.disposed) {
            return;
        }

        await panelState.panel.webview.postMessage(immediateState.message);

        if (!immediateState.parsed.spec) {
            this.remapDocumentSource(document.uri.toString(), panelState.sourcePath, undefined);
            panelState.sourcePath = undefined;
            return;
        }

        const documentState = await this.createResolvedDocumentState(document, immediateState.parsed, immediateState.message);
        if (panelState.disposed || panelState.requestVersion !== requestVersion) {
            return;
        }

        this.remapDocumentSource(document.uri.toString(), panelState.sourcePath, documentState.graph?.source);
        panelState.sourcePath = documentState.graph?.source;

        await panelState.panel.webview.postMessage(documentState);
    }

    private createImmediateDocumentState(document: vscode.TextDocument): {
        parsed: ReturnType<typeof parseTontoDiagramSpec>;
        message: DiagramDocumentStateMessage;
    } {
        const parsed = parseTontoDiagramSpec(document.getText());
        return {
            parsed,
            message: {
                type: "documentState",
                status: parsed.spec ? "loading" : "error",
                documentText: document.getText(),
                issues: [...parsed.issues],
            },
        };
    }

    private async createResolvedDocumentState(
        document: vscode.TextDocument,
        parsed: ReturnType<typeof parseTontoDiagramSpec>,
        immediateState: DiagramDocumentStateMessage,
    ): Promise<DiagramDocumentStateMessage> {
        const issues = [...immediateState.issues];
        let graph: TontoDiagramGraph | undefined;
        let status: DiagramDocumentStateMessage["status"] = "ready";

        if (parsed.spec) {
            try {
                graph = await buildTontoDiagramGraph(parsed.spec, document.uri.fsPath);
                issues.push(...graph.issues);
            } catch (error) {
                status = "error";
                issues.push({
                    severity: "error",
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return {
            type: "documentState",
            status,
            documentText: immediateState.documentText,
            graph,
            issues,
        };
    }

    private registerPanel(documentUri: vscode.Uri, panelState: DiagramEditorPanelState): void {
        const documentKey = documentUri.toString();
        if (!this.panelsByDocument.has(documentKey)) {
            this.panelsByDocument.set(documentKey, new Set());
        }

        this.panelsByDocument.get(documentKey)?.add(panelState);
    }

    private unregisterPanel(documentUri: vscode.Uri, panelState: DiagramEditorPanelState): void {
        const documentKey = documentUri.toString();
        const documentPanels = this.panelsByDocument.get(documentKey);
        if (documentPanels) {
            documentPanels.delete(panelState);
            if (documentPanels.size === 0) {
                this.panelsByDocument.delete(documentKey);
            }
        }

        if (panelState.sourcePath) {
            const documents = this.documentsBySourcePath.get(panelState.sourcePath);
            documents?.delete(documentKey);
            if (documents && documents.size === 0) {
                this.documentsBySourcePath.delete(panelState.sourcePath);
            }
        }
    }

    private remapDocumentSource(documentKey: string, previousSourcePath: string | undefined, nextSourcePath: string | undefined): void {
        if (previousSourcePath) {
            const previousDocuments = this.documentsBySourcePath.get(previousSourcePath);
            previousDocuments?.delete(documentKey);
            if (previousDocuments && previousDocuments.size === 0) {
                this.documentsBySourcePath.delete(previousSourcePath);
            }
        }

        if (nextSourcePath) {
            if (!this.documentsBySourcePath.has(nextSourcePath)) {
                this.documentsBySourcePath.set(nextSourcePath, new Set());
            }
            this.documentsBySourcePath.get(nextSourcePath)?.add(documentKey);
        }
    }

    private async replaceDocumentText(document: vscode.TextDocument, nextText: string): Promise<void> {
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, nextText);
        const applied = await vscode.workspace.applyEdit(edit);
        if (applied && document.isDirty) {
            try {
                await document.save();
            } catch (error) {
                console.error("Failed to auto-save Tonto diagram document", error);
            }
        }
    }

    private getPanelStates(): DiagramEditorPanelState[] {
        return [...this.panelsByDocument.values()].flatMap((panelStates) => [...panelStates]);
    }
}

function createDiagramEditorHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "pack", "webview", "diagram-editor.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "pack", "webview", "style.css"));

    return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource} https://fonts.googleapis.com; font-src ${webview.cspSource} https://fonts.gstatic.com;">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
        <link rel="stylesheet" href="${styleUri}">
        <title>Tonto Diagram Editor</title>
    </head>
    <body>
        <div id="root" data-diagram-name="${escapeHtml(path.basename(extensionUri.fsPath))}"></div>
        <script type="module" src="${scriptUri}"></script>
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
