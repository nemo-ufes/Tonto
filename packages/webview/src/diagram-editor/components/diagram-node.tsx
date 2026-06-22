import * as React from "react";
import { Handle, NodeProps, Position } from "@xyflow/react";
import type { TontoDiagramNode } from "tonto-cli";
import { cn } from "../utils/cn";
import {
    type UfoCategory,
    UFO_PALETTE,
    ufoCategoryForPaletteToken,
} from "../lib/ufo-palette";

type DiagramNodeData = {
    node: TontoDiagramNode;
    showAttributes: boolean;
    showStereotypes: boolean;
};

export function DiagramNode(props: NodeProps) {
    const diagramNode = readDiagramNode(props.data);
    const isDark = useDarkMode();

    if (!diagramNode) {
        return null;
    }

    const { node, showAttributes, showStereotypes } = diagramNode;
    const category: UfoCategory = ufoCategoryForPaletteToken(node.appearance.palette);
    const palette = UFO_PALETTE[category];
    const color = isDark ? palette.colorDark : palette.color;
    const tint = isDark ? palette.tintDark : palette.tint;
    const border = isDark ? palette.borderDark : palette.border;
    const isAntiRigid = node.appearance.rigidity === "anti-rigid";
    const isNonSortal = node.appearance.accent === "non-sortal";
    const external = node.appearance.external;

    const attrs = node.attributes ?? [];
    const showBody = showAttributes && attrs.length > 0;

    const tooltip = buildTooltip(node);

    return (
        <div
            className={cn(
                "tonto-node",
                showBody && "has-attrs",
                isAntiRigid && "dashed",
                isNonSortal && "ringed",
                external && "external",
                props.selected && "selected",
            )}
            style={{
                ["--cat-color" as unknown as string]: color,
                ["--cat-tint" as unknown as string]: tint,
                ["--node-border" as unknown as string]: border,
            } as React.CSSProperties}
            title={tooltip}
        >
            <Handle
                type="target"
                position={Position.Top}
                className="!h-1.5 !w-1.5 !rounded-none !border-0"
                style={{ background: "var(--edge)" }}
            />
            <Handle
                type="source"
                position={Position.Bottom}
                className="!h-1.5 !w-1.5 !rounded-none !border-0"
                style={{ background: "var(--edge)" }}
            />

            <div className="tonto-node-header">
                {showStereotypes && node.stereotype ? (
                    <div className="tonto-node-stereo">{`«${node.stereotype}»`}</div>
                ) : null}
                <div className="tonto-node-label">{node.label}</div>
                {external ? <div className="tonto-external-badge">external</div> : null}
            </div>

            {showBody ? (
                <div className="tonto-node-body">
                    {attrs.map((attribute) => (
                        <div key={`${attribute.name}:${attribute.type}`} className="tonto-attr-row">
                            <span className="name truncate">{attribute.name}</span>
                            <span className="type truncate">
                                {attribute.type}
                                {attribute.cardinality ? ` ${attribute.cardinality}` : ""}
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function buildTooltip(node: TontoDiagramNode): string {
    const parts: string[] = [];
    if (node.stereotype) parts.push(`«${node.stereotype}»`);
    parts.push(node.label);
    if (node.module) parts.push(`— ${node.module}`);
    const attrCount = (node.attributes ?? []).length;
    parts.push(`· ${attrCount} attribute${attrCount === 1 ? "" : "s"}`);
    if (node.appearance.external) parts.push("· external");
    return parts.join(" ");
}

function useDarkMode(): boolean {
    const [isDark, setIsDark] = React.useState(() =>
        typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
    );
    React.useEffect(() => {
        if (typeof document === "undefined") return;
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains("dark"));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);
    return isDark;
}

function readDiagramNode(data: unknown): DiagramNodeData | undefined {
    if (!data || typeof data !== "object" || !("node" in data) || !("showAttributes" in data) || !("showStereotypes" in data)) {
        return undefined;
    }
    return data as DiagramNodeData;
}
