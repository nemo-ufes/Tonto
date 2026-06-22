import * as React from "react";
import { useNodes, ViewportPortal, type Node } from "@xyflow/react";
import type { TontoDiagramEdge } from "tonto-cli";

type Rect = { x: number; y: number; w: number; h: number };
type Side = "top" | "bottom" | "left" | "right";
type Point = { x: number; y: number };

const FALLBACK_W = 224;
const FALLBACK_H = 96;
const STUB = 18;

const SIDE_ROTATION: Record<Side, number> = {
    top: 180,
    bottom: 0,
    left: 90,
    right: 270,
};

type EdgesOverlayProps = {
    edges: TontoDiagramEdge[];
    showCardinalities: boolean;
    routing: "step" | "curved";
};

/**
 * Custom edge rendering layer. Sits inside the ReactFlow viewport (so it
 * inherits pan/zoom) but owns every SVG element itself — no `<marker>` defs,
 * no BaseEdge, no `getSmoothStepPath`. That sidesteps the rendering bugs we
 * couldn't track down in ReactFlow's edge subsystem within the VS Code
 * webview.
 */
export function EdgesOverlay({ edges, showCardinalities, routing }: EdgesOverlayProps) {
    const nodes = useNodes();
    const nodeRectsById = React.useMemo(() => {
        const map = new Map<string, Rect>();
        for (const node of nodes) {
            const rect = rectFromNode(node);
            if (rect) map.set(node.id, rect);
        }
        return map;
    }, [nodes]);

    const items = React.useMemo(() => {
        return edges
            .map((edge) => {
                const source = nodeRectsById.get(edge.source);
                const target = nodeRectsById.get(edge.target);
                if (!source || !target) return null;
                return geometryFor(edge, source, target, routing);
            })
            .filter((item): item is EdgeGeometry => item !== null);
    }, [edges, nodeRectsById, routing]);

    return (
        <ViewportPortal>
            <svg className="tonto-edges-overlay" aria-hidden="true">
                {items.map((item) => (
                    <EdgePiece key={item.edge.id} item={item} showCardinalities={showCardinalities} />
                ))}
            </svg>
        </ViewportPortal>
    );
}

type EdgeGeometry = {
    edge: TontoDiagramEdge;
    pathD: string;
    sourcePoint: Point;
    targetPoint: Point;
    sourceSide: Side;
    targetSide: Side;
    midX: number;
    midY: number;
};

function EdgePiece({ item, showCardinalities }: { item: EdgeGeometry; showCardinalities: boolean }) {
    const { edge, pathD, sourcePoint, targetPoint, sourceSide, targetSide, midX, midY } = item;
    const isSpec = edge.kind === "specialization";
    const marker = isSpec
        ? { kind: "triangle" as const, end: "target" as const }
        : resolveRelationMarker(edge.connector);

    return (
        <g className="tonto-edge">
            <path className="tonto-edge-line" d={pathD} />

            {marker ? <Marker shape={marker.kind}
                              x={marker.end === "target" ? targetPoint.x : sourcePoint.x}
                              y={marker.end === "target" ? targetPoint.y : sourcePoint.y}
                              side={marker.end === "target" ? targetSide : sourceSide} /> : null}

            {isSpec ? (
                <foreignObject x={midX - 60} y={midY - 28} width={120} height={20} style={{ overflow: "visible" }}>
                    <div className="tonto-edge-spec-label" style={{ position: "absolute", left: 60, top: 10, transform: "translate(-50%, -50%)", pointerEvents: "none" }}>
                        specializes
                    </div>
                </foreignObject>
            ) : (edge.label || edge.stereotype) ? (
                <foreignObject x={midX - 80} y={midY - 14} width={160} height={28} style={{ overflow: "visible" }}>
                    <div className="tonto-edge-label" style={{ position: "absolute", left: 80, top: 14, transform: "translate(-50%, -50%)", pointerEvents: "auto" }}>
                        {edge.label ? <span>{edge.label}</span> : null}
                        {edge.stereotype ? <span className="stereo">{`@${edge.stereotype}`}</span> : null}
                    </div>
                </foreignObject>
            ) : null}

            {!isSpec ? (
                <>
                    <EndLabel name={edge.sourceEnd} cardinality={showCardinalities ? edge.sourceCardinality : undefined}
                              x={sourcePoint.x} y={sourcePoint.y} side={sourceSide} />
                    <EndLabel name={edge.targetEnd} cardinality={showCardinalities ? edge.targetCardinality : undefined}
                              x={targetPoint.x} y={targetPoint.y} side={targetSide} />
                </>
            ) : null}
        </g>
    );
}

function Marker({ shape, x, y, side }: { shape: "triangle" | "diamond-open" | "diamond-solid"; x: number; y: number; side: Side }) {
    const rotation = SIDE_ROTATION[side];
    if (shape === "triangle") {
        return (
            <polygon
                className="tonto-edge-marker fill-surface"
                points="-7,12 0,0 7,12"
                transform={`translate(${x} ${y}) rotate(${rotation})`}
            />
        );
    }
    const fillClass = shape === "diamond-solid" ? "fill-edge" : "fill-surface";
    return (
        <polygon
            className={`tonto-edge-marker ${fillClass}`}
            points="0,0 -6,9 0,18 6,9"
            transform={`translate(${x} ${y}) rotate(${rotation})`}
        />
    );
}

