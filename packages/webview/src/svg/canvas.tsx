import * as React from "react";
import type { TontoDiagramGraph } from "tonto-cli";
import { invalidateMovedRoutes } from "tonto-cli/lib/view/model/index.js";
import type { ViewFile, ViewModel, Point, DisplayOptions } from "tonto-cli/lib/view/model/index.js";
import {
  render, placeNewNodes, drawnSizes, sizeOf, autoLayout, lightTheme, darkTheme,
  handlesFor, moveHandle, dropHandle,
} from "tonto-cli/lib/view/canvas/index.js";
import type { Positions } from "tonto-cli/lib/view/canvas/place.js";
import type { Handle } from "tonto-cli/lib/view/canvas/handles.js";
import { postToVscode } from "../diagram-editor/vscode";

export interface SvgCanvasHandle { exportSvg(): string }
interface Props {
  model: ViewModel; arrangement: ViewFile; isLegacy: boolean;
  graph?: TontoDiagramGraph; dark: boolean; onChange(value: ViewFile): void;
}
type Gesture = {
  kind: "move" | "resize" | "route" | "label" | "pan";
  origin: Point; seed: ViewFile; positions: Positions; ids: string[];
  id?: string; handle?: Handle; points?: Point[]; pan?: Point; screen?: Point; moved?: boolean;
};

