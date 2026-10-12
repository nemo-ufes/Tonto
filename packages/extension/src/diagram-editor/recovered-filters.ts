// Recovered from Tonto Visualizer 0.1.53; MIT notice in pack/licenses.
import type { ViewEdge, ViewModel, ViewNode, ViewRelation } from "tonto-cli/lib/view/model/index.js";
import { inversePairs } from "tonto-cli/lib/view/model/index.js";
export interface FilterItem { kind: "class" | "association"; label: string; ids: string[]; }

/**
 * The modeller filters concepts, not renderer internals.
 *
 * An inverse pair is two declarations but one association on the canvas, so it
 * is one filter row carrying both stable ids. Hiding either reading alone would
 * make its partner reappear as a new line after the next derivation.
 */
export function filterItemsOf(view: ViewModel): FilterItem[] {
    const names = new Map(view.nodes.map(node => [node.id, qualifiedName(node)]));
    const classes = view.nodes
        .filter(node => node.kind === 'class')
        .map(node => ({ kind: 'class' as const, ids: [node.id], label: qualifiedName(node) }));

    const pairs = inversePairs(view.edges);
    const associations = view.edges
        .filter((edge): edge is ViewRelation => edge.kind === 'relation' && !pairs.covered.has(edge.id))
        .map(edge => {
            const partner = pairs.partnerOf.get(edge.id);
            const readings = unique([edge.name, partner?.name].filter((name): name is string => Boolean(name)));
            const stereotypes = unique(
                [edge.stereotype, partner?.stereotype].filter((name): name is string => Boolean(name)));
            const middle = [
                stereotypes.length > 0 ? `«${stereotypes.join(' / ')}»` : '',
                readings.length > 0 ? readings.join(' / ') : stereotypes.length === 0 ? 'association' : ''
            ].filter(Boolean).join(' ');
            return {
                kind: 'association' as const,
                ids: partner ? [edge.id, partner.id] : [edge.id],
                label: `${names.get(edge.source) ?? edge.source} — ${middle} — ${names.get(edge.target) ?? edge.target}`
            };
        })
        .sort((one, other) => one.label.localeCompare(other.label) || one.ids[0]!.localeCompare(other.ids[0]!));

    // Tonto permits two genuinely distinct relations with the same ends and
    // reading. Their stable ids distinguish them, but exposing those ids would
    // turn a modeller-facing filter into protocol text. Number only the labels
    // that collide so either line can still be selected deliberately.
    const totals = new Map<string, number>();
    for (const item of associations) {
        totals.set(item.label, (totals.get(item.label) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    for (const item of associations) {
        const total = totals.get(item.label) ?? 1;
        if (total > 1) {
            const occurrence = (seen.get(item.label) ?? 0) + 1;
            seen.set(item.label, occurrence);
            item.label += ` (${occurrence} of ${total})`;
        }
    }

    return [...classes, ...associations].sort((one, other) =>
        one.kind.localeCompare(other.kind) || one.label.localeCompare(other.label)
        || one.ids[0]!.localeCompare(other.ids[0]!));
}

/**
 * Applies modeller-owned visibility to an already derived view.
 *
 * Keeping this operation independent of the parser matters while the current
 * text is incomplete: the panel can still hide and restore things in the last
 * good model instead of showing a checkbox state the picture has ignored.
 */
export function filterView(view: ViewModel, hiddenIds: Iterable<string>): ViewModel {
    const hidden = new Set(hiddenIds);
    const nodes = view.nodes.filter(node => !hidden.has(node.id));
    const visible = new Set(nodes.map(node => node.id));
    const retained = view.edges.filter(edge =>
        !hidden.has(edge.id) && visible.has(edge.source) && visible.has(edge.target));
    const edgeIds = new Set(retained.map(edge => edge.id));
    const edges: ViewEdge[] = retained.map(edge => {
        if (edge.kind !== 'relation' || !edge.inverseOf || edgeIds.has(edge.inverseOf)) {
            return edge;
        }
        const { inverseOf: _inverseOf, ...unpaired } = edge;
        return unpaired;
    });
    return {
        nodes,
        edges,
        groups: view.groups
            .map(group => ({ ...group, nodes: group.nodes.filter(id => visible.has(id)) }))
            .filter(group => group.nodes.length > 0),
        gensets: view.gensets.map(genset => {
            const { general, ...rest } = genset;
            return {
                ...rest,
                ...(general && visible.has(general) ? { general } : {}),
                specifics: genset.specifics.filter(id => visible.has(id))
            };
        })
    };
}

function qualifiedName(node: ViewNode): string {
    return node.package ? `${node.package}::${node.name}` : node.name;
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}
