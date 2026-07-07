import * as plantumlEncoder from 'plantuml-encoder';
import { plantUMLNatureLegend } from 'tonto-cli';
import * as vscode from 'vscode';

import * as path from 'path';

export interface PlantUMLPanelState {
    showExternalReferences: boolean;
    showPackageNames: boolean;
    groupExternalPackages: boolean;
    showAttributes: boolean;
    showCardinalities: boolean;
    showRelationNames: boolean;
    showColors: boolean;
    sizeByDegree: boolean;
    layoutVariant: string;
    layoutOptions: Array<{ value: string; label: string }>;
    spacing: string;
    spacingOptions: Array<{ value: string; label: string }>;
}

type PlantUMLBooleanOption =
    | 'showExternalReferences'
    | 'showPackageNames'
    | 'groupExternalPackages'
    | 'showAttributes'
    | 'showCardinalities'
    | 'showRelationNames'
    | 'showColors'
    | 'sizeByDegree';

export interface PlantUMLPanelOptions {
    defaultBaseName?: string;
    defaultSaveDirectory?: vscode.Uri;
    title?: string;
}

type PlantUMLIncomingMessage =
    | { command: 'downloadCode' }
    | { command: 'downloadSvg' }
    | { command: 'downloadPng' }
    | { command: 'setOption'; key: PlantUMLBooleanOption; value: boolean }
    | { command: 'resetOptions' }
    | { command: 'setLayoutVariant'; layoutVariant: string }
    | { command: 'setSpacing'; spacing: string };

export class PlantUMLPanel {
    public static currentPanel: PlantUMLPanel | undefined;
    public static readonly viewType = 'tontoPlantUML';
    private readonly _panel: vscode.WebviewPanel;
    public documentUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _defaultBaseName: string;
    private _defaultSaveDirectory: vscode.Uri;

    private _currentPlantUML: string = '';

