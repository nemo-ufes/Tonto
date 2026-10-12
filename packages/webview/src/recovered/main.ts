// Recovered from Tonto Visualizer 0.1.53 (MIT); see tonto-cli view/THIRD-PARTY-NOTICES.md.
import "./canvas.css";
/**
 * The panel.
 *
 * It draws what the host sends and reports what the pointer did. The one piece
 * of state it owns is the viewport -- where the diagram is scrolled and how far
 * it is zoomed -- because that is about looking rather than about the model, and
 * because losing it on every keystroke would make the panel unusable while
 * anything is being typed.
 */

import type {
    ContentOptions, DisplayOptions, EdgeRoute, LayoutOptions, ViewConstraints, ViewModel
} from 'tonto-cli/lib/view/model/index.js';
import { natureLegend } from 'tonto-cli/lib/view/model/palette.js';
import { ASSOCIATION_DISTANCE, clampAssociationDistance, defaultLayoutOptions } from 'tonto-cli/lib/view/model/options.js';
import type { Corner, Handle, Point, Rect, Size } from './draw.js';
import {
    CORNERS, cornerOf, curvedRoute, darkTheme, derivationLine, distanceToPath, drawDerivation, drawNode, dropHandle,
    handlesFor, lightTheme, moveHandle, overlaps, pathData, rectBetween, relationSpreads, render, resizeTo, routeEdge, segmentHitsRect, sizeOf,
    trianglePoints
} from './draw.js';
import type { FilterItem } from './protocol.js';

interface HostApi {
    postMessage(message: unknown): void;
    getState(): { scale?: number; x?: number; y?: number; fit?: boolean } | undefined;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): HostApi;

const host = acquireVsCodeApi();
const viewport = element('viewport');
const canvas = element('canvas');
const scaleLabel = element('scale');
const optionsPanel = element('options');
const legendPanel = element('legend');
const staleLabel = element('stale');

let view: ViewModel = { groups: [], nodes: [], edges: [], gensets: [] };
let positions: Record<string, Rect> = {};
let routes: Record<string, EdgeRoute> = {};
let display: DisplayOptions | undefined;
let content: ContentOptions | undefined;
let layout: LayoutOptions | undefined;
let constraints: ViewConstraints = { pinned: [], alignments: [], distributions: [] };
let packages: string[] = [];
let filters: FilterItem[] = [];
let dark = false;
let selection = new Set<string>();
const openFilterSections = new Set<FilterItem['kind']>();

const stored = host.getState() ?? {};
let scale = stored.scale ?? 1;
let panX = stored.x ?? 0;
let panY = stored.y ?? 0;
let fitMode = stored.fit ?? false;
let viewportTimer: ReturnType<typeof setTimeout> | undefined;
function persistViewport(): void {
    clearTimeout(viewportTimer);
    viewportTimer = setTimeout(() => host.postMessage({
        type: 'viewport', viewport: { zoom: scale, x: panX, y: panY }
    }), 250);
}
let bounds: Rect = { x: 0, y: 0, width: 1, height: 1 };
/** Set while a drag is in flight, so a redraw does not yank the boxes back. */
let dragging: DragState | undefined;
/** The solid route handle that Delete or Backspace will remove. */
let selectedBend: { edge: string; index: number } | undefined;
/** Sampled geometry of what is visible, used for selection and obstruction. */
let paths: Record<string, Point[]> = {};
/** Editable guide polylines; curved paths are rendered and sampled from these. */
let guides: Record<string, Point[]> = {};
/** Where the pointer last was, in diagram coordinates, for a drag that ends. */
let lastPoint: Point | undefined;

interface DragState {
    ids: string[];
    startX: number;
    startY: number;
    moved: boolean;
    origin: Record<string, Rect>;
    /** Set instead of `ids` when what is being dragged is a bend in a line. */
    route?: { edge: string; handle: Handle; from: Point[] };
    /** Set instead of `ids` when what is being dragged is the corner of a card. */
    resize?: { id: string; corner: Corner; from: Rect; least: Size };
    /** Set instead of `ids` when what is being dragged is a rubber band. */
    marquee?: { from: Point; add: boolean };
}

window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'model') {
        view = message.view;
        if (message.viewport && !dragging) {
            scale = message.viewport.zoom;
            panX = message.viewport.x;
            panY = message.viewport.y;
        }
        const visible = new Set([
            ...view.nodes.map(node => node.id),
            ...view.edges.map(edge => edge.id)
        ]);
        const pruned = new Set([...selection].filter(id => visible.has(id)));
        const selectionChanged = pruned.size !== selection.size;
        selection = pruned;
        if (selectedBend && !visible.has(selectedBend.edge)) {
            selectedBend = undefined;
        }
        positions = message.positions;
        routes = message.routes;
        display = message.display;
        content = message.content;
        layout = message.layout;
        constraints = message.constraints ?? { pinned: [], alignments: [], distributions: [] };
        packages = message.packages;
        filters = message.filters;
        staleLabel.hidden = !message.stale;
        staleLabel.textContent = message.stale ? `does not parse — showing the last good diagram` : '';
        // The reason, which the label has no room for, so the modeller can see
        // why the editor and the diagram disagree about the same text.
        staleLabel.title = message.stale ?? '';
        if (message.fit) {
            fitMode = true;
        }
        updateFitToggle();
        updateDistanceControl();
        draw();
        if (selectionChanged) {
            reportSelection();
        } else {
            updateArrangeTitle();
        }
        if (optionsPanel.hidden === false) {
            fillOptions();
        }
        fillLegend();
    } else if (message.type === 'select') {
        selection = new Set(message.ids);
        if (selectedBend && !selection.has(selectedBend.edge)) {
            selectedBend = undefined;
        }
        applySelection();
        updateArrangeTitle();
        if (!optionsPanel.hidden) {
            fillOptions();
        }
    } else if (message.type === 'rasterise') {
        void rasterise(message.id, message.svg, message.scale);
    } else if (message.type === 'theme') {
        dark = message.dark;
        document.body.classList.toggle('dark', dark);
        draw();
    }
});