/** The same recovered renderer produces the on-screen drawing and exported SVG. */
export const SvgCanvas = React.forwardRef<SvgCanvasHandle, Props>(function SvgCanvas(props, ref) {
  const { model, arrangement, isLegacy, dark, graph, onChange } = props;
  const root = React.useRef<HTMLDivElement>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [camera, setCamera] = React.useState(arrangement.viewport ?? { x: 40, y: 40, zoom: 1 });
  const wheelTimeout = React.useRef<number>();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const gesture = React.useRef<Gesture>();
  const current = React.useRef(arrangement);
  const first = React.useRef(true);
  const layoutGeneration = React.useRef(0);
  current.current = arrangement;
  const visible = React.useMemo(() => {
    const hidden = new Set(arrangement.content.hidden ?? []);
    const nodes = model.nodes.filter(node => !hidden.has(node.id));
    const ids = new Set(nodes.map(node => node.id));
    return { ...model, nodes, edges: model.edges.filter(edge => !hidden.has(edge.id) && ids.has(edge.source) && ids.has(edge.target)) };
  }, [model, arrangement.content.hidden]);
  const sizes = React.useMemo(() => Object.fromEntries(visible.nodes.map(node => [node.id, sizeOf(node, arrangement.display)])), [visible, arrangement.display]);
  const positions = React.useMemo(() => placeNewNodes(visible, sizes, arrangement.nodes), [visible, sizes, arrangement.nodes]);
  const picture = React.useMemo(() => render({ view: visible, positions, display: arrangement.display,
    direction: arrangement.layout.direction, routes: arrangement.edges,
    theme: dark ? darkTheme : lightTheme, selection: selected }), [visible, positions, arrangement, dark, selected]);
  const exportSvg = React.useCallback(() => render({ view: visible, positions, display: arrangement.display,
    direction: arrangement.layout.direction, routes: arrangement.edges, theme: dark ? darkTheme : lightTheme }).svg,
  [visible, positions, arrangement, dark]);
  React.useImperativeHandle(ref, () => ({ exportSvg }), [exportSvg]);

  function commit(next: ViewFile, viewport = camera) {
    layoutGeneration.current += 1;
    next = { ...next, viewport, nodes: { ...Object.fromEntries(Object.entries(positions).map(([id, rect]) => [id, { x: rect.x, y: rect.y }])), ...next.nodes } };
    current.current = next;
    onChange(next);
    if (isLegacy) {
      postToVscode({ type: "updateLayout", nodes: visible.nodes.map(node => ({
        id: node.id, specifier: graph?.nodes.find(item => item.id === node.id)?.specifier ?? node.id,
        x: next.nodes[node.id]?.x ?? positions[node.id]!.x, y: next.nodes[node.id]?.y ?? positions[node.id]!.y,
      })) });
    } else postToVscode({ type: "updateArrangement", arrangement: next });
  }
  function choose(ids: string[]) { setSelected(ids); postToVscode({ type: "selection", ids }); }
  function needView() { postToVscode({ type: "convertView" }); }
  function fit(bounds = picture.bounds) {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    const zoom = Math.min(1.4, Math.max(0.1, Math.min((box.width - 80) / bounds.width, (box.height - 120) / bounds.height)));
    const next = { x: (box.width - bounds.width * zoom) / 2 - bounds.x * zoom,
      y: (box.height - bounds.height * zoom) / 2 - bounds.y * zoom, zoom };
    setCamera(next); return next;
  }
  
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === "selectElements" && Array.isArray(message.ids)) setSelected(message.ids.filter((id: unknown): id is string => typeof id === "string"));
      if (message?.type === "rasterize" && (typeof message.id === "string" || typeof message.id === "number") && typeof message.svg === "string") {
        void rasterize(message.svg).then(dataUrl => postToVscode({ type: "rasterized", id: message.id, dataUrl }),
          reason => postToVscode({ type: "rasterized", id: message.id, error: String(reason) }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); if (wheelTimeout.current) window.clearTimeout(wheelTimeout.current); };
  }, []);
  React.useEffect(() => {
    if (!gesture.current && arrangement.viewport) setCamera(arrangement.viewport);
  }, [arrangement.viewport?.x, arrangement.viewport?.y, arrangement.viewport?.zoom]);
  // Cancel an in-flight layout when the host delivers a new model/document.
  React.useEffect(() => { layoutGeneration.current += 1; setBusy(false); }, [model]);
  React.useEffect(() => {
    if (first.current && visible.nodes.length) {
      first.current = false;
      if (arrangement.viewport) setCamera(arrangement.viewport);
      else fit();
      if (!isLegacy && Object.keys(arrangement.nodes).length === 0) void arrange(undefined, true);
    }
  }, [visible.nodes.length]);

  function point(event: { clientX: number; clientY: number }): Point {
    const bounds = root.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left - camera.x) / camera.zoom, y: (event.clientY - bounds.top - camera.y) / camera.zoom };
  }
  function start(event: React.PointerEvent, kind: Gesture["kind"], id?: string, handle?: Handle) {
    if (event.button !== 0 && event.button !== 1) return;
    if (isLegacy && (kind === "route" || kind === "label" || kind === "resize")) { needView(); return; }
    event.preventDefault(); event.stopPropagation();
    let ids = selected;
    if (id && kind !== "pan" && !selected.includes(id)) { ids = event.shiftKey ? [...selected, id] : [id]; choose(ids); }
    gesture.current = { kind, origin: point(event), seed: current.current, positions, ids, id, handle,
      points: id ? picture.guides[id] : undefined, pan: { x: camera.x, y: camera.y }, screen: { x: event.clientX, y: event.clientY } };
    root.current?.setPointerCapture(event.pointerId);
  }
  function invalidate(next: ViewFile, moved: string[]) {
    const measured = placeNewNodes(visible, sizes, next.nodes);
    return { ...next, edges: invalidateMovedRoutes(next, visible, moved, measured) };
  }

  function move(event: React.PointerEvent) {
    const active = gesture.current;
    if (!active) return;
    const at = point(event), dx = at.x - active.origin.x, dy = at.y - active.origin.y;
    if (Math.abs(dx) + Math.abs(dy) < 2 && !active.moved) return;
    active.moved = true;
    let next = { ...active.seed, nodes: { ...active.seed.nodes }, edges: { ...active.seed.edges } };
    if (active.kind === "pan") {
      setCamera(value => ({ ...value, x: active.pan!.x + event.clientX - active.screen!.x,
        y: active.pan!.y + event.clientY - active.screen!.y }));
      return;
    }
    if (active.kind === "move") {
      for (const id of active.ids) {
        const rect = active.positions[id];
        if (rect) next.nodes[id] = { ...active.seed.nodes[id], x: rect.x + dx, y: rect.y + dy };
      }
      next = invalidate(next, active.ids);
    } else if (active.kind === "resize") {
      const id = active.id!, rect = active.positions[id]!, least = sizes[id]!;
      next.nodes[id] = { x: rect.x, y: rect.y, width: Math.max(least.width, rect.width + dx), height: Math.max(least.height, rect.height + dy) };
      next = invalidate(next, [id]);
    } else if (active.kind === "route" && active.points && active.handle) {
      next.edges[active.id!] = { ...next.edges[active.id!], points: moveHandle(active.points, active.handle, at) };
    } else if (active.kind === "label") {
      const old = active.seed.edges[active.id!]?.labelOffset ?? { x: 0, y: 0 };
      next.edges[active.id!] = { ...next.edges[active.id!], labelOffset: { x: old.x + dx, y: old.y + dy } };
    }
    current.current = next;
    onChange(next);
  }
  function end(event: React.PointerEvent) {
    const active = gesture.current; gesture.current = undefined;
    if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
    if (active?.moved) { if (active.kind !== "pan") commit(current.current); else if (!isLegacy) commit({ ...current.current, viewport: camera }); }
  }
  function onPointerDown(event: React.PointerEvent) {
    const target = event.target as Element;
    const node = target.closest("[data-node]")?.getAttribute("data-node");
    const edge = target.closest("[data-edge]")?.getAttribute("data-edge");
    const label = target.closest("text[data-for]")?.getAttribute("data-for");
    if (node) start(event, "move", node);
    else if (label && visible.nodes.some(item => item.id === label)) start(event, "move", label);
    else if (label && visible.edges.some(item => item.id === label)) start(event, "label", label);
    else if (edge) { choose(event.shiftKey ? [...new Set([...selected, edge])] : [edge]); }
    else { if (!event.shiftKey) choose([]); start(event, "pan"); }
  }
  function display(patch: Partial<DisplayOptions>) {
    if (isLegacy) { needView(); return; }
    commit({ ...arrangement, display: { ...arrangement.display, ...patch } });
  }
  async function arrange(only?: string[], fitAfter = false) {
    const generation = ++layoutGeneration.current;
    setBusy(true); setError("");
    try {
      const result = await autoLayout(visible, drawnSizes(visible, sizes, arrangement.nodes), positions, {
        ...arrangement.layout, only, constraints: arrangement.constraints,
        routing: arrangement.display.routing, taxonomyOnly: arrangement.display.taxonomyOnly,
        packageContainers: arrangement.display.showPackageGroups,
      });
      if (generation !== layoutGeneration.current) return;
      if (arrangement.legacyDirection === "BT" || arrangement.legacyDirection === "RL") {
        const axis = arrangement.legacyDirection === "BT" ? "y" : "x";
        const dimension = axis === "x" ? "width" : "height";
        const rects = Object.values(result.positions);
        const min = Math.min(...rects.map(rect => rect[axis])), max = Math.max(...rects.map(rect => rect[axis] + rect[dimension]));
        for (const [id, rect] of Object.entries(result.positions)) {
          if (!arrangement.constraints.pinned.includes(id) && (!only || only.includes(id))) result.positions[id] = { ...rect, [axis]: min + max - rect[axis] - rect[dimension] };
        }
        result.routes = {};
      }
      const next = invalidate({ ...arrangement, nodes: { ...arrangement.nodes, ...result.positions } }, Object.keys(result.positions));
      for (const [id, points] of Object.entries(result.routes)) next.edges[id] = { ...next.edges[id], points };
      const viewport = fitAfter ? fit(render({ view: visible, positions: result.positions, display: next.display }).bounds) : undefined;
      commit(next, viewport);
    } catch (reason) { setError(`Layout failed: ${String(reason)}`); }
    finally { setBusy(false); }
  }
  function constraint(kind: "align" | "distribute", axis: "x" | "y") {
    if (isLegacy) { needView(); return; }
    const ids = selected.filter(id => positions[id]).sort((a, b) => positions[a]![axis] - positions[b]![axis]);
    if (ids.length < (kind === "align" ? 2 : 3)) return;
    const nodes = { ...arrangement.nodes }, firstPosition = positions[ids[0]!]![axis];
    const gap = (positions[ids[ids.length - 1]!]![axis] - firstPosition) / (ids.length - 1);
    ids.forEach((id, index) => { nodes[id] = { ...positions[id]!, [axis]: kind === "align" ? firstPosition : firstPosition + gap * index }; });
    const key = kind === "align" ? "alignments" : "distributions";
    commit(invalidate({ ...arrangement, nodes, constraints: { ...arrangement.constraints,
      [key]: [...arrangement.constraints[key], { axis, nodes: ids }] } }, ids));
  }
  function hide() {
    if (isLegacy) { needView(); return; }
    commit({ ...arrangement, content: { ...arrangement.content, hidden: [...new Set([...(arrangement.content.hidden ?? []), ...selected])] } }); choose([]);
  }
  function key(event: React.KeyboardEvent) {
    if ((event.target as Element).closest("button, select, input")) return;
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); hide(); }
    if (event.key === "Escape") { if (gesture.current) { onChange(gesture.current.seed); gesture.current = undefined; } choose([]); }
    if ((event.ctrlKey || event.metaKey) && event.key === "a") { event.preventDefault(); choose(visible.nodes.map(node => node.id)); }
    if (event.key === "Enter" && selected[0]) postToVscode({ type: "revealSource", id: selected[0] });
    if (event.key.startsWith("Arrow") && selected.length) {
      event.preventDefault(); const nodes = { ...arrangement.nodes }, delta = event.shiftKey ? 20 : 5;
      for (const id of selected) { const rect = positions[id]; if (rect) nodes[id] = { ...rect,
        x: rect.x + (event.key === "ArrowRight" ? delta : event.key === "ArrowLeft" ? -delta : 0),
        y: rect.y + (event.key === "ArrowDown" ? delta : event.key === "ArrowUp" ? -delta : 0) }; }
      commit(invalidate({ ...arrangement, nodes }, selected));
    }
  }
  const nodeIds = selected.filter(id => positions[id]);
  return <div className="tonto-svg-canvas" ref={root} tabIndex={0} role="region" aria-label="Diagram canvas"
    onPointerDown={onPointerDown} onPointerMove={move} onPointerUp={end} onPointerCancel={event => { const active = gesture.current; gesture.current = undefined; if (active) onChange(active.seed); if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId); }} onKeyDown={key}
    onDoubleClick={event => { if ((event.target as Element).closest(".tonto-svg-toolbar")) return; const id = (event.target as Element).closest("[data-node], [data-edge]")?.getAttribute("data-node") ?? (event.target as Element).closest("[data-edge]")?.getAttribute("data-edge") ?? (event.target as Element).closest("[data-for]")?.getAttribute("data-for") ?? selected[0]; if (id) postToVscode({ type: "revealSource", id }); }}
    onWheel={event => { event.preventDefault(); const box = root.current!.getBoundingClientRect(); const x = event.clientX - box.left, y = event.clientY - box.top;
      const zoom = Math.min(4, Math.max(0.1, camera.zoom * Math.exp(-event.deltaY * 0.001)));
      const next = { zoom, x: x - (x - camera.x) * zoom / camera.zoom, y: y - (y - camera.y) * zoom / camera.zoom };
      setCamera(next); if (!isLegacy) { window.clearTimeout(wheelTimeout.current); wheelTimeout.current = window.setTimeout(() => { const file = { ...current.current, viewport: next }; onChange(file); postToVscode({ type: "updateArrangement", arrangement: file }); }, 300); } }}>
    <div className="tonto-svg-paper" style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})` }}>
      <div style={{ position: "absolute", left: picture.bounds.x, top: picture.bounds.y, width: picture.bounds.width, height: picture.bounds.height }} dangerouslySetInnerHTML={{ __html: picture.svg }} />
      <svg className="tonto-svg-handles" width={picture.bounds.width} height={picture.bounds.height}
        viewBox={`${picture.bounds.x} ${picture.bounds.y} ${picture.bounds.width} ${picture.bounds.height}`}
        style={{ left: picture.bounds.x, top: picture.bounds.y, width: picture.bounds.width, height: picture.bounds.height }}>
        {nodeIds.map(id => { const rect = positions[id]!; return <rect key={id} x={rect.x + rect.width - 5} y={rect.y + rect.height - 5} width={10} height={10}
          className="tonto-resize-handle" aria-label={`Resize ${id}`} onPointerDown={event => start(event, "resize", id)} />; })}
        {selected.flatMap(id => handlesFor(picture.guides[id] ?? []).map((handle, index) => <circle key={`${id}:${index}`} cx={handle.at.x} cy={handle.at.y} r={5 / camera.zoom}
          className="tonto-route-handle" aria-label="Drag route bend" onPointerDown={event => start(event, "route", id, handle)}
          onDoubleClick={event => { event.stopPropagation(); if (isLegacy) { needView(); return; } const points = dropHandle(picture.guides[id]!, handle.index); commit({ ...arrangement, edges: { ...arrangement.edges, [id]: { ...arrangement.edges[id], points } } }); }} />))}
      </svg>
    </div>
    <div className="tonto-svg-toolbar" onPointerDown={event => event.stopPropagation()} role="toolbar" aria-label="Diagram arrangement">
      <button onClick={() => fit()}>Fit</button><button onClick={() => void arrange()} disabled={busy}>{busy ? "Arranging…" : "Arrange all"}</button>
      <button onClick={() => void arrange(nodeIds)} disabled={busy || !nodeIds.length}>Arrange selection</button>
      <button onClick={() => { if (isLegacy) { needView(); return; } const pinned = new Set(arrangement.constraints.pinned); for (const id of nodeIds) pinned.has(id) ? pinned.delete(id) : pinned.add(id); commit({ ...arrangement, nodes: { ...arrangement.nodes, ...positions }, constraints: { ...arrangement.constraints, pinned: [...pinned] } }); }} disabled={!nodeIds.length}>Pin / unpin</button>
      <button onClick={() => constraint("align", "x")} disabled={nodeIds.length < 2}>Align X</button>
      <button onClick={() => constraint("align", "y")} disabled={nodeIds.length < 2}>Align Y</button>
      <button onClick={() => constraint("distribute", "x")} disabled={nodeIds.length < 3}>Distribute X</button>
      <button onClick={() => constraint("distribute", "y")} disabled={nodeIds.length < 3}>Distribute Y</button>
      <button onClick={hide} disabled={!selected.length}>Hide</button>
      <button onClick={() => commit({ ...arrangement, content: { ...arrangement.content, hidden: [] } })} disabled={!arrangement.content.hidden?.length || isLegacy}>Restore hidden</button>
      <label><input type="checkbox" checked={arrangement.display.taxonomyOnly} onChange={event => display({ taxonomyOnly: event.target.checked })} /> Taxonomy</label>
      <label><input type="checkbox" checked={arrangement.display.showPackageGroups} onChange={event => display({ showPackageGroups: event.target.checked })} /> Packages</label>
      <select aria-label="Routing" value={arrangement.display.routing} onChange={event => display({ routing: event.target.value as DisplayOptions["routing"] })}>
        {(["straight", "curved", "orthogonal"] as const).map(value => <option key={value}>{value}</option>)}
      </select>
      <select aria-label="Diagram font" value={arrangement.display.fontFamily} onChange={event => display({ fontFamily: event.target.value as DisplayOptions["fontFamily"] })}>
        {(["sans", "condensed", "humanist", "geometric", "serif", "book", "monospace"] as const).map(value => <option key={value}>{value}</option>)}
      </select>
      <select aria-label="Font size" value={arrangement.display.fontSize} onChange={event => display({ fontSize: event.target.value as DisplayOptions["fontSize"] })}>
        {(["small", "medium", "large"] as const).map(value => <option key={value}>{value}</option>)}
      </select>
      {isLegacy && <button onClick={needView}>Convert to Tonto View</button>}
    </div>
    {error && <div className="tonto-svg-error" role="alert">{error}</div>}
    <div className="tonto-svg-help">{Math.round(camera.zoom * 100)}% · Shift-click to select · Drag background to pan · Double-click for source · Enter for source</div>
  </div>;
});

async function rasterize(svg: string): Promise<string> {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const width = Number(parsed.getAttribute("width")), height = Number(parsed.getAttribute("height"));
  if (!(width > 0 && height > 0) || width * height * 4 > 80_000_000) throw new Error("Diagram is too large to export as PNG; use SVG.");
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image(); image.src = url;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("SVG rasterization failed")); });
    const canvas = document.createElement("canvas"); canvas.width = Math.ceil(width * 2); canvas.height = Math.ceil(height * 2);
    const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas is unavailable");
    context.scale(2, 2); context.drawImage(image, 0, 0); return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
