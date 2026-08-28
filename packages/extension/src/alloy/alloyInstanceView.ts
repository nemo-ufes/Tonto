import { AlloyInstance } from "./alloyTypes.js";

/**
 * Builds the webview markup for one instance.
 *
 * Free of `vscode` on purpose: this is the part with decisions worth testing — escaping,
 * what an unsatisfiable result should say — and the panel around it is only plumbing.
 */
export function renderInstance(instance: AlloyInstance): string {
    const heading = instance.satisfiable
        ? `Instance ${instance.instanceNumber}`
        : "No more instances";

    // An unsatisfiable result is a finding about the ontology, not a failure, so it is
    // presented as a result rather than an error.
    const body = instance.satisfiable
        ? `<pre id="instance">${escapeHtml(instance.instanceXml ?? "")}</pre>`
        : `<p class="empty">Alloy found no ${instance.instanceNumber > 0 ? "further " : ""}instance
             for <code>${escapeHtml(instance.commandName)}</code> at this scope.</p>`;

    const warnings = (instance.warnings ?? []).length > 0
        ? `<ul class="warnings">${(instance.warnings ?? [])
            .map((warning) => `<li>${escapeHtml(warning)}</li>`)
            .join("")}</ul>`
        : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Alloy instance</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            padding: 0 1rem 1rem;
        }
        header {
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            padding: 1rem 0 0.5rem;
            display: flex;
            align-items: baseline;
            gap: 1rem;
        }
        h1 { font-size: 1.1rem; margin: 0; }
        .command { color: var(--vscode-descriptionForeground); font-size: 0.9rem; }
        button {
            margin-left: auto;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 0.35rem 0.9rem;
            cursor: pointer;
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 0.75rem;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.85rem;
        }
        .empty { color: var(--vscode-descriptionForeground); }
        .warnings { color: var(--vscode-editorWarning-foreground); font-size: 0.85rem; }
    </style>
</head>
<body>
    <header>
        <h1>${escapeHtml(heading)}</h1>
        <span class="command">${escapeHtml(instance.commandName)}</span>
        <button id="next">Next instance</button>
    </header>
    ${warnings}
    ${body}
    <script>
        const vscode = acquireVsCodeApi();
        document.getElementById("next").addEventListener("click", () => {
            vscode.postMessage({ command: "next" });
        });
    </script>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
