import * as React from "react";
import type { TontoDiagramNode } from "tonto-cli";
import {
    type UfoCategory,
    UFO_PALETTE,
    ufoCategoryForPaletteToken,
} from "../lib/ufo-palette";

type UfoLegendProps = {
    nodes: TontoDiagramNode[];
    isDark: boolean;
};

const STORAGE_KEY = "tonto-legend-open";

export function UfoLegend({ nodes, isDark }: UfoLegendProps) {
    const [open, setOpen] = React.useState<boolean>(() => {
        if (typeof window === "undefined") return true;
        const raw = window.localStorage?.getItem(STORAGE_KEY);
        return raw == null ? true : raw === "1";
    });

    React.useEffect(() => {
        try {
            window.localStorage?.setItem(STORAGE_KEY, open ? "1" : "0");
        } catch {
            // ignore storage errors
        }
    }, [open]);

    const categories = React.useMemo(() => {
        const counts = new Map<UfoCategory, number>();
        for (const node of nodes) {
            const cat = ufoCategoryForPaletteToken(node.appearance.palette);
            counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [nodes]);

    if (categories.length === 0) {
        return null;
    }

    return (
        <div className="tonto-legend" role="region" aria-label="UFO category legend">
            <button
                type="button"
                className="tonto-legend-header"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
            >
                <span>UFO legend · {nodes.length}</span>
                <span className="caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
            {open ? (
                <div className="tonto-legend-body">
                    {categories.map(([cat, count]) => {
                        const palette = UFO_PALETTE[cat];
                        const color = isDark ? palette.colorDark : palette.color;
                        const tint = isDark ? palette.tintDark : palette.tint;
                        return (
                            <div
                                key={cat}
                                className="tonto-legend-row"
                                style={{
                                    ["--cat-color" as unknown as string]: color,
                                    ["--cat-fill" as unknown as string]: tint,
                                } as React.CSSProperties}
                            >
                                <span className="tonto-legend-swatch" aria-hidden="true" />
                                <span style={{ flex: 1, color: "var(--fg-2)" }}>{palette.label}</span>
                                <span className="count">{count}</span>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