/**
 * Draws an SVG as pixels, which is the one thing the host cannot do for itself.
 *
 * Through a `data:` URI rather than a blob, because the panel's content policy
 * admits `data:` for images and nothing else -- and a self-contained SVG drawn
 * from one does not taint the canvas, so the pixels can be read back out. The
 * SVG carries its own styles and its own font stack; there is nothing in it to
 * fetch, which is what makes both of those true.
 */
async function rasterise(id: number, svg: string, scale: number): Promise<void> {
    try {
        const bytes = new TextEncoder().encode(svg);
        let binary = '';
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('the drawing could not be read as an image'));
            image.src = `data:image/svg+xml;base64,${btoa(binary)}`;
        });
        const surface = document.createElement('canvas');
        surface.width = Math.max(1, Math.round(image.naturalWidth * scale));
        surface.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = surface.getContext('2d');
        if (!context) {
            throw new Error('this panel has no 2d canvas');
        }
        context.drawImage(image, 0, 0, surface.width, surface.height);
        host.postMessage({ type: 'raster', id, data: surface.toDataURL('image/png').split(',')[1] });
    } catch (error) {
        host.postMessage({ type: 'raster', id, error: error instanceof Error ? error.message : String(error) });
    }
}

function draw(): void {
    if (!display) {
        return;
    }
    const drawn = render({
        view,
        positions,
        routes,
        display,
        direction: layout?.direction,
        theme: dark ? darkTheme : lightTheme,
        selection: [...selection]
    });
    bounds = drawn.bounds;
    paths = drawn.paths;
    guides = drawn.guides;
    canvas.innerHTML = drawn.svg;
    drawHandles();
    if (fitMode) {
        fitViewport();
    } else {
        applyViewport();
    }
}

/**
 * The handles on the selected line, over the drawing rather than in it.
 *
 * They are an offer to change the arrangement, not part of the picture, so they
 * are added here and never by `render` -- which also draws the export, and an
 * exported SVG with grab handles in it would be nobody's idea of a diagram.
 *
 * Only one line at a time. Every line at once is a field of dots, and the
 * question a handle asks -- do you want this line to go round there? -- is
 * about the line the modeller has in front of them.
 */
function drawHandles(): void {
    const svg = canvas.querySelector('svg');
    svg?.querySelector('.tv-handles')?.remove();
    const selected = [...selection];
    const id = selected.length === 1 ? selected[0]! : undefined;
    if (!svg || !id || dragging?.ids.length) {
        return;
    }
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'tv-handles');
    group.setAttribute('data-handles', id);
    // Sized against the zoom, so a handle is the same target on screen whether
    // the diagram is being read whole or a corner of it is filling the panel.
    const radius = 3.5 / scale;
    const rect = positions[id];
    const points = guides[id];
    if (rect) {
        for (const corner of CORNERS) {
            const at = cornerOf(rect, corner);
            const grip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            grip.setAttribute('class', 'tv-grip');
            grip.setAttribute('data-grip', corner);
            grip.setAttribute('x', String(at.x - radius));
            grip.setAttribute('y', String(at.y - radius));
            grip.setAttribute('width', String(radius * 2));
            grip.setAttribute('height', String(radius * 2));
            grip.setAttribute('stroke-width', String(1.4 / scale));
            group.append(grip);
        }
    } else if (points) {
        for (const [index, handle] of handlesFor(points).entries()) {
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            const selected = handle.kind === 'bend' && selectedBend?.edge === id
                && selectedBend.index === handle.index;
            dot.setAttribute('class', `tv-handle${handle.kind === 'new' ? ' tv-handle-new' : ''}`
                + `${selected ? ' tv-handle-selected' : ''}`);
            dot.setAttribute('data-handle', String(index));
            dot.setAttribute('cx', String(handle.at.x));
            dot.setAttribute('cy', String(handle.at.y));
            dot.setAttribute('r', String(handle.kind === 'new' ? radius * 0.8 : radius));
            dot.setAttribute('stroke-width', String(1.4 / scale));
            dot.setAttribute('role', 'button');
            dot.setAttribute('aria-label', handle.kind === 'new'
                ? 'Drag to add a bend' : 'Drag to move bend; Delete or Backspace to remove');
            if (handle.kind === 'bend') {
                dot.setAttribute('aria-selected', String(selected));
            }
            group.append(dot);
        }
    }
    svg.append(group);
}

/** The corner grip a pointer is on, and the card it belongs to. */
function gripAt(target: Element): { id: string; corner: Corner } | undefined {
    const grip = target.closest('[data-grip]');
    const id = grip?.parentElement?.getAttribute('data-handles') ?? undefined;
    const corner = grip?.getAttribute('data-grip') as Corner | undefined;
    return id && corner && positions[id] ? { id, corner } : undefined;
}

/** The size a card's content needs, which is the least it may be drawn at. */
function leastSize(id: string): Size {
    const node = view.nodes.find(candidate => candidate.id === id);
    return node && display ? sizeOf(node, display) : { width: 120, height: 42 };
}

/**
 * Where the pointer is, in the coordinates the diagram is drawn in.
 *
 * Asked of the SVG rather than worked out from the pan and the zoom: the same
 * two numbers derived twice drift apart, and this one is used to decide what was
 * clicked on.
 */
