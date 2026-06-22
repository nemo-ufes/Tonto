import { TontoDiagramRelationLayout, TontoDiagramSpec } from "./types.js";

export function serializeTontoDiagramSpec(spec: TontoDiagramSpec): string {
    const lines: string[] = [];

    lines.push(`diagram "${spec.title}" {`);

    for (const packageName of [...spec.imports].sort((left, right) => left.localeCompare(right))) {
        lines.push(`  import ${packageName}`);
    }

    if (spec.filter.include.length > 0) {
        lines.push("");
        lines.push(`  include ${[...spec.filter.include].sort((left, right) => left.localeCompare(right)).join(", ")}`);
    }
    if (spec.filter.relations.length > 0) {
        lines.push(`  relations ${[...spec.filter.relations].sort((left, right) => left.localeCompare(right)).join(", ")}`);
    }

    lines.push("");
    lines.push(`  direction ${spec.presentation.direction}`);
    lines.push(`  stereotypes ${spec.presentation.stereotypes ? "true" : "false"}`);
    lines.push(`  attributes ${spec.presentation.attributes ? "true" : "false"}`);
    lines.push(`  external ${spec.filter.external ? "true" : "false"}`);
    lines.push(`  datatypes ${spec.filter.datatypes ? "true" : "false"}`);

    if (spec.nodes.length > 0) {
        lines.push("");
        for (const layout of [...spec.nodes].sort((left, right) => left.target.localeCompare(right.target))) {
            lines.push(`  node ${layout.target} { x ${formatNumber(layout.x)} y ${formatNumber(layout.y)} }`);
        }
    }

    // Relations are intentionally NOT serialized. They are derived from the
    // .tonto source files by the projection — including them here would
    // duplicate authoring information. The parser still accepts
    // `relation <id> { ... }` blocks (for forward-compat / future per-edge
    // layout) but the serializer omits them.

    lines.push("}");

    return lines.join("\n");
}

/**
 * Replace `spec.relations` so the file reflects the supplied set of edge ids.
 * Used by the extension after each spec mutation to keep the diagram source
 * in sync with the rendered relation set (auto-add).
 */
export function syncTontoDiagramRelations(
    spec: TontoDiagramSpec,
    edgeIds: string[]
): TontoDiagramSpec {
    const next: TontoDiagramRelationLayout[] = [...new Set(edgeIds)]
        .sort((left, right) => left.localeCompare(right))
        .map((target) => ({ target }));

    return {
        ...spec,
        source: undefined,
        relations: next,
    };
}

export function updateTontoDiagramLayout(
    spec: TontoDiagramSpec,
    layouts: Array<{ target: string; x: number; y: number }>
): TontoDiagramSpec {
    const normalizedLayouts = [...layouts]
        .sort((left, right) => left.target.localeCompare(right.target))
        .map((layout) => ({
            target: layout.target,
            x: roundNumber(layout.x),
            y: roundNumber(layout.y),
        }));

    return {
        ...spec,
        source: undefined,
        nodes: normalizedLayouts,
    };
}

function formatNumber(value: number): string {
    if (Number.isInteger(value)) {
        return `${value}`;
    }
    return `${roundNumber(value)}`;
}

function roundNumber(value: number): number {
    return Math.round(value * 100) / 100;
}
