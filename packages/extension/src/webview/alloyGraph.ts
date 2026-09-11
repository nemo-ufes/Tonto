import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { WorldGraph } from "../alloy/instanceGraph.js";

/**
 * Draws one Alloy instance as a graph per possible world.
 *
 * Runs inside the webview, so it has no access to `vscode` or to the extension host: the
 * instance arrives as data on `window`, and interaction goes back through `postMessage`.
 */

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

interface InstancePayload {
    commandName: string
    instanceNumber: number
    satisfiable: boolean
    worlds: WorldGraph[]
    message?: string
}

declare global {
    interface Window {
        alloyInstance: InstancePayload
    }
}

cytoscape.use(fcose);

const vscode = acquireVsCodeApi();

/**
 * The live graph, kept at module scope rather than inside `render`.
 *
 * Stepping to the next instance calls `render` again; a handle scoped to that call would
 * leave the previous Cytoscape instance — and its canvas and event listeners — attached with
 * nothing left to destroy it.
 */
let graph: cytoscape.Core | undefined;

/**
 * Cytoscape paints on a canvas, so CSS custom properties never reach it. Reading the theme's
 * values once keeps the graph in step with light and dark themes instead of hard-coding a
 * palette that looks wrong in one of them.
 */
function themeColour(name: string, fallback: string): string {
    const value = getComputedStyle(document.body).getPropertyValue(name).trim();
    return value || fallback;
}

function buildStyles(): cytoscape.StylesheetJson {
    const foreground = themeColour("--vscode-foreground", "#cccccc");
    const border = themeColour("--vscode-panel-border", "#80808060");
    const objectFill = themeColour("--vscode-charts-blue", "#4e94ce");
    const aspectFill = themeColour("--vscode-charts-green", "#89d185");
    const unknownFill = themeColour("--vscode-charts-foreground", "#8a8a8a");
    const edgeColour = themeColour("--vscode-charts-lines", "#80808080");

    return [
        {
            selector: "node",
            style: {
                "label": "data(label)",
                "text-wrap": "wrap",
                "text-max-width": "140px",
                "text-valign": "center",
                "text-halign": "center",
                "color": "#ffffff",
                "font-size": "11px",
                "font-family": themeColour("--vscode-font-family", "sans-serif"),
                "width": "label",
                "height": "label",
                "padding": "10px",
                "border-width": 1,
                "border-color": border,
            },
        },
        // Substantials are the things that exist on their own; moments — relators, modes —
        // exist in something else. Different shapes make that split readable at a glance.
        {
            selector: "node[nature = 'object']",
            style: { "shape": "round-rectangle", "background-color": objectFill },
        },
        {
            selector: "node[nature = 'aspect']",
            style: { "shape": "diamond", "background-color": aspectFill },
        },
        {
            selector: "node[nature = 'unknown']",
            style: { "shape": "ellipse", "background-color": unknownFill },
        },
        {
            selector: "edge",
            style: {
                "label": "data(label)",
                "font-size": "10px",
                "color": foreground,
                "text-background-color": themeColour("--vscode-editor-background", "#1e1e1e"),
                "text-background-opacity": 0.85,
                "text-background-padding": "2px",
                "width": 1.5,
                "line-color": edgeColour,
                "target-arrow-color": edgeColour,
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
            },
        },
        {
            selector: "node:selected",
            style: { "border-width": 3, "border-color": themeColour("--vscode-focusBorder", "#007fd4") },
        },
    ] as cytoscape.StylesheetJson;
}

function toElements(world: WorldGraph): cytoscape.ElementDefinition[] {
    const nodes: cytoscape.ElementDefinition[] = world.nodes.map((node) => ({
        data: {
            id: node.id,
            label: `${node.label}\n${node.discriminator}`,
            nature: node.nature,
        },
    }));

    const edges: cytoscape.ElementDefinition[] = world.edges.map((edge) => ({
        data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label },
    }));

    return [...nodes, ...edges];
}

function render(payload: InstancePayload): void {
    const tabs = document.getElementById("tabs");
    const canvas = document.getElementById("graph");
    const empty = document.getElementById("empty");
    if (!tabs || !canvas || !empty) {
        return;
    }

    if (!payload.satisfiable || payload.worlds.length === 0) {
        graph?.destroy();
        graph = undefined;
        canvas.style.display = "none";
        empty.style.display = "block";
        empty.textContent = payload.message
            ?? "This instance has no worlds to show.";
        return;
    }

    canvas.style.display = "";
    empty.style.display = "none";

    const show = (index: number) => {
        const world = payload.worlds[index];
        graph?.destroy();
        graph = cytoscape({
            container: canvas,
            elements: toElements(world),
            style: buildStyles(),
            layout: {
                name: "fcose",
                animate: false,
                // Endurants in a world have no inherent order, so a force layout says more
                // about how they relate than a grid would.
                nodeRepulsion: 6000,
                idealEdgeLength: 120,
                padding: 24,
            } as cytoscape.LayoutOptions,
        });

        Array.from(tabs.children).forEach((tab, position) =>
            tab.classList.toggle("active", position === index));
    };

    tabs.replaceChildren(
        ...payload.worlds.map((world, index) => {
            const tab = document.createElement("button");
            tab.className = "tab";
            tab.textContent = worldTabLabel(world);
            tab.title = world.id;
            tab.addEventListener("click", () => show(index));
            return tab;
        })
    );

    show(0);
}

function worldTabLabel(world: WorldGraph): string {
    const counts = `${world.nodes.length}`;
    return `${world.title} (${counts})`;
}

document.getElementById("next")?.addEventListener("click", () => {
    vscode.postMessage({ command: "next" });
});

window.addEventListener("message", (event: MessageEvent<{ instance?: InstancePayload }>) => {
    if (event.data?.instance) {
        window.alloyInstance = event.data.instance;
        render(event.data.instance);
    }
});

if (window.alloyInstance) {
    render(window.alloyInstance);
}