function diagramPoint(event: { clientX: number; clientY: number }): Point | undefined {
    const svg = canvas.querySelector('svg');
    const matrix = svg?.getScreenCTM()?.inverse();
    if (!svg || !matrix) {
        return undefined;
    }
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const at = point.matrixTransform(matrix);
    return { x: at.x, y: at.y };
}

/**
 * The line near enough the pointer to have been aimed at.
 *
 * A line is a stroke a pixel and a bit wide, which is a hard thing to hit and an
 * impossible one where its own label sits over it -- and a line has to be
 * selected before its route can be taken hold of. So what is under the pointer
 * decides only when it is a box or a handle; for lines, the pointer is measured
 * against the polylines themselves, and the nearest within reach wins.
 */
function nearestLine(event: { clientX: number; clientY: number }): string | undefined {
    const at = diagramPoint(event);
    if (!at) {
        return undefined;
    }
    const reach = 6 / scale;
    let best: { edge: string; distance: number } | undefined;
    for (const [edge, points] of Object.entries(paths)) {
        const distance = distanceToPath(at, points);
        if (distance <= reach && (!best || distance < best.distance)) {
            best = { edge, distance };
        }
    }
    return best?.edge;
}

/**
 * The line a label belongs to, for a pointer that is on the label.
 *
 * Labels are drawn in a layer of their own, over everything, so what is under
 * the pointer on one is a `<text>` with no line anywhere above it -- and being
 * placed a little off its line, it is often too far from it to be found by
 * distance either. Each carries the id of what it says something about, which
 * is the answer without either guess.
 */
function labelOwner(target: Element): string | undefined {
    return target.closest('[data-for]')?.getAttribute('data-for') ?? undefined;
}

/** The handle a pointer is on, and the line it belongs to. */
function handleAt(target: Element): { edge: string; handle: Handle } | undefined {
    const dot = target.closest('[data-handle]');
    const edge = dot?.parentElement?.getAttribute('data-handles') ?? undefined;
    const points = edge ? guides[edge] : undefined;
    const handle = points ? handlesFor(points)[Number(dot!.getAttribute('data-handle'))] : undefined;
    return edge && handle ? { edge, handle } : undefined;
}

/**
 * The rubber band, over the drawing rather than in it.
 *
 * In the diagram's own coordinates, inside the SVG, so it pans and zooms with
 * everything else and needs no arithmetic of its own to stay under the pointer.
 */
function drawMarquee(rect: Rect | undefined): void {
    const svg = canvas.querySelector('svg');
    svg?.querySelector('.tv-marquee')?.remove();
    if (!svg || !rect) {
        return;
    }
    const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    band.setAttribute('class', 'tv-marquee');
    band.setAttribute('x', String(rect.x));
    band.setAttribute('y', String(rect.y));
    band.setAttribute('width', String(rect.width));
    band.setAttribute('height', String(rect.height));
    band.setAttribute('stroke-width', String(1 / scale));
    band.setAttribute('stroke-dasharray', `${4 / scale} ${3 / scale}`);
    svg.append(band);
}

/** Draws one card at its current size, without redrawing anything else. */
function repaintNode(id: string): void {
    const node = view.nodes.find(candidate => candidate.id === id);
    const group = canvas.querySelector(`[data-node="${cssEscape(id)}"]`);
    const rect = positions[id];
    if (!node || !group || !rect || !display) {
        return;
    }
    group.outerHTML = drawNode(node, rect, display, dark ? darkTheme : lightTheme, selection.has(id));
}

/** Draws one line from its editable guide, without redrawing anything else. */
function repaint(edge: string, points: Point[]): void {
    const group = canvas.querySelector(`[data-edge="${cssEscape(edge)}"]`);
    const path = group?.querySelector('path');
    const definition = view.edges.find(candidate => candidate.id === edge);
    const source = definition ? positions[definition.source] : undefined;
    const target = definition ? positions[definition.target] : undefined;
    const drawn = display?.routing === 'curved' && source && target
        ? curvedRoute(points, source, target, Object.values(positions))
        : { points, data: pathData(points) };
    guides[edge] = points;
    paths[edge] = drawn.points;
    path?.setAttribute('d', drawn.data);
    if (definition?.kind === 'generalization') {
        const marker = group?.querySelector('.tv-marker');
        const tip = drawn.points[drawn.points.length - 1];
        const from = drawn.points[drawn.points.length - 2] ?? drawn.points[0];
        if (marker && tip && from) {
            marker.setAttribute('points', trianglePoints(tip, from)
                .map(point => `${point.x},${point.y}`).join(' '));
        }
    }
    repaintDerivations(relation => relation === edge);
}

/**
 * A derivation leaves the line of its relation and points at its relator, so
 * it follows either one while it is dragged -- left behind, it pointed from
 * where the association used to run.
 */
function repaintDerivations(affected: (relation: string, supplier: string) => boolean): void {
    for (const group of Array.from(canvas.querySelectorAll('[data-derivation]'))) {
        const relation = group.getAttribute('data-derivation')!;
        const supplier = group.getAttribute('data-supplier')!;
        const points = paths[relation];
        const rect = positions[supplier];
        if (!affected(relation, supplier) || !points || !rect) {
            continue;
        }
        const line = derivationLine(points, rect, Object.values(positions));
        if (line) {
            group.outerHTML = drawDerivation(relation, supplier, line);
        } else {
            group.innerHTML = '';
        }
    }
}

function applyViewport(): void {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    scaleLabel.textContent = `${Math.round(scale * 100)}%`;
    host.setState({ scale, x: panX, y: panY, fit: fitMode });
    persistViewport();
    drawHandles();
}

function fitViewport(): void {
    const padding = 12;
    scale = clamp(Math.min(
        (viewport.clientWidth - padding) / bounds.width,
        (viewport.clientHeight - padding) / bounds.height
    ), 0.08, 2);
    panX = (viewport.clientWidth - bounds.width * scale) / 2;
    panY = (viewport.clientHeight - bounds.height * scale) / 2;
    applyViewport();
}