    private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri, documentUri: vscode.Uri, options: PlantUMLPanelOptions = {}) {
        this._panel = panel;
        this.documentUri = documentUri;
        this._defaultBaseName = options.defaultBaseName ?? getDefaultBaseName(documentUri);
        this._defaultSaveDirectory = options.defaultSaveDirectory ?? getDefaultSaveDirectory(documentUri);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message: PlantUMLIncomingMessage) => {
                switch (message.command) {
                    case 'downloadCode':
                        await this.downloadCode();
                        break;
                    case 'downloadSvg':
                        await this.downloadImage('svg');
                        break;
                    case 'downloadPng':
                        await this.downloadImage('png');
                        break;
                    case 'setOption':
                        vscode.commands.executeCommand('tonto.diagram.plantuml.setOption', message.key, message.value);
                        break;
                    case 'resetOptions':
                        vscode.commands.executeCommand('tonto.diagram.plantuml.resetOptions');
                        break;
                    case 'setLayoutVariant':
                        vscode.commands.executeCommand('tonto.diagram.plantuml.setLayoutVariant', message.layoutVariant);
                        break;
                    case 'setSpacing':
                        vscode.commands.executeCommand('tonto.diagram.plantuml.setSpacing', message.spacing);
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
                retainContextWhenHidden: true,
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

    private async downloadImage(format: 'svg' | 'png') {
        const encoded = plantumlEncoder.encode(this._currentPlantUML);
        const imageUrl = `https://www.plantuml.com/plantuml/${format}/${encoded}`;
        const filterLabel = format.toUpperCase();

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(this._defaultSaveDirectory, `${this._defaultBaseName}.${format}`),
            filters: { [filterLabel]: [format] }
        });

        if (uri) {
            try {
                const fetch = (await import('node-fetch-native')).default;
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
                const buffer = await response.arrayBuffer();
                await vscode.workspace.fs.writeFile(uri, new Uint8Array(buffer));
                vscode.window.showInformationMessage(`Saved Diagram to ${uri.fsPath}`);
            } catch (e) {
                vscode.window.showErrorMessage(`Error downloading ${filterLabel}: ${e}`);
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
        const spacingOptions = state.spacingOptions
            .map((option) => {
                const selected = option.value === state.spacing ? ' selected' : '';
                return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
            })
            .join('');

        const displayToggles: Array<{ key: PlantUMLBooleanOption; label: string; hint: string; value: boolean }> = [
            {
                key: 'showExternalReferences',
                label: 'External references',
                hint: 'Elements and relations from other packages',
                value: state.showExternalReferences,
            },
            {
                key: 'showPackageNames',
                label: 'Package groups',
                hint: 'Box local packages (the main package stays unboxed)',
                value: state.showPackageNames,
            },
            {
                key: 'groupExternalPackages',
                label: 'External package groups',
                hint: 'Box elements borrowed from other packages',
                value: state.groupExternalPackages,
            },
            {
                key: 'showAttributes',
                label: 'Attributes',
                hint: 'Show attributes inside each class box',
                value: state.showAttributes,
            },
            {
                key: 'showCardinalities',
                label: 'Cardinalities',
                hint: 'Show multiplicities on relation ends',
                value: state.showCardinalities,
            },
            {
                key: 'showRelationNames',
                label: 'Relation labels',
                hint: 'Show relation names and inverseOf labels',
                value: state.showRelationNames,
            },
            {
                key: 'showColors',
                label: 'Colors',
                hint: 'Fill elements with their nature color (off = monochrome)',
                value: state.showColors,
            },
            {
                key: 'sizeByDegree',
                label: 'Size by relations',
                hint: 'Enlarge elements that have many relations',
                value: state.sizeByDegree,
            },
        ];

        const legendRows = plantUMLNatureLegend
            .map((entry) => `
                <li class="legend-item">
                    <span class="legend-swatch" style="background:${escapeHtml(entry.color)}"></span>
                    <span class="legend-text">${escapeHtml(entry.label)}</span>
                </li>`)
            .join('');
        // A few stacked swatches previewed on the collapsed legend button.
        const legendSwatchPreview = plantUMLNatureLegend
            .slice(0, 4)
            .map((entry) => `<span style="background:${escapeHtml(entry.color)}"></span>`)
            .join('');

        // Badge counts options that hide something, so a clean default shows no badge.
        const hiddenCount = displayToggles.filter((toggle) => !toggle.value).length;
        const toggleRows = displayToggles
            .map((toggle) => `
                <label class="switch-row" title="${escapeHtml(toggle.hint)}">
                    <span class="switch-text">
                        <span class="switch-label">${escapeHtml(toggle.label)}</span>
                        <span class="switch-hint">${escapeHtml(toggle.hint)}</span>
                    </span>
                    <span class="switch">
                        <input type="checkbox" data-option="${escapeHtml(toggle.key)}"${toggle.value ? ' checked' : ''}>
                        <span class="switch-track"><span class="switch-thumb"></span></span>
                    </span>
                </label>`)
            .join('');
        const sourceLineCount = plantumlContent.split(/\r?\n/).length;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://www.plantuml.com data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${cspSource};">
            <title>Tonto PlantUML</title>
            <style>
                :root {
                    --bg: #f7f6f2;
                    --surface: #ffffff;
                    --surface-muted: #efede6;
                    --line: #d8d3c7;
                    --line-strong: #a99f8c;
                    --text: #1f1c17;
                    --muted: #6e6658;
                    --accent: #1f5c5c;
                    --accent-soft: rgba(31, 92, 92, 0.1);
                    --shadow:
                        0 0 0 1px rgba(0, 0, 0, 0.06),
                        0 2px 6px rgba(0, 0, 0, 0.08);
                }
                * {
                    box-sizing: border-box;
                }
                html,
                body {
                    width: 100%;
                    height: 100%;
                    margin: 0;
                    overflow: hidden;
                    background: var(--bg);
                    color: var(--text);
                    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    -webkit-font-smoothing: antialiased;
                }
                .shell {
                    width: 100%;
                    height: 100%;
                    display: grid;
                    grid-template-rows: auto 1fr;
                }
                .toolbar {
                    position: relative;
                    min-height: 52px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 10px;
                    border-bottom: 1px solid var(--line);
                    background: var(--surface);
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
                    z-index: 10;
                }
                .title {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    min-width: 0;
                    flex: 0 1 auto;
                    overflow: hidden;
                }
                .title strong {
                    font-size: 13px;
                    line-height: 1.2;
                    color: var(--text);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .title span,
                .scale {
                    color: var(--muted);
                    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                    font-size: 11px;
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap;
                }
                .spacer {
                    flex: 1 1 auto;
                    min-width: 4px;
                }
                .group {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    flex: 0 0 auto;
                }
                button,
                select {
                    min-height: 32px;
                    border: 1px solid var(--line);
                    border-radius: 6px;
                    background: var(--surface);
                    color: var(--text);
                    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.03);
                    font: inherit;
                }
                button {
                    min-width: 32px;
                    padding: 0 9px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    transition-property: background-color, border-color, color, transform;
                    transition-duration: 140ms;
                    transition-timing-function: ease-out;
                }
                button:hover {
                    border-color: var(--line-strong);
                    background: var(--accent-soft);
                    color: var(--accent);
                }
                button:active {
                    transform: scale(0.96);
                }
                button.icon {
                    font-size: 15px;
                }
                select {
                    width: 100%;
                    padding: 0 9px;
                    outline: none;
                }
                select:focus {
                    border-color: var(--accent);
                    box-shadow: 0 0 0 3px var(--accent-soft);
                }
                .options-btn {
                    position: relative;
                }
                .options-btn.open {
                    color: var(--accent);
                    border-color: rgba(31, 92, 92, 0.35);
                    background: var(--accent-soft);
                }
                .badge {
                    min-width: 16px;
                    height: 16px;
                    padding: 0 4px;
                    border-radius: 8px;
                    background: var(--accent);
                    color: #fff;
                    font-size: 10px;
                    font-weight: 600;
                    line-height: 16px;
                    text-align: center;
                }
                .panel {
                    position: absolute;
                    top: calc(100% + 6px);
                    right: 10px;
                    width: min(300px, calc(100vw - 20px));
                    max-height: calc(100vh - 72px);
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    padding: 14px;
                    border: 1px solid var(--line);
                    border-radius: 10px;
                    background: var(--surface);
                    box-shadow:
                        0 0 0 1px rgba(0, 0, 0, 0.04),
                        0 12px 30px rgba(0, 0, 0, 0.18);
                    z-index: 20;
                }
                .panel[hidden] {
                    display: none;
                }
                .panel-section {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .panel-title {
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.07em;
                    text-transform: uppercase;
                    color: var(--muted);
                }
                .switch-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    cursor: pointer;
                }
                .switch-text {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    min-width: 0;
                }
                .switch-label {
                    font-size: 12px;
                    color: var(--text);
                }
                .switch-hint {
                    font-size: 10px;
                    line-height: 1.3;
                    color: var(--muted);
                }
                .switch {
                    position: relative;
                    flex: 0 0 auto;
                }
                .switch input {
                    position: absolute;
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .switch-track {
                    display: block;
                    width: 34px;
                    height: 20px;
                    border-radius: 999px;
                    background: var(--surface-muted);
                    border: 1px solid var(--line);
                    transition: background-color 140ms ease-out, border-color 140ms ease-out;
                }
                .switch-thumb {
                    position: absolute;
                    top: 3px;
                    left: 3px;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: #fff;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
                    transition: transform 140ms ease-out;
                }
                .switch input:checked + .switch-track {
                    background: var(--accent);
                    border-color: var(--accent);
                }
                .switch input:checked + .switch-track .switch-thumb {
                    transform: translateX(14px);
                }
                .switch input:focus-visible + .switch-track {
                    box-shadow: 0 0 0 3px var(--accent-soft);
                }
                .panel .export-actions {
                    display: flex;
                    gap: 8px;
                }
                .panel .export-actions button {
                    flex: 1;
                }
                .viewport {
                    position: relative;
                    overflow: hidden;
                    background:
                        radial-gradient(circle, rgba(70, 61, 43, 0.13) 1px, transparent 1px),
                        var(--bg);
                    background-size: 20px 20px;
                    cursor: grab;
                    user-select: none;
                }
                .viewport.panning {
                    cursor: grabbing;
                }
                .diagram {
                    position: absolute;
                    top: 0;
                    left: 0;
                    max-width: none;
                    transform-origin: 0 0;
                    box-shadow: var(--shadow);
                    background: white;
                    transition: transform 120ms ease-out;
                    will-change: transform;
                }
                .loading,
                .error {
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    padding: 14px 16px;
                    border-radius: 6px;
                    border: 1px solid var(--line);
                    background: var(--surface);
                    box-shadow: var(--shadow);
                    color: var(--muted);
                    font-size: 12px;
                }
                .error {
                    color: #8b2a2a;
                    border-color: rgba(139, 42, 42, 0.25);
                }
                .help {
                    position: absolute;
                    right: 12px;
                    bottom: 12px;
                    padding: 6px 8px;
                    border-radius: 5px;
                    background: rgba(255, 255, 255, 0.86);
                    border: 1px solid var(--line);
                    color: var(--muted);
                    font-size: 11px;
                    pointer-events: none;
                    transition: opacity 160ms ease-out;
                }
                .legend-dock {
                    position: absolute;
                    left: 12px;
                    bottom: 12px;
                    max-width: calc(100% - 24px);
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 8px;
                }
                .legend-dock[hidden] {
                    display: none;
                }
                .legend-button {
                    pointer-events: auto;
                    background: rgba(255, 255, 255, 0.92);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
                    font-size: 11px;
                }
                .legend-button .legend-button-swatches {
                    display: inline-flex;
                }
                .legend-button .legend-button-swatches span {
                    width: 9px;
                    height: 9px;
                    border-radius: 2px;
                    margin-left: -2px;
                    border: 1px solid rgba(0, 0, 0, 0.2);
                }
                .legend-button .chevron {
                    color: var(--muted);
                    font-size: 9px;
                    display: inline-block;
                    transition: transform 140ms ease-out;
                }
                .legend-button[aria-expanded="true"] .chevron {
                    transform: rotate(180deg);
                }
                .legend-card {
                    padding: 10px 12px;
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.96);
                    border: 1px solid var(--line);
                    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
                    pointer-events: none;
                    backdrop-filter: blur(2px);
                }
                .legend-card[hidden] {
                    display: none;
                }
                .legend-title {
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.07em;
                    text-transform: uppercase;
                    color: var(--muted);
                    margin-bottom: 6px;
                }
                .legend-list {
                    list-style: none;
                    margin: 0;
                    padding: 0;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 3px 14px;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                }
                .legend-swatch {
                    flex: 0 0 auto;
                    width: 12px;
                    height: 12px;
                    border-radius: 3px;
                    border: 1px solid rgba(0, 0, 0, 0.25);
                }
                .legend-text {
                    font-size: 11px;
                    color: var(--text);
                    white-space: nowrap;
                }
                .legend-note {
                    margin-top: 7px;
                    font-size: 10px;
                    line-height: 1.3;
                    color: var(--muted);
                }
                .panel .reset-btn {
                    width: 100%;
                    color: var(--muted);
                }
                .panel .reset-btn:hover {
                    color: var(--accent);
                }
                .switch-row.disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                }
                /* Narrow side-by-side layout: drop the title and the zoom % to
                   keep the essential controls reachable without wrapping. */
                @media (max-width: 460px) {
                    .title span {
                        display: none;
                    }
                    #scale {
                        display: none;
                    }
                    .help {
                        left: 12px;
                        right: 12px;
                        text-align: center;
                    }
                    .legend-dock {
                        bottom: 44px;
                    }
                    .legend-list {
                        grid-template-columns: 1fr;
                    }
                }
                @media (max-width: 340px) {
                    .title {
                        display: none;
                    }
                }
            </style>
        </head>
        <body>
            <div class="shell">
                <div class="toolbar">
                    <div class="title">
                        <strong>PlantUML preview</strong>
                        <span>${sourceLineCount} source lines</span>
                    </div>
                    <div class="spacer"></div>
                    <div class="group" aria-label="Zoom controls">
                        <button id="zoomOut" class="icon" title="Zoom out" aria-label="Zoom out">−</button>
                        <span id="scale" class="scale">100%</span>
                        <button id="zoomIn" class="icon" title="Zoom in" aria-label="Zoom in">+</button>
                        <button id="fit" title="Fit to view" aria-label="Fit to view">Fit</button>
                        <button id="reset" title="Actual size" aria-label="Actual size">1:1</button>
                    </div>
                    <div class="group">
                        <button id="optionsBtn" class="options-btn icon" title="Diagram options"
                            aria-label="Diagram options" aria-haspopup="true" aria-expanded="false" aria-controls="optionsPanel">
                            ⚙${hiddenCount > 0 ? `<span class="badge" title="${hiddenCount} option${hiddenCount === 1 ? '' : 's'} hiding content">${hiddenCount}</span>` : ''}
                        </button>
                    </div>
                    <div id="optionsPanel" class="panel" role="dialog" aria-label="Diagram options" hidden>
                        <div class="panel-section">
                            <span class="panel-title">Layout</span>
                            <select id="layoutVariant" title="Edge routing / layout engine" aria-label="PlantUML layout">${layoutOptions}</select>
                            <select id="spacing" title="Spacing between elements" aria-label="Diagram spacing">${spacingOptions}</select>
                        </div>
                        <div class="panel-section">
                            <span class="panel-title">Display</span>
                            ${toggleRows}
                        </div>
                        <div class="panel-section">
                            <span class="panel-title">Export</span>
                            <div class="export-actions">
                                <button id="downloadCode" title="Save PlantUML source">.puml</button>
                                <button id="downloadSvg" title="Save rendered SVG (vector, no quality loss)">.svg</button>
                                <button id="downloadPng" title="Save rendered PNG">.png</button>
                            </div>
                            <button id="resetOptions" class="reset-btn" title="Restore all options to their defaults">Reset to defaults</button>
                        </div>
                    </div>
                </div>
                <div id="viewport" class="viewport">
                    <div id="loading" class="loading">Loading PlantUML render...</div>
                    <div id="error" class="error" hidden>PlantUML render failed.</div>
                    <img id="diagram" class="diagram" src="${imageUrl}" alt="PlantUML diagram" draggable="false" hidden>
                    <div id="legendDock" class="legend-dock"${state.showColors ? '' : ' hidden'}>
                        <div id="legendCard" class="legend-card" hidden>
                            <div class="legend-title">Nature colors</div>
                            <ul class="legend-list">${legendRows}</ul>
                            <div class="legend-note">Kinds use the full tone; their subtypes use a lighter tone of the same hue.</div>
                        </div>
                        <button id="legendButton" class="legend-button" aria-expanded="false" aria-controls="legendCard" title="Show the nature color legend">
                            <span class="legend-button-swatches">${legendSwatchPreview}</span>
                            <span>Nature colors</span>
                            <span class="chevron" aria-hidden="true">▲</span>
                        </button>
                    </div>
                    <div class="help">Drag to pan / scroll to zoom / double-click to fit</div>
                </div>
            </div>
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const persisted = vscode.getState() || {};
                const viewport = document.getElementById('viewport');
                const img = document.getElementById('diagram');
                const loading = document.getElementById('loading');
                const error = document.getElementById('error');
                const scaleLabel = document.getElementById('scale');
                let scale = 1;
                let translateX = 0;
                let translateY = 0;
                let panning = false;
                let startX = 0;
                let startY = 0;

                const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

                function saveState(patch) {
                    Object.assign(persisted, patch);
                    vscode.setState(persisted);
                }

                function setTransform(animate = true) {
                    saveState({ scale, translateX, translateY });
                    img.style.transitionDuration = animate ? '120ms' : '0ms';
                    img.style.transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale})\`;
                    scaleLabel.textContent = \`\${Math.round(scale * 100)}%\`;
                }

                function imageSize() {
                    return {
                        width: img.naturalWidth || img.width || 1,
                        height: img.naturalHeight || img.height || 1,
                    };
                }

                function fitDiagram() {
                    const size = imageSize();
                    const padding = 48;
                    const nextScale = clamp(Math.min(
                        (viewport.clientWidth - padding) / size.width,
                        (viewport.clientHeight - padding) / size.height
                    ), 0.08, 2);
                    scale = nextScale;
                    translateX = (viewport.clientWidth - size.width * scale) / 2;
                    translateY = (viewport.clientHeight - size.height * scale) / 2;
                    setTransform();
                }

                function resetDiagram() {
                    const size = imageSize();
                    scale = 1;
                    translateX = (viewport.clientWidth - size.width) / 2;
                    translateY = (viewport.clientHeight - size.height) / 2;
                    setTransform();
                }

                function zoomAt(nextScale, clientX, clientY) {
                    const rect = viewport.getBoundingClientRect();
                    const x = clientX - rect.left;
                    const y = clientY - rect.top;
                    const imageX = (x - translateX) / scale;
                    const imageY = (y - translateY) / scale;
                    scale = clamp(nextScale, 0.08, 6);
                    translateX = x - imageX * scale;
                    translateY = y - imageY * scale;
                    setTransform();
                }

                img.addEventListener('load', () => {
                    loading.hidden = true;
                    error.hidden = true;
                    img.hidden = false;
                    // Preserve the user's zoom/pan across option changes (the panel
                    // rebuilds the view), but fit on the very first render.
                    if (typeof persisted.scale === 'number') {
                        scale = persisted.scale;
                        translateX = persisted.translateX || 0;
                        translateY = persisted.translateY || 0;
                        setTransform(false);
                    } else {
                        fitDiagram();
                    }
                });

                img.addEventListener('error', () => {
                    loading.hidden = true;
                    img.hidden = true;
                    error.hidden = false;
                });

                document.getElementById('zoomIn').addEventListener('click', () => {
                    zoomAt(scale * 1.2, viewport.clientWidth / 2, viewport.clientHeight / 2);
                });

                document.getElementById('zoomOut').addEventListener('click', () => {
                    zoomAt(scale / 1.2, viewport.clientWidth / 2, viewport.clientHeight / 2);
                });

                document.getElementById('fit').addEventListener('click', fitDiagram);
                document.getElementById('reset').addEventListener('click', resetDiagram);
                viewport.addEventListener('dblclick', fitDiagram);

                const optionsBtn = document.getElementById('optionsBtn');
                const optionsPanel = document.getElementById('optionsPanel');

                function setPanelOpen(open) {
                    optionsPanel.hidden = !open;
                    optionsBtn.classList.toggle('open', open);
                    optionsBtn.setAttribute('aria-expanded', String(open));
                    saveState({ panelOpen: open });
                }

                // Keep the panel open across rebuilds so several toggles can be flipped in a row.
                if (persisted.panelOpen) {
                    setPanelOpen(true);
                }

                optionsBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    setPanelOpen(optionsPanel.hidden);
                });

                optionsPanel.addEventListener('click', (event) => {
                    event.stopPropagation();
                });

                document.addEventListener('click', () => setPanelOpen(false));

                document.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape' && !optionsPanel.hidden) {
                        setPanelOpen(false);
                        optionsBtn.focus();
                    }
                });

                optionsPanel.querySelectorAll('input[data-option]').forEach((input) => {
                    input.addEventListener('change', (event) => {
                        vscode.postMessage({
                            command: 'setOption',
                            key: event.target.dataset.option,
                            value: event.target.checked,
                        });
                    });
                });

                // The legend is a webview-only overlay that expands from a docked button,
                // so it toggles instantly without rebuilding the diagram. The dock is only
                // present while colors are enabled.
                const legendCard = document.getElementById('legendCard');
                const legendButton = document.getElementById('legendButton');

                function setLegendExpanded(expanded) {
                    if (legendCard) legendCard.hidden = !expanded;
                    if (legendButton) legendButton.setAttribute('aria-expanded', String(expanded));
                    saveState({ legendOpen: expanded });
                }

                if (legendButton) {
                    setLegendExpanded(persisted.legendOpen === true);
                    legendButton.addEventListener('click', () => {
                        setLegendExpanded(legendCard.hidden);
                    });
                }

                document.getElementById('resetOptions').addEventListener('click', () => {
                    // Clear the saved view so the diagram re-fits and the legend returns.
                    vscode.setState({});
                    Object.keys(persisted).forEach((key) => delete persisted[key]);
                    vscode.postMessage({ command: 'resetOptions' });
                });

                document.getElementById('layoutVariant').addEventListener('change', (event) => {
                    vscode.postMessage({
                        command: 'setLayoutVariant',
                        layoutVariant: event.target.value
                    });
                });

                document.getElementById('spacing').addEventListener('change', (event) => {
                    vscode.postMessage({
                        command: 'setSpacing',
                        spacing: event.target.value
                    });
                });

                document.getElementById('downloadCode').addEventListener('click', () => {
                    vscode.postMessage({ command: 'downloadCode' });
                });

                document.getElementById('downloadSvg').addEventListener('click', () => {
                    vscode.postMessage({ command: 'downloadSvg' });
                });
                document.getElementById('downloadPng').addEventListener('click', () => {
                    vscode.postMessage({ command: 'downloadPng' });
                });

                viewport.addEventListener('mousedown', (event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    startX = event.clientX - translateX;
                    startY = event.clientY - translateY;
                    panning = true;
                    viewport.classList.add('panning');
                });

                window.addEventListener('mouseup', () => {
                    panning = false;
                    viewport.classList.remove('panning');
                });

                window.addEventListener('mousemove', (event) => {
                    if (!panning) return;
                    translateX = event.clientX - startX;
                    translateY = event.clientY - startY;
                    setTransform(false);
                });

                viewport.addEventListener('wheel', (event) => {
                    event.preventDefault();
                    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
                    zoomAt(scale * factor, event.clientX, event.clientY);
                }, { passive: false });

                window.addEventListener('resize', () => {
                    if (!img.hidden) fitDiagram();
                });
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
