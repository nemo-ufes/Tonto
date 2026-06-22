import * as plantumlEncoder from 'plantuml-encoder';
import * as vscode from 'vscode';

import * as path from 'path';

export interface PlantUMLPanelState {
    showExternalReferences: boolean;
    layoutVariant: string;
    layoutOptions: Array<{ value: string; label: string }>;
}

export interface PlantUMLPanelOptions {
    defaultBaseName?: string;
    defaultSaveDirectory?: vscode.Uri;
    title?: string;
}

export class PlantUMLPanel {
    public static currentPanel: PlantUMLPanel | undefined;
    public static readonly viewType = 'tontoPlantUML';
    private readonly _panel: vscode.WebviewPanel;
    public documentUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _defaultBaseName: string;
    private _defaultSaveDirectory: vscode.Uri;

    private _currentPlantUML: string = '';

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, documentUri: vscode.Uri, options: PlantUMLPanelOptions = {}) {
        this._panel = panel;
        this.documentUri = documentUri;
        this._defaultBaseName = options.defaultBaseName ?? getDefaultBaseName(documentUri);
        this._defaultSaveDirectory = options.defaultSaveDirectory ?? getDefaultSaveDirectory(documentUri);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'downloadCode':
                        await this.downloadCode();
                        break;
                    case 'downloadPng':
                        await this.downloadPng();
                        break;
                    case 'toggleExternalRefs':
                        vscode.commands.executeCommand('tonto.diagram.plantuml.toggleExternalRefs');
                        break;
                    case 'toggleOrthogonalLines':
                        vscode.commands.executeCommand('tonto.diagram.plantuml.toggleOrthogonalLines');
                        break;
                    case 'setLayoutVariant':
                        vscode.commands.executeCommand('tonto.diagram.plantuml.setLayoutVariant', message.layoutVariant);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        plantumlContent: string,
        documentUri: vscode.Uri,
        state: PlantUMLPanelState,
        options: PlantUMLPanelOptions = {}
    ) {
        const column = vscode.ViewColumn.Beside;

        if (PlantUMLPanel.currentPanel) {
            PlantUMLPanel.currentPanel.documentUri = documentUri;
            PlantUMLPanel.currentPanel.updateOptions(options);
            PlantUMLPanel.currentPanel._panel.reveal(column);
            PlantUMLPanel.currentPanel.update(plantumlContent, state);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            PlantUMLPanel.viewType,
            options.title ?? `PlantUML: ${path.basename(documentUri.fsPath)}`,
            column,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        PlantUMLPanel.currentPanel = new PlantUMLPanel(panel, extensionUri, documentUri, options);
        PlantUMLPanel.currentPanel.update(plantumlContent, state);
    }

    public update(plantumlContent: string, state: PlantUMLPanelState) {
        this._currentPlantUML = plantumlContent;
        this._panel.webview.html = this._getHtmlForWebview(plantumlContent, state);
    }

    private async downloadCode() {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(this._defaultSaveDirectory, `${this._defaultBaseName}.puml`),
            filters: { 'PlantUML': ['puml'] }
        });
        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(this._currentPlantUML, 'utf8'));
            vscode.window.showInformationMessage(`Saved PlantUML to ${uri.fsPath}`);
        }
    }

    private async downloadPng() {
        const encoded = plantumlEncoder.encode(this._currentPlantUML);
        const imageUrl = `https://www.plantuml.com/plantuml/png/${encoded}`;

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(this._defaultSaveDirectory, `${this._defaultBaseName}.png`),
            filters: { 'PNG': ['png'] }
        });

        if (uri) {
            try {
                // We need to fetch the image. Since we are in node environment (extension), we can use fetch.
                // But vscode extension host might not have global fetch depending on version.
                // package.json has "node-fetch-native".
                const fetch = (await import('node-fetch-native')).default;
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
                const buffer = await response.arrayBuffer();
                await vscode.workspace.fs.writeFile(uri, new Uint8Array(buffer));
                vscode.window.showInformationMessage(`Saved Diagram to ${uri.fsPath}`);
            } catch (e) {
                vscode.window.showErrorMessage(`Error downloading PNG: ${e}`);
            }
        }
    }

    private updateOptions(options: PlantUMLPanelOptions): void {
        this._defaultBaseName = options.defaultBaseName ?? getDefaultBaseName(this.documentUri);
        this._defaultSaveDirectory = options.defaultSaveDirectory ?? getDefaultSaveDirectory(this.documentUri);
        this._panel.title = options.title ?? `PlantUML: ${path.basename(this.documentUri.fsPath)}`;
    }

    public dispose() {
        PlantUMLPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview(plantumlContent: string, state: PlantUMLPanelState) {
        const encoded = plantumlEncoder.encode(plantumlContent);
        const imageUrl = `https://www.plantuml.com/plantuml/svg/${encoded}`;
        const nonce = getNonce();
        const cspSource = this._panel.webview.cspSource;
        const layoutOptions = state.layoutOptions
            .map((option) => {
                const selected = option.value === state.layoutVariant ? ' selected' : '';
                return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
            })
            .join('');
        const externalRefsLabel = state.showExternalReferences ? 'Hide External Refs' : 'Show External Refs';

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://www.plantuml.com data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${cspSource};">
            <title>Tonto Diagram</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                    background-color: var(--vscode-editor-background);
                    background-image: radial-gradient(var(--vscode-editor-lineHighlightBorder) 1px, transparent 1px);
                    background-size: 20px 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                #diagram-container {
                    width: 100%;
                    height: 100%;
                    overflow: auto;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    cursor: grab;
                }
                #diagram-container:active {
                    cursor: grabbing;
                }
                img {
                    max-width: none;
                    transform-origin: center center;
                    transition: transform 0.1s ease-out;
                }
                .controls {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-editor-lineHighlightBorder);
                    padding: 10px;
                    border-radius: 5px;
                    display: flex;
                    gap: 10px;
                    z-index: 1000;
                }
                button,
                select {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 5px 10px;
                    cursor: pointer;
                    border-radius: 3px;
                }
                button:hover,
                select:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div id="diagram-container">
                <img id="diagram" src="${imageUrl}" alt="PlantUML Diagram">
            </div>
            <div class="controls">
                <button id="zoomIn">+</button>
                <button id="zoomOut">-</button>
                <button id="reset">Reset</button>
                <button id="toggleRefs">${externalRefsLabel}</button>
                <select id="layoutVariant" title="Layout">
                    ${layoutOptions}
                </select>
                <button id="downloadCode">Code</button>
                <button id="downloadPng">PNG</button>
            </div>
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const container = document.getElementById('diagram-container');
                const img = document.getElementById('diagram');
                let scale = 1;
                let panning = false;
                let pointX = 0;
                let pointY = 0;
                let startX = 0;
                let startY = 0;

                function setTransform() {
                    img.style.transform = \`translate(\${pointX}px, \${pointY}px) scale(\${scale})\`;
                }

                document.getElementById('zoomIn').onclick = () => {
                    scale *= 1.2;
                    setTransform();
                };

                document.getElementById('zoomOut').onclick = () => {
                    scale /= 1.2;
                    setTransform();
                };

                document.getElementById('reset').onclick = () => {
                    scale = 1;
                    pointX = 0;
                    pointY = 0;
                    setTransform();
                };

                document.getElementById('toggleRefs').onclick = () => {
                    vscode.postMessage({ command: 'toggleExternalRefs' });
                };

                document.getElementById('layoutVariant').onchange = (event) => {
                    vscode.postMessage({
                        command: 'setLayoutVariant',
                        layoutVariant: event.target.value
                    });
                };

                document.getElementById('downloadCode').onclick = () => {
                    vscode.postMessage({ command: 'downloadCode' });
                };

                document.getElementById('downloadPng').onclick = () => {
                    vscode.postMessage({ command: 'downloadPng' });
                };

                container.onmousedown = (e) => {
                    e.preventDefault();
                    startX = e.clientX - pointX;
                    startY = e.clientY - pointY;
                    panning = true;
                };

                container.onmouseup = (e) => {
                    panning = false;
                };

                container.onmousemove = (e) => {
                    e.preventDefault();
                    if (!panning) return;
                    pointX = e.clientX - startX;
                    pointY = e.clientY - startY;
                    setTransform();
                };
                
                container.onwheel = (e) => {
                    e.preventDefault();
                    const xs = (e.clientX - pointX) / scale;
                    const ys = (e.clientY - pointY) / scale;
                    const delta = -e.deltaY;
                    
                    (delta > 0) ? (scale *= 1.1) : (scale /= 1.1);
                    
                    pointX = e.clientX - xs * scale;
                    pointY = e.clientY - ys * scale;

                    setTransform();
                }
            </script>
        </body>
        </html>`;
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getDefaultBaseName(uri: vscode.Uri): string {
    return path.basename(uri.fsPath, path.extname(uri.fsPath)) || 'ontology';
}

function getDefaultSaveDirectory(uri: vscode.Uri): vscode.Uri {
    return vscode.Uri.file(path.dirname(uri.fsPath));
}

function getNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}
