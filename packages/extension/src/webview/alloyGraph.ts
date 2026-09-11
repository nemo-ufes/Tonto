import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { toWorldMap, WorldGraph } from "../alloy/instanceGraph.js";

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
 * A webview fails silently: nothing it throws reaches the extension, and its console is
 * behind a developer-tools window most users never open. Without this a broken render is
 * indistinguishable from an instance that genuinely had nothing to show.
 */
function report(context: string, error: unknown): void {
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    vscode.postMessage({ command: "error", context, detail });
}

window.addEventListener("error", (event) => report("uncaught", event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => report("promise", event.reason));

/**
 * The live graph, kept at module scope rather than inside `render`.
 *
 * Stepping to the next instance calls `render` again; a handle scoped to that call would
 * leave the previous Cytoscape instance — and its canvas and event listeners — attached with
 * nothing left to destroy it.
 */
let graph: cytoscape.Core | undefined;

/** The map of how the worlds connect, alive alongside the graph of what is inside one. */
let worldMap: cytoscape.Core | undefined;

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
        // A diamond gets a size of its own rather than one derived from its label. Sizing a
        // non-rectangular shape to its text collapses it — the node stays in the graph, and
        // with it every relation it takes part in, while nothing appears on screen. Since a
        // relator connects the endurants it mediates, losing it loses all of their edges.
        // The label sits below, which is also how a relator is drawn in an OntoUML diagram.
        {
            selector: "node[nature = 'aspect']",
            style: {
                "shape": "diamond",
                "background-color": aspectFill,
                "width": 34,
                "height": 34,
                "padding": 0,
                "text-valign": "bottom",
                "text-margin-y": 4,
                "color": foreground,
            },
        },
        {
            selector: "node[nature = 'unknown']",
            style: {
                "shape": "ellipse",
                "background-color": unknownFill,
                "width": 34,
                "height": 34,
                "padding": 0,
                "text-valign": "bottom",
                "text-margin-y": 4,
                "color": foreground,
            },
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
        // An endurant breaking a UFO constraint is the most important thing on the screen:
        // it is evidence about the transformation, and nothing else in the picture says so.
        {
            selector: "node.broken",
            style: {
                "background-color": themeColour("--vscode-inputValidation-errorBackground", "#5a1d1d"),
                "border-color": themeColour("--vscode-errorForeground", "#f48771"),
                "border-width": 2,
            },
        },
        {
            selector: "node:selected",
            style: { "border-width": 3, "border-color": themeColour("--vscode-focusBorder", "#007fd4") },
        },
    ] as cytoscape.StylesheetJson;
}

function buildMapStyles(): cytoscape.StylesheetJson {
    const border = themeColour("--vscode-panel-border", "#80808060");
    const edgeColour = themeColour("--vscode-charts-lines", "#80808080");
    const dim = themeColour("--vscode-descriptionForeground", "#999999");

    return [
        {
            selector: "node",
            style: {
                "label": "data(label)",
                "text-wrap": "wrap",
                "text-valign": "center",
                "text-halign": "center",
                "shape": "round-rectangle",
                "width": "label",
                "height": "label",
                "padding": "6px",
                "font-size": "9px",
                "font-family": themeColour("--vscode-font-family", "sans-serif"),
                "color": dim,
                "background-color": themeColour("--vscode-editor-background", "#1e1e1e"),
                "border-width": 1,
                "border-color": border,
            },
        },
        // The world being shown below, so the map reads as navigation rather than decoration.
        {
            selector: "node.selected-world",
            style: {
                "color": themeColour("--vscode-button-foreground", "#ffffff"),
                "background-color": themeColour("--vscode-button-background", "#0e639c"),
                "border-color": themeColour("--vscode-focusBorder", "#007fd4"),
            },
        },
        {
            selector: "edge",
            style: {
                "width": 1.5,
                "line-color": edgeColour,
                "target-arrow-color": edgeColour,
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
            },
        },
    ] as cytoscape.StylesheetJson;
}