function updateFitToggle(): void {
    const button = element('fit');
    button.setAttribute('aria-pressed', String(fitMode));
    button.title = fitMode ? 'Stop fitting to view' : 'Fit to view';
}

function setFitMode(active: boolean): void {
    fitMode = active;
    updateFitToggle();
    if (active) {
        fitViewport();
    } else {
        applyViewport();
    }
}

function fit(): void {
    setFitMode(true);
}

function zoomAt(next: number, clientX: number, clientY: number): void {
    fitMode = false;
    updateFitToggle();
    const rect = viewport.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const diagramX = (x - panX) / scale;
    const diagramY = (y - panY) / scale;
    scale = clamp(next, 0.08, 6);
    panX = x - diagramX * scale;
    panY = y - diagramY * scale;
    applyViewport();
}

viewport.addEventListener('pointerdown', event => {
    const target = event.target as Element;
    viewport.setPointerCapture(event.pointerId);

    // Before anything else: a grip or a handle sits over the thing it belongs
    // to, which is already selected, so neither the selection nor a pan is
    // wanted -- and a grip on a card's corner is inside the card.
    const grip = gripAt(target);
    if (grip) {
        dragging = {
            ids: [], startX: event.clientX, startY: event.clientY, moved: false, origin: {},
            resize: {
                id: grip.id, corner: grip.corner,
                from: { ...positions[grip.id]! }, least: leastSize(grip.id)
            }
        };
        return;
    }

    const held = handleAt(target);
    if (held) {
        selectedBend = held.handle.kind === 'bend'
            ? { edge: held.edge, index: held.handle.index }
            : undefined;
        dragging = {
            ids: [], startX: event.clientX, startY: event.clientY, moved: false, origin: {},
            route: { edge: held.edge, handle: held.handle, from: guides[held.edge]! }
        };
        return;
    }

    selectedBend = undefined;

    const nodeGroup = target.closest('[data-node]');
    const id = nodeGroup?.getAttribute('data-node') ?? undefined;

    if (!id) {
        const edgeGroup = target.closest('[data-edge]');
        const edgeId = edgeGroup?.getAttribute('data-edge')
            ?? labelOwner(target)
            ?? nearestLine(event);
        // Alt, or the middle button, is what panning is held behind once the
        // plain drag on the background is spent on choosing things.
        const pans = event.altKey || event.button === 1;
        // Held shift is a rubber band being added to, so what it is adding to
        // has to survive the press that starts it -- and moving the diagram
        // about is not a change of mind about what is selected either.
        if (edgeId || !(event.shiftKey || pans)) {
            // Shift adds a line to the selection as it adds a class: choosing
            // three lines to hide them meant clicking each of them and losing
            // the last two.
            selection = edgeId
                ? new Set(event.shiftKey ? [...selection, edgeId] : [edgeId])
                : new Set();
            applySelection();
            reportSelection();
        }
        if (!edgeId) {
            const from = diagramPoint(event);
            dragging = {
                ids: [], startX: event.clientX, startY: event.clientY, moved: false, origin: {},
                ...(pans || !from ? {} : { marquee: { from, add: event.shiftKey } })
            };
        }
        return;
    }

    if (!selection.has(id)) {
        selection = event.shiftKey ? new Set([...selection, id]) : new Set([id]);
        applySelection();
        reportSelection();
    }
    const ids = [...selection].filter(candidate => positions[candidate]);
    dragging = {
        ids,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        origin: Object.fromEntries(ids.map(candidate => [candidate, { ...positions[candidate]! }]))
    };
});

viewport.addEventListener('pointermove', event => {
    if (!dragging) {
        return;
    }
    const dx = (event.clientX - dragging.startX) / scale;
    const dy = (event.clientY - dragging.startY) / scale;
    if (!dragging.moved && Math.hypot(dx, dy) < 3) {
        return;
    }
    dragging.moved = true;

    const band = dragging.marquee;
    if (band) {
        const at = diagramPoint(event);
        if (at) {
            lastPoint = at;
            drawMarquee(rectBetween(band.from, at));
        }
        return;
    }

    const resize = dragging.resize;
    if (resize) {
        const at = diagramPoint(event);
        if (at) {
            // Snapped like everything else, so two cards pulled to the same
            // width end up the same width rather than nearly the same.
            positions[resize.id] = resizeTo(resize.from, resize.corner,
                { x: snap(at.x), y: snap(at.y) }, resize.least);
            repaintNode(resize.id);
            redrawIncidentEdges(new Set([resize.id]));
            drawHandles();
        }
        return;
    }

    const route = dragging.route;
    if (route) {
        // Snapped like a box is, so a bend put level with a border stays level.
        const at = { x: snap(route.handle.at.x + dx), y: snap(route.handle.at.y + dy) };
        const points = moveHandle(route.from, route.handle, at);
        selectedBend = { edge: route.edge, index: route.handle.index };
        repaint(route.edge, points);
        drawHandles();
        return;
    }

    if (dragging.ids.length === 0) {
        if (fitMode) {
            fitMode = false;
            updateFitToggle();
        }
        panX += event.clientX - dragging.startX;
        panY += event.clientY - dragging.startY;
        dragging.startX = event.clientX;
        dragging.startY = event.clientY;
        applyViewport();
        return;
    }

    for (const id of dragging.ids) {
        const origin = dragging.origin[id]!;
        // Snapped to an 8px grid, so two boxes dragged to the same height line
        // up rather than nearly lining up.
        positions[id] = { ...origin, x: snap(origin.x + dx), y: snap(origin.y + dy) };
        const group = canvas.querySelector(`[data-node="${cssEscape(id)}"]`) as SVGGElement | null;
        group?.setAttribute('transform', `translate(${positions[id]!.x - origin.x}, ${positions[id]!.y - origin.y})`);
    }
    const moved = new Set(dragging.ids);
    if (touchesGenset(moved)) {
        // A tree is not a line of its own -- it is drawn once from every
        // child's position at once, with a bus depth and leg bends chosen
        // around all of them together -- so there is no single incident path
        // to nudge the way an ordinary association's is. Cheapest correct
        // answer during the drag itself is the same full redraw the drag
        // already gets when it ends.
        draw();
    } else {
        redrawIncidentEdges(moved);
    }
});

