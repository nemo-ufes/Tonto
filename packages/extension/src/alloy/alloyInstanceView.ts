import { AlloyInstance } from "./alloyTypes.js";
import { toOntology, toWorldGraphs, WorldGraph } from "./instanceGraph.js";

/**
 * Builds the webview markup for one instance.
 *
 * Free of `vscode` on purpose: this is the part with decisions worth testing — escaping,
 * what an unsatisfiable result should say, what the graph script receives — and the panel
 * around it is only plumbing.
 */

export interface InstancePayload {
    commandName: string
    instanceNumber: number
    satisfiable: boolean
    worlds: WorldGraph[]
    message?: string
}

/** What the webview script needs, and nothing more: no session ids, no Alloy XML. */
export function toPayload(instance: AlloyInstance): InstancePayload {
    const worlds = toWorldGraphs(instance.instance, toOntology(instance.ontology));

    return {
        commandName: instance.commandName,
        instanceNumber: instance.instanceNumber,
        satisfiable: instance.satisfiable,
        worlds,
        message: describeEmptyResult(instance, worlds),
    };
}

/**
 * Why there is nothing to draw. An unsatisfiable result is a finding about the ontology, not
 * a failure, and the two reasons for an empty graph are worth telling apart.
 */
function describeEmptyResult(instance: AlloyInstance, worlds: WorldGraph[]): string | undefined {
    if (!instance.satisfiable) {
        return instance.instanceNumber > 0
            ? `Alloy found no further instance for ${instance.commandName}.`
            : `Alloy found no instance for ${instance.commandName} at this scope. `
              + "The model may be over-constrained.";
    }

    if (worlds.length === 0) {
        return "This instance has no possible worlds — the model may not declare a World signature.";
    }

    return undefined;
}

export function renderInstance(
    instance: AlloyInstance,
    scriptUri: string,
    nonce: string
): string {
    const payload = toPayload(instance);
    const heading = instance.satisfiable ? `Instance ${instance.instanceNumber}` : "No instance";

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
          content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}';">
    <title>Alloy instance</title>
    <style>
        html, body { height: 100%; margin: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            display: flex;
            flex-direction: column;
        }
        header {
            display: flex;
            align-items: baseline;
            gap: 1rem;
            padding: 0.75rem 1rem 0.5rem;
        }
        h1 { font-size: 1.1rem; margin: 0; }
        .command { color: var(--vscode-descriptionForeground); font-size: 0.9rem; }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 0.35rem 0.9rem;
            cursor: pointer;
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        header button { margin-left: auto; }
        #tabs {
            display: flex;
            gap: 0.25rem;
            padding: 0 1rem;
            flex-wrap: wrap;
        }
        .tab {
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border-bottom: 2px solid transparent;
            padding: 0.3rem 0.7rem;
            font-size: 0.85rem;
        }
        .tab:hover { background: var(--vscode-toolbar-hoverBackground); }
        .tab.active {
            color: var(--vscode-foreground);
            border-bottom-color: var(--vscode-focusBorder);
        }
        #worldmap-section {
            display: none;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 0 1rem 0.5rem;
        }
        .section-title {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--vscode-descriptionForeground);
            margin: 0.2rem 0 0.3rem;
        }
        #worldmap { height: 130px; }
        #note {
            display: none;
            margin: 0;
            padding: 0.5rem 1rem 0;
            font-size: 0.85rem;
            color: var(--vscode-descriptionForeground);
        }
        #note.has-issues { color: var(--vscode-errorForeground); }
        #graph { flex: 1; min-height: 0; }
        #empty {
            display: none;
            padding: 1rem;
            color: var(--vscode-descriptionForeground);
        }
        .warnings {
            color: var(--vscode-editorWarning-foreground);
            font-size: 0.85rem;
            margin: 0 1rem;
        }
        .legend {
            display: flex;
            gap: 1rem;
            padding: 0.4rem 1rem 0.7rem;
            font-size: 0.8rem;
            color: var(--vscode-descriptionForeground);
        }
        .swatch { display: inline-block; width: 0.7rem; height: 0.7rem; margin-right: 0.3rem; }
        .swatch.object { background: var(--vscode-charts-blue); border-radius: 2px; }
        .swatch.aspect { background: var(--vscode-charts-green); transform: rotate(45deg); }
        .swatch.broken {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-errorForeground);
            border-radius: 2px;
        }
    </style>
</head>
<body>
    <header>
        <h1>${escapeHtml(heading)}</h1>
        <span class="command">${escapeHtml(instance.commandName)}</span>
        <button id="next">Next instance</button>
    </header>
    ${warnings}
    <div id="tabs"></div>
    <section id="worldmap-section">
        <p class="section-title">How these worlds connect</p>
        <div id="worldmap"></div>
    </section>
    <div class="legend">
        <span><span class="swatch object"></span>endurant</span>
        <span><span class="swatch aspect"></span>aspect (relator, mode)</span>
        <span><span class="swatch broken"></span>breaks a UFO constraint</span>
    </div>
    <p id="note"></p>
    <div id="graph"></div>
    <p id="empty"></p>
    <script nonce="${nonce}">
        window.alloyInstance = ${serialisePayload(payload)};
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Embeds the payload as JSON inside a script tag.
 *
 * `<` is escaped because the sequence `</script>` inside a string literal ends the enclosing
 * tag regardless of quoting, which would break the page and drop the rest of the payload into
 * the document. Class names come from the modeller's ontology, so this is reachable.
 */
export function serialisePayload(payload: InstancePayload): string {
    return JSON.stringify(payload).replace(/</g, "\\u003c");
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** A fresh value per render, so the CSP admits exactly the scripts this page ships with. */
export function createNonce(): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let index = 0; index < 32; index++) {
        nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return nonce;
}