function renderWorldMap(
    container: HTMLElement,
    worlds: WorldGraph[],
    onSelect: (index: number) => void
): void {
    const map = toWorldMap(worlds);

    worldMap?.destroy();
    worldMap = cytoscape({
        container,
        elements: [
            ...map.nodes.map((node) => ({ data: { id: node.id, label: node.label, index: node.index } })),
            ...map.edges.map((edge) => ({ data: edge })),
        ],
        style: buildMapStyles(),
        // The map is for orientation, not for rearranging.
        userZoomingEnabled: false,
        userPanningEnabled: false,
        autoungrabify: true,
        autolock: true,
    });

    worldMap.on("tap", "node", (event) => onSelect(event.target.data("index") as number));

    // Same reason as the graph: laid out on the next frame, once the container has a size.
    requestAnimationFrame(() => {
        try {
            worldMap?.resize();
            worldMap?.layout({
                // Left to right, following the arrow of time the `next` relation encodes, so
                // a counterfactual reads as a branch off the past rather than another column.
                name: "breadthfirst",
                directed: true,
                spacingFactor: 1.1,
                padding: 10,
                animate: false,
            } as cytoscape.LayoutOptions).run();
            worldMap?.fit(undefined, 10);
        } catch (error) {
            report("laying out the world map", error);
        }
    });
}

function highlightWorld(index: number): void {
    worldMap?.nodes().forEach((node) => {
        node.toggleClass("selected-world", node.data("index") === index);
    });
}

function toElements(world: WorldGraph): cytoscape.ElementDefinition[] {
    const nodes: cytoscape.ElementDefinition[] = world.nodes.map((node) => ({
        data: {
            id: node.id,
            label: nodeLabel(node),
            nature: node.nature,
            broken: node.issues.length > 0 ? "yes" : "no",
        },
        classes: node.issues.length > 0 ? "broken" : undefined,
    }));

    const edges: cytoscape.ElementDefinition[] = world.edges.map((edge) => ({
        data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label },
    }));

    return [...nodes, ...edges];
}

/**
 * Keeps the heading in step with what is on screen.
 *
 * The heading is written once into the page, while stepping only posts a new payload — so
 * without this it goes on reporting the instance the panel opened with, however many times
 * the modeller steps.
 */
function updateHeading(payload: InstancePayload): void {
    const heading = document.getElementById("heading");
    if (heading) {
        heading.textContent = payload.satisfiable
            ? `Instance ${payload.instanceNumber}`
            : "No instance";
    }
}

/**
 * Reads top to bottom as the endurant does: what it is, what it currently is, and which one
 * it is. The qualifiers are indented so the kind stays the line the eye lands on.
 */
function nodeLabel(node: WorldGraph["nodes"][number]): string {
    const lines = [node.label, ...(node.qualifiers.length > 0 ? [node.qualifiers.join(", ")] : [])]
        .filter((line) => line.length > 0);
    return [...lines, node.discriminator].join("\n");
}

/** Places the endurants, then frames them. */
function layOut(graph: cytoscape.Core | undefined): void {
    if (!graph) {
        return;
    }
    try {
        graph.resize();
        graph.layout({
            name: "fcose",
            animate: false,
            // Endurants in a world have no inherent order, so a force layout says more about
            // how they relate than a grid would.
            nodeRepulsion: 6000,
            idealEdgeLength: 120,
            padding: 24,
        } as cytoscape.LayoutOptions).run();
        graph.fit(undefined, 24);
    } catch (error) {
        report("laying out", error);
    }
}