/** Whether any of these classes is a generalization set's general or a specific in one. */
function touchesGenset(ids: ReadonlySet<string>): boolean {
    return view.gensets.some(genset =>
        (genset.general !== undefined && ids.has(genset.general)) || genset.specifics.some(id => ids.has(id)));
}

viewport.addEventListener('pointerup', () => {
    const drag = dragging;
    dragging = undefined;
    if (drag?.marquee) {
        drawMarquee(undefined);
        if (drag.moved) {
            const caught = rectBetween(drag.marquee.from, lastPoint ?? drag.marquee.from);
            // Classes only. A marquee is drawn to gather things to move, hide or
            // arrange, and every one of those is about the boxes; a line caught
            // because it happens to pass through would be a fourth thing the
            // modeller did not point at.
            const inside = view.nodes
                .filter(node => positions[node.id] && overlaps(positions[node.id]!, caught))
                .map(node => node.id);
            selection = drag.marquee.add ? new Set([...selection, ...inside]) : new Set(inside);
            applySelection();
            reportSelection();
        }
        return;
    }
    if (drag?.resize && drag.moved) {
        keepSize(drag.resize.id, positions[drag.resize.id]!);
        return;
    }
    if (drag?.route && drag.moved) {
        // The whole polyline, ends included: a route and the boxes it runs
        // between are one arrangement, and half of one is a line to a corner.
        keepRoute(drag.route.edge, guides[drag.route.edge]);
        return;
    }
    if (!drag || !drag.moved || drag.ids.length === 0) {
        return;
    }
    const moved = new Set(drag.ids);
    const rerouted = view.edges
        .filter(edge => {
            if (moved.has(edge.source) || moved.has(edge.target)) {
                return true;
            }
            const points = routes[edge.id]?.points;
            return points !== undefined && drag.ids.some(id => {
                const rect = positions[id];
                return rect !== undefined && points.slice(1).some((point, index) =>
                    segmentHitsRect(points[index]!, point, rect, 4));
            });
        })
        .map(edge => edge.id);
    host.postMessage({
        type: 'moved',
        // Where they are, and nothing about how big they are: a size in the
        // file is a size the card may never go below, and a drag is not a
        // request to freeze the card at whatever it happens to hold today.
        positions: Object.fromEntries(drag.ids.map(id => [id, {
            x: positions[id]!.x,
            y: positions[id]!.y
        }])),
        rerouted
    });
    for (const edge of rerouted) {
        delete routes[edge];
    }
    draw();
});

/**
 * Hands a route to the host, or hands the line back to the router.
 *
 * The host writes the view file and is the only thing that knows where it is, so
 * the panel says what happened and redraws from what it has. It does not wait to
 * be told again: the host answers a reroute by writing, not by re-sending, which
 * is what keeps a drag from flickering.
 */
function keepRoute(edge: string, points: Point[] | undefined): void {
    if (points) {
        routes[edge] = { points };
    } else {
        delete routes[edge];
        if (selectedBend?.edge === edge) {
            selectedBend = undefined;
        }
    }
    host.postMessage({ type: 'rerouted', edge, ...(points ? { route: { points } } : {}) });
    draw();
}

/**
 * Tells the host where a card is and, when it was resized, how big.
 *
 * There is no message of its own for a resize: a placement carries an optional
 * size, so a card that was pulled bigger reports one and a card that was only
 * moved does not. A placement without a size is how the file says "as big as
 * what it holds", which is what fitting a card back to its content is.
 */
function keepSize(id: string, rect: Rect, sized = true): void {
    host.postMessage({
        type: 'moved',
        positions: { [id]: { x: rect.x, y: rect.y, ...(sized ? { width: rect.width, height: rect.height } : {}) } },
        rerouted: view.edges.filter(edge => edge.source === id || edge.target === id).map(edge => edge.id),
        resized: true
    });
    for (const edge of view.edges) {
        if (edge.source === id || edge.target === id) {
            delete routes[edge.id];
        }
    }
    draw();
}

/** While a node is being dragged its edges follow it, without a full redraw. */
function redrawIncidentEdges(moved: Set<string>): void {
    const spreads = relationSpreads(view.edges.filter(edge => guides[edge.id] !== undefined));
    for (const edge of view.edges) {
        if (!moved.has(edge.source) && !moved.has(edge.target)) {
            continue;
        }
        const source = positions[edge.source];
        const target = positions[edge.target];
        const path = canvas.querySelector(`[data-edge="${cssEscape(edge.id)}"] path`) as SVGPathElement | null;
        if (!source || !target || !path) {
            continue;
        }
        const points = routeEdge(source, target, {
            style: display?.routing ?? 'straight',
            ...(spreads.get(edge.id) ? { spread: spreads.get(edge.id)! } : {})
        });
        repaint(edge.id, points);
    }
    repaintDerivations((_relation, supplier) => moved.has(supplier));
}