function EndLabel({ name, cardinality, x, y, side }: { name?: string; cardinality?: string; x: number; y: number; side: Side }) {
    if (!name && !cardinality) return null;
    const { offsetX, offsetY, originX, originY, width, height } = endLabelBox(side);
    return (
        <foreignObject x={x + offsetX} y={y + offsetY} width={width} height={height} style={{ overflow: "visible" }}>
            <div className="tonto-edge-end" style={{ position: "absolute", left: originX, top: originY, pointerEvents: "none" }}>
                {name ? <span className="end-name">{name}</span> : null}
                {cardinality ? <span className="end-card">{cardinality}</span> : null}
            </div>
        </foreignObject>
    );
}

function endLabelBox(side: Side): { offsetX: number; offsetY: number; originX: number; originY: number; width: number; height: number } {
    const W = 140;
    const H = 36;
    switch (side) {
        case "top":    return { offsetX: 8,   offsetY: -H - 4, originX: 0,    originY: H,    width: W, height: H };
        case "bottom": return { offsetX: 8,   offsetY: 4,      originX: 0,    originY: 0,    width: W, height: H };
        case "left":   return { offsetX: -W - 8, offsetY: -H / 2, originX: W,    originY: H / 2, width: W, height: H };
        case "right":  return { offsetX: 8,   offsetY: -H / 2, originX: 0,    originY: H / 2, width: W, height: H };
    }
}

function resolveRelationMarker(connector: TontoDiagramEdge["connector"]): { kind: "diamond-open" | "diamond-solid"; end: "source" | "target" } | undefined {
    if (connector === "aggregation") return { kind: "diamond-open", end: "target" };
    if (connector === "aggregation-inverted") return { kind: "diamond-open", end: "source" };
    if (connector === "composition") return { kind: "diamond-solid", end: "target" };
    if (connector === "composition-inverted") return { kind: "diamond-solid", end: "source" };
    return undefined;
}

function rectFromNode(node: Node): Rect | null {
    const position = node.position;
    if (!position) return null;
    const measured = (node as { measured?: { width?: number; height?: number } }).measured;
    const width = measured?.width ?? (node as { width?: number }).width ?? FALLBACK_W;
    const height = measured?.height ?? (node as { height?: number }).height ?? FALLBACK_H;
    return { x: position.x, y: position.y, w: width, h: height };
}

function centre(rect: Rect): Point {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function chooseSides(source: Rect, target: Rect, prefer: "auto" | "vertical"): [Side, Side] {
    const s = centre(source);
    const t = centre(target);
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    if (prefer === "vertical" || Math.abs(dy) >= Math.abs(dx)) {
        return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
    }
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
}

function attach(rect: Rect, side: Side): Point {
    switch (side) {
        case "top":    return { x: rect.x + rect.w / 2, y: rect.y };
        case "bottom": return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
        case "left":   return { x: rect.x,              y: rect.y + rect.h / 2 };
        case "right":  return { x: rect.x + rect.w,     y: rect.y + rect.h / 2 };
    }
}

function shift(point: Point, side: Side, distance: number): Point {
    switch (side) {
        case "top":    return { x: point.x,            y: point.y - distance };
        case "bottom": return { x: point.x,            y: point.y + distance };
        case "left":   return { x: point.x - distance, y: point.y };
        case "right":  return { x: point.x + distance, y: point.y };
    }
}

function geometryFor(edge: TontoDiagramEdge, source: Rect, target: Rect, routing: "step" | "curved"): EdgeGeometry {
    const prefer = edge.kind === "specialization" ? "vertical" : "auto";
    const [sourceSide, targetSide] = chooseSides(source, target, prefer);
    const sp = attach(source, sourceSide);
    const tp = attach(target, targetSide);

    if (routing === "curved") {
        const c1 = shift(sp, sourceSide, 60);
        const c2 = shift(tp, targetSide, 60);
        const pathD = `M ${sp.x} ${sp.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${tp.x} ${tp.y}`;
        return {
            edge,
            pathD,
            sourcePoint: sp,
            targetPoint: tp,
            sourceSide,
            targetSide,
            midX: (sp.x + tp.x) / 2,
            midY: (sp.y + tp.y) / 2,
        };
    }

    const s1 = shift(sp, sourceSide, STUB);
    const t1 = shift(tp, targetSide, STUB);
    const sHoriz = sourceSide === "left" || sourceSide === "right";
    const tHoriz = targetSide === "left" || targetSide === "right";

    let points: Point[];
    if (sHoriz && tHoriz) {
        const midX = (s1.x + t1.x) / 2;
        points = [sp, s1, { x: midX, y: s1.y }, { x: midX, y: t1.y }, t1, tp];
    } else if (!sHoriz && !tHoriz) {
        const midY = (s1.y + t1.y) / 2;
        points = [sp, s1, { x: s1.x, y: midY }, { x: t1.x, y: midY }, t1, tp];
    } else if (sHoriz && !tHoriz) {
        points = [sp, s1, { x: t1.x, y: s1.y }, t1, tp];
    } else {
        points = [sp, s1, { x: s1.x, y: t1.y }, t1, tp];
    }

    // Drop consecutive duplicates so the path stays clean.
    const cleaned: Point[] = [];
    for (const p of points) {
        const prev = cleaned[cleaned.length - 1];
        if (!prev || prev.x !== p.x || prev.y !== p.y) cleaned.push(p);
    }

    const pathD = cleaned
        .map((p, i) => (i === 0 ? "M" : "L") + ` ${p.x} ${p.y}`)
        .join(" ");

    const midIdx = Math.floor(cleaned.length / 2);
    const a = cleaned[Math.max(0, midIdx - 1)];
    const b = cleaned[Math.min(cleaned.length - 1, midIdx)];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    return {
        edge,
        pathD,
        sourcePoint: sp,
        targetPoint: tp,
        sourceSide,
        targetSide,
        midX,
        midY,
    };
}