function render(payload: InstancePayload): void {
    updateHeading(payload);

    const tabs = document.getElementById("tabs");
    const canvas = document.getElementById("graph");
    const empty = document.getElementById("empty");
    const mapSection = document.getElementById("worldmap-section");
    const mapCanvas = document.getElementById("worldmap");
    const note = document.getElementById("note");
    if (!tabs || !canvas || !empty || !mapSection || !mapCanvas || !note) {
        return;
    }

    if (!payload.satisfiable || payload.worlds.length === 0) {
        graph?.destroy();
        graph = undefined;
        worldMap?.destroy();
        worldMap = undefined;
        canvas.classList.add("hidden");
        mapSection.classList.add("hidden");
        note.classList.add("hidden");
        empty.classList.remove("hidden");
        empty.textContent = payload.message ?? "This instance has no worlds to show.";
        return;
    }

    canvas.classList.remove("hidden");
    empty.classList.add("hidden");

    const show = (index: number) => {
        const world = payload.worlds[index];
        let drawn: { nodes: number; edges: number } | undefined;

        try {
            graph?.destroy();

            // The layout is run separately rather than passed to the constructor. With
            // `animate: false` it completes synchronously inside it, so `layoutstop` fires
            // before there is anything to listen with — and the fit that should follow it
            // never happens, leaving most of the world outside the viewport.
            graph = cytoscape({
                container: canvas,
                elements: toElements(world),
                style: buildStyles(),
            });

            drawn = { nodes: graph.nodes().length, edges: graph.edges().length };
            vscode.postMessage({ command: "drawn", world: world.title, ...drawn });

            // Deferred a frame because the panel's flex layout has not settled when this
            // first runs: measuring the container now gives the size it had before the page
            // was laid out, and everything is framed against the wrong bounds.
            requestAnimationFrame(() => layOut(graph));
        } catch (error) {
            report(`drawing ${world.title}`, error);
        }

        Array.from(tabs.children).forEach((tab, position) => {
            tab.classList.toggle("active", position === index);
        });
        highlightWorld(index);

        describeWorld(note, world, summarise(world, drawn));
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

    // One world has no branching to show, so the map would be a box with nothing to say.
    if (payload.worlds.length > 1) {
        mapSection.classList.remove("hidden");
        renderWorldMap(mapCanvas, payload.worlds, show);
    } else {
        mapSection.classList.add("hidden");
        worldMap?.destroy();
        worldMap = undefined;
    }

    show(0);
}

/**
 * States what is worth knowing about the world below, in order of importance: any UFO
 * constraint it breaks first, then whether it holds relations at all.
 *
 * A world of disconnected boxes otherwise reads as a failed render rather than as a fact
 * about the instance, and a red node says something is wrong without saying what.
 */
function describeWorld(note: HTMLElement, world: WorldGraph, summary: string): void {
    const issues = world.nodes.flatMap((node) =>
        node.issues.map((issue) => `${node.discriminator}: ${issue}`));

    note.replaceChildren();

    if (issues.length > 0) {
        note.classList.add("has-issues");
        issues.forEach((issue) => {
            const line = document.createElement("div");
            line.textContent = `⚠ ${issue}`;
            note.appendChild(line);
        });
    } else {
        note.classList.remove("has-issues");
    }

    const counts = document.createElement("div");
    counts.className = "counts";
    counts.textContent = summary;
    note.appendChild(counts);

    note.classList.remove("hidden");
}

function worldTabLabel(world: WorldGraph): string {
    return `${world.title} (${world.nodes.length})`;
}

/**
 * States what the world holds and what was actually drawn from it.
 *
 * The two can disagree — a node that fails to render leaves no trace otherwise — and telling
 * them apart from the panel itself is quicker than going through an output channel.
 */
function summarise(world: WorldGraph, drawn: { nodes: number; edges: number } | undefined): string {
    const held = `${world.nodes.length} endurant${world.nodes.length === 1 ? "" : "s"}, `
        + `${world.edges.length} relation${world.edges.length === 1 ? "" : "s"}`;

    if (!drawn) {
        return held;
    }
    if (drawn.nodes === world.nodes.length && drawn.edges === world.edges.length) {
        return held;
    }
    return `${held} — drawn: ${drawn.nodes} node(s), ${drawn.edges} edge(s)`;
}

document.getElementById("next")?.addEventListener("click", () => {
    vscode.postMessage({ command: "next" });
});

// Docking the panel or dragging its edge changes the viewport without redrawing, which would
// otherwise leave the graph framed for a width it no longer has.
window.addEventListener("resize", () => {
    graph?.resize();
    graph?.fit(undefined, 24);
    worldMap?.resize();
    worldMap?.fit(undefined, 10);
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