viewport.addEventListener('dblclick', event => {
    // What is under the pointer, rather than what the event says it hit. Every
    // pointerdown takes pointer capture -- a box being dragged has to keep
    // receiving moves once the pointer has left it -- and a captured pointer
    // retargets the click that follows to the element holding the capture. So
    // `event.target` on a double-click is the viewport whatever was clicked,
    // and asking it for a class found none: double-clicking a class fitted the
    // diagram to the window instead of opening its declaration.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    if (!under) {
        fit();
        return;
    }
    const grip = gripAt(under);
    if (grip) {
        // Back to the size of what it holds. The card body still opens the
        // declaration, which is the gesture a reader uses far more often.
        positions[grip.id] = { ...positions[grip.id]!, ...leastSize(grip.id) };
        keepSize(grip.id, positions[grip.id]!, false);
        return;
    }
    const held = handleAt(under);
    if (held?.handle.kind === 'bend') {
        // Only a bend can be dropped. A handle on a stretch is not one yet, and
        // swallowing the gesture there would make the line's own double-click
        // stop working wherever a handle happens to sit: selecting a line draws
        // one on the middle of every stretch, which is exactly where its labels
        // are, so double-clicking the label of a chosen line did nothing at all.
        keepRoute(held.edge, dropHandle(guides[held.edge]!, held.handle.index));
        return;
    }
    const target = under.closest('[data-node]') ?? under.closest('[data-edge]');
    const id = target?.getAttribute('data-node')
        ?? target?.getAttribute('data-edge')
        ?? labelOwner(under)
        ?? held?.edge
        ?? nearestLine(event);
    if (id) {
        host.postMessage({ type: 'reveal', id });
    } else {
        fit();
    }
});

viewport.addEventListener('wheel', event => {
    event.preventDefault();
    // A trackpad's pinch sends a wheel event with `ctrlKey` set -- the
    // browsers' own way of folding the gesture into the wheel event, since
    // nobody pinches a trackpad while holding Control. An ordinary two-finger
    // scroll carries no such key, and pans, the way every other Mac app reads
    // it; a plain mouse wheel has no gesture to tell apart from scrolling
    // either, so it pans too, and zooms the way it always has -- with the
    // buttons, or Ctrl/⌘ held down.
    if (event.ctrlKey || event.metaKey) {
        // A pinch fires many of these in a burst, and 1.12 compounded across a
        // burst is most of the zoom range in the time it takes to notice the
        // gesture registered at all.
        zoomAt(scale * (event.deltaY < 0 ? 1.05 : 1 / 1.05), event.clientX, event.clientY);
        return;
    }
    panX -= event.deltaX;
    panY -= event.deltaY;
    fitMode = false;
    updateFitToggle();
    applyViewport();
}, { passive: false });

window.addEventListener('keydown', event => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
        const bend = selectedBend;
        const points = bend ? guides[bend.edge] : undefined;
        if (bend && points && bend.index > 0 && bend.index < points.length - 1) {
            event.preventDefault();
            selectedBend = undefined;
            keepRoute(bend.edge, dropHandle(points, bend.index));
            return;
        }
        hideSelection();
        return;
    }
    // The keys every editor uses, since the panel is where the change was made.
    // VS Code's own undo is the editor's and takes back what was typed; this one
    // takes back what was arranged, and the two never see each other's keystroke
    // because only the focused one gets it.
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        const redo = key === 'y' || (key === 'z' && event.shiftKey);
        if (key === 'z' || key === 'y') {
            event.preventDefault();
            host.postMessage({ type: redo ? 'redo' : 'undo' });
        }
    }
});

function hideSelection(): void {
    const ids = hideableSelection();
    if (ids.length === 0) {
        return;
    }
    host.postMessage({ type: 'hide', ids });
    const hidden = new Set(ids);
    selection = new Set([...selection].filter(id => !hidden.has(id)));
    reportSelection();
}

/** Only concepts exposed by the class and association filters can be hidden. */
function hideableSelection(): string[] {
    const hideable = new Set([
        ...view.nodes.filter(node => node.kind === 'class').map(node => node.id),
        ...view.edges.filter(edge => edge.kind === 'relation').map(edge => edge.id)
    ]);
    return [...selection].filter(id => hideable.has(id));
}

function applySelection(): void {
    for (const group of Array.from(canvas.querySelectorAll('[data-node], [data-edge]'))) {
        const id = group.getAttribute('data-node') ?? group.getAttribute('data-edge');
        group.classList.toggle('tv-selected', id !== null && selection.has(id));
    }
    drawHandles();
}

function reportSelection(): void {
    host.postMessage({ type: 'selected', ids: [...selection] });
    updateArrangeTitle();
    if (!optionsPanel.hidden) {
        fillOptions();
    }
}

function updateArrangeTitle(): void {
    const selectedNodes = [...selection].filter(id => positions[id] !== undefined).length;
    element('arrange').title = selectedNodes > 0
        ? `Arrange ${selectedNodes} selected node${selectedNodes === 1 ? '' : 's'} automatically`
        : 'Arrange the whole diagram automatically';
    element('hide').toggleAttribute('disabled', hideableSelection().length === 0);
}

function updateDistanceControl(): void {
    const distance = layout?.associationDistance ?? defaultLayoutOptions.associationDistance;
    element('distance').textContent = `Distance ${distance}%`;
    (element('distanceDown') as HTMLButtonElement).disabled = distance <= ASSOCIATION_DISTANCE.minimum;
    (element('distanceUp') as HTMLButtonElement).disabled = distance >= ASSOCIATION_DISTANCE.maximum;
}

function changeDistance(amount: number): void {
    if (!layout) {
        return;
    }
    const associationDistance = clampAssociationDistance(layout.associationDistance + amount);
    if (associationDistance === layout.associationDistance) {
        return;
    }
    // Optimistic so repeated clicks accumulate while Arrange is still running;
    // the next model message confirms the saved value or restores it on failure.
    layout = { ...layout, associationDistance };
    updateDistanceControl();
    host.postMessage({ type: 'layout', layout: { associationDistance } });
}

element('zoomIn').addEventListener('click', () => zoomAt(scale * 1.2, centreX(), centreY()));
element('zoomOut').addEventListener('click', () => zoomAt(scale / 1.2, centreX(), centreY()));
element('fit').addEventListener('click', () => setFitMode(!fitMode));
element('newWindow').addEventListener('click', () => {
    setFitMode(true);
    host.postMessage({ type: 'moveToNewWindow' });
});
element('arrange').addEventListener('click', () => {
    const selectedNodes = [...selection].filter(id => positions[id] !== undefined);
    host.postMessage(selectedNodes.length > 0
        ? { type: 'autoLayout', only: selectedNodes }
        : { type: 'autoLayout' });
});
element('distanceDown').addEventListener('click', () => changeDistance(-ASSOCIATION_DISTANCE.step));
element('distanceUp').addEventListener('click', () => changeDistance(ASSOCIATION_DISTANCE.step));
element('hide').addEventListener('click', hideSelection);
// No format: the name the modeller gives the file in the dialog decides.
element('exportButton').addEventListener('click', () => host.postMessage({ type: 'export' }));
const optionsButton = element('optionsButton');
optionsButton.addEventListener('click', () => {
    optionsPanel.hidden = !optionsPanel.hidden;
    if (!optionsPanel.hidden) {
        fillOptions();
    }
});
// A panel that only the gear can close is a panel that has to be found again
// to be dismissed. Caught on the way down so it shuts before whatever was
// clicked -- the canvas, a button -- answers the same pointerdown.
window.addEventListener('pointerdown', event => {
    const target = event.target as Node | null;
    if (!optionsPanel.hidden && target
        && !optionsPanel.contains(target) && !optionsButton.contains(target)) {
        optionsPanel.hidden = true;
    }
}, true);

const followViewportSize = () => {
    if (fitMode) {
        fitViewport();
    }
};
window.addEventListener('resize', followViewportSize);
if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(followViewportSize).observe(viewport);
}
updateFitToggle();

/** The options panel is rebuilt from the state the host holds, never from itself. */
function fillOptions(): void {
    if (!display || !content) {
        return;
    }
    const displayRows: Array<[keyof DisplayOptions, string]> = [
        ['taxonomyOnly', 'Taxonomy only'],
        ['showAttributes', 'Attributes'],
        ['showCardinalities', 'Cardinalities'],
        ['showRelationNames', 'Relation names'],
        ['showRelationStereotypes', 'Relation stereotypes'],
        ['showRoleNames', 'Role names'],
        ['showEndDecorations', 'End decorations'],
        ['showColors', 'Nature colours'],
        ['showLegend', 'Nature colour legend'],
        ['showPackageGroups', 'Package boxes'],
        ['qualifyNames', 'Qualified names'],
        ['showDocumentation', 'Documentation on hover']
    ];
    const contentRows: Array<[keyof ContentOptions, string]> = [
        ['showExternalReferences', 'External references'],
        ['showDatatypes', 'Datatypes and enumerations'],
        ['showGensets', 'Generalization sets']
    ];

    optionsPanel.replaceChildren();
    const arrangement = [
        choice('Lines', [
            ['straight', 'Straight'], ['curved', 'Curved bends'], ['orthogonal', 'Right-angled']
        ], display.routing,
            value => host.postMessage({ type: 'display', display: { routing: value as DisplayOptions['routing'] } })),
        choice('Direction', [['DOWN', 'Top to bottom'], ['RIGHT', 'Left to right']], layout?.direction ?? 'DOWN',
            value => host.postMessage({ type: 'layout', layout: { direction: value as LayoutOptions['direction'] } })),
        choice('Maximum rank span', [
            ['1200', 'Compact'], ['2000', 'Balanced'], ['3000', 'Wide'], ['0', 'Unlimited']
        ], String(layout?.maxRankSpan ?? 2000),
            value => host.postMessage({ type: 'layout', layout: { maxRankSpan: Number(value) } })),
        // Package cohesion is a preference; visible package boxes turn it into
        // a hard container without changing taxonomy ranks.
        toggle('Cluster packages', layout?.groupByPackage ?? true,
            value => host.postMessage({ type: 'layout', layout: { groupByPackage: value } }))
    ];
    optionsPanel.append(section('Shape', arrangement));
    optionsPanel.append(section('Text', [
        choice('Typeface', [
            ['sans', 'Helvetica / Arial'],
            ['condensed', 'Condensed sans'],
            ['humanist', 'Aptos / Calibri'],
            ['geometric', 'Avenir / geometric'],
            ['serif', 'Times serif'],
            ['book', 'Georgia / book serif'],
            ['monospace', 'Monospace']
        ],
            display.fontFamily,
            value => host.postMessage({
                type: 'display', display: { fontFamily: value as DisplayOptions['fontFamily'] }
            })),
        choice('Text size', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], display.fontSize,
            value => host.postMessage({
                type: 'display', display: { fontSize: value as DisplayOptions['fontSize'] }
            }))
    ]));
    const selectedNodes = [...selection].filter(id => positions[id] !== undefined);
    const pinned = new Set(constraints.pinned);
    const unpins = selectedNodes.length > 0 && selectedNodes.every(id => pinned.has(id));
    optionsPanel.append(section('Constraints', [
        actionButton(
            unpins ? 'Unpin selected' : 'Pin selected',
            selectedNodes.length === 0,
            () => host.postMessage({ type: 'pin', ids: selectedNodes, pinned: !unpins })
        ),
        actionButton('Align vertical centres', selectedNodes.length < 2,
            () => host.postMessage({ type: 'constraint', action: 'align-x', ids: selectedNodes })),
        actionButton('Align horizontal centres', selectedNodes.length < 2,
            () => host.postMessage({ type: 'constraint', action: 'align-y', ids: selectedNodes })),
        actionButton('Distribute horizontally', selectedNodes.length < 3,
            () => host.postMessage({ type: 'constraint', action: 'distribute-x', ids: selectedNodes })),
        actionButton('Distribute vertically', selectedNodes.length < 3,
            () => host.postMessage({ type: 'constraint', action: 'distribute-y', ids: selectedNodes })),
        actionButton('Clear selected constraints', selectedNodes.length === 0,
            () => host.postMessage({ type: 'constraint', action: 'clear', ids: selectedNodes }))
    ]));
    optionsPanel.append(section('Drawn', displayRows.map(([key, label]) =>
        toggle(label, Boolean(display?.[key]), value => host.postMessage({ type: 'display', display: { [key]: value } })))));
    optionsPanel.append(section('Included', contentRows.map(([key, label]) =>
        toggle(label, Boolean(content?.[key]), value => host.postMessage({ type: 'content', content: { [key]: value } })))));

    const hidden = new Set(content.hidden ?? []);
    for (const kind of ['class', 'association'] as const) {
        const items = filters.filter(item => item.kind === kind);
        if (items.length > 0) {
            optionsPanel.append(filterSection(kind, items, hidden));
        }
    }

    if (packages.length > 0) {
        const included = new Set(content.includedPackages ?? packages);
        // The scope says where the view starts; the ticks below refine it. Both
        // are offered together so it is plain that choosing a scope puts every
        // tick back to what that scope holds.
        const rows = [choice('Scope', [['file', 'This file'], ['workspace', 'Whole workspace']], content.scope,
            value => host.postMessage({
                type: 'content', content: { scope: value as ContentOptions['scope'] }
            }))];
        if (packages.length > 1) {
            rows.push(...packages.map(name =>
                toggle(name, included.has(name), value => {
                    const next = new Set(included);
                    if (value) {
                        next.add(name);
                    } else {
                        next.delete(name);
                    }
                    host.postMessage({ type: 'content', content: { includedPackages: [...next] } });
                })));
        }
        optionsPanel.append(section('Packages', rows));
    }

    const hiddenIds = content.hidden ?? [];
    if (hiddenIds.length > 0) {
        const button = document.createElement('button');
        button.textContent = 'Reset class and association filters';
        button.addEventListener('click', () => host.postMessage({ type: 'show', ids: hiddenIds }));
        optionsPanel.append(section('Reset', [button]));
    }
}

function filterSection(
    kind: FilterItem['kind'], items: FilterItem[], hidden: ReadonlySet<string>
): HTMLElement {
    const wrapper = document.createElement('details');
    wrapper.className = 'section filter-section';
    wrapper.open = openFilterSections.has(kind);
    wrapper.addEventListener('toggle', () => {
        if (wrapper.open) {
            openFilterSections.add(kind);
        } else {
            openFilterSections.delete(kind);
        }
    });
    const heading = document.createElement('summary');
    heading.className = 'section-title';
    heading.textContent = `${kind === 'class' ? 'Classes' : 'Associations'} (${items.length})`;
    wrapper.append(heading, ...items.map(item => {
        const row = toggle(item.label, !item.ids.some(id => hidden.has(id)), shown =>
            host.postMessage({ type: shown ? 'show' : 'hide', ids: item.ids }));
        row.title = item.label;
        return row;
    }));
    return wrapper;
}

function fillLegend(): void {
    legendPanel.hidden = !display?.showColors || !display.showLegend;
    legendPanel.replaceChildren(...natureLegend.map(entry => {
        const row = document.createElement('div');
        row.className = 'legend-row';
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = entry.color;
        const text = document.createElement('span');
        text.textContent = entry.label;
        row.append(swatch, text);
        return row;
    }));
}

function section(title: string, rows: HTMLElement[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'section';
    const heading = document.createElement('div');
    heading.className = 'section-title';
    heading.textContent = title;
    wrapper.append(heading, ...rows);
    return wrapper;
}

/** A named choice, for the options that are not on-or-off. */
function choice(
    label: string, values: Array<[string, string]>, current: string, onChange: (value: string) => void
): HTMLElement {
    const row = document.createElement('label');
    row.className = 'row choice';
    const text = document.createElement('span');
    text.textContent = label;
    const select = document.createElement('select');
    for (const [value, name] of values) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = name;
        option.selected = value === current;
        select.append(option);
    }
    select.addEventListener('change', () => onChange(select.value));
    row.append(text, select);
    return row;
}

function toggle(label: string, value: boolean, onChange: (value: boolean) => void): HTMLElement {
    const row = document.createElement('label');
    row.className = 'row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));
    const text = document.createElement('span');
    text.textContent = label;
    row.append(input, text);
    return row;
}

function actionButton(label: string, disabled: boolean, onClick: () => void): HTMLElement {
    const button = document.createElement('button');
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
}

function element(id: string): HTMLElement {
    const found = document.getElementById(id);
    if (!found) {
        throw new Error(`the panel has no #${id}`);
    }
    return found;
}

function centreX(): number {
    return viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
}

function centreY(): number {
    return viewport.getBoundingClientRect().top + viewport.clientHeight / 2;
}

function clamp(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, value));
}

function snap(value: number): number {
    return Math.round(value / 8) * 8;
}

/** Ids hold `::` and `->`, neither of which a selector may carry unescaped. */
function cssEscape(value: string): string {
    return value.replace(/["\\]/g, '\\$&');
}

host.postMessage({ type: 'ready' });
