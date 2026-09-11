import { AtomDTO, InstanceDTO, OntologyClass, WorldDTO } from "./alloyTypes.js";

/**
 * The instance as a graph, one per world.
 *
 * Free of both `vscode` and Cytoscape: this is where the decisions that matter live — how an
 * endurant is labelled, what counts as its nature, how a relation of more than two ends is
 * drawn — and none of them need a browser to be checked.
 */

export interface GraphNode {
    id: string
    /** What the endurant *is*: the kinds it instantiates, by the modeller's own names. */
    label: string
    /** How it currently *is*: phases, roles and subkinds, which come and go between worlds. */
    qualifiers: string[]
    /** Short discriminator, so two endurants of the same classes stay distinguishable. */
    discriminator: string
    /** `object`, `aspect`, or `unknown` — drives shape and colour. */
    nature: AtomNature
    classes: string[]
    /** Constraints of UFO this endurant breaks. Empty for a well-formed one. */
    issues: string[]
}

/**
 * The six stereotypes that provide a principle of identity — the kinds, in the sense of the
 * UFO axioms. They match the set PK in Guizzardi et al., *UFO: Unified Foundational Ontology*
 * (Applied Ontology, 2021): ObjectKind, CollectiveKind, QuantityKind, RelatorKind, ModeKind
 * and QualityKind.
 *
 * `subkind` is deliberately absent: it is rigid but specialises a kind rather than being one.
 */
const KIND_STEREOTYPES = new Set([
    "kind", "collective", "quantity", "relator", "mode", "quality",
]);

/** Looks a class up by the name the Alloy model uses for it. */
export type Ontology = Map<string, OntologyClass>;

export function toOntology(classes: OntologyClass[] | undefined): Ontology {
    return new Map((classes ?? []).map((entry) => [entry.alloyName, entry]));
}

export interface GraphEdge {
    id: string
    source: string
    target: string
    label: string
}

export interface WorldGraph {
    id: string
    /** Short name for the tab, such as `CurrentWorld` or the trailing part of the atom id. */
    title: string
    kind?: string
    next: string[]
    nodes: GraphNode[]
    edges: GraphEdge[]
}

export type AtomNature = "object" | "aspect" | "unknown";

/** A world in the map of how the worlds connect, rather than of what is inside one. */
export interface WorldMapNode {
    id: string
    label: string
    kind?: string
    /** Position of this world in the tab strip, so clicking the map can select it. */
    index: number
}

export interface WorldMapEdge {
    id: string
    source: string
    target: string
}

export interface WorldMap {
    nodes: WorldMapNode[]
    edges: WorldMapEdge[]
}

/** Spacing of the world map, in the arbitrary units Cytoscape positions use. */
const WORLD_MAP_COLUMN = 190;
const WORLD_MAP_ROW = 70;

/**
 * Places each world by how far it is from the start of time.
 *
 * <p>A general-purpose layout is the wrong tool here: the shape is known — a chain that may
 * fork — and a force or breadth-first pass gives a different arrangement each run, which for
 * a picture of time reads as noise. Depth from the roots is exactly the arrow of time, so
 * columns are generations and rows separate the branches within one.
 */
export function positionWorldMap(map: WorldMap): Map<string, { x: number; y: number }> {
    const successors = new Map<string, string[]>();
    const incoming = new Map<string, number>();

    map.nodes.forEach((node) => {
        successors.set(node.id, []);
        incoming.set(node.id, 0);
    });
    map.edges.forEach((edge) => {
        successors.get(edge.source)?.push(edge.target);
        incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    });

    const depth = new Map<string, number>();
    // A world with nothing leading to it starts a branch. A cycle would leave every world
    // with a predecessor and no root, so anything left unplaced is put at the start too.
    map.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0)
        .forEach((node) => depth.set(node.id, 0));

    let changed = true;
    while (changed) {
        changed = false;
        for (const edge of map.edges) {
            const from = depth.get(edge.source);
            if (from === undefined) {
                continue;
            }
            if ((depth.get(edge.target) ?? -1) < from + 1) {
                depth.set(edge.target, from + 1);
                changed = true;
            }
        }
    }
    map.nodes.forEach((node) => depth.has(node.id) || depth.set(node.id, 0));

    const rowsUsed = new Map<number, number>();
    const positions = new Map<string, { x: number; y: number }>();
    map.nodes.forEach((node) => {
        const column = depth.get(node.id) ?? 0;
        const row = rowsUsed.get(column) ?? 0;
        rowsUsed.set(column, row + 1);
        positions.set(node.id, { x: column * WORLD_MAP_COLUMN, y: row * WORLD_MAP_ROW });
    });

    return positions;
}

/**
 * How the worlds branch off each other.
 *
 * <p>This is the structure the possible-worlds reading is about: the past leads to the
 * present and on to the future, and a counterfactual branches off the past as what could
 * have happened instead. Tabs alone put those side by side as if unrelated, which is exactly
 * what makes a counterfactual world unreadable — it only means anything relative to the
 * branch it is not on.
 */
export function toWorldMap(worlds: WorldGraph[]): WorldMap {
    const byId = new Map(worlds.map((world, index) => [world.id, index]));

    return {
        nodes: worlds.map((world, index) => ({
            id: world.id,
            label: `${world.title}\n${world.nodes.length} endurant${world.nodes.length === 1 ? "" : "s"}`,
            kind: world.kind,
            index,
        })),
        edges: worlds.flatMap((world) =>
            world.next
                // A world can name a successor the instance does not contain. Drawing an edge
                // to a node that was never added leaves a dangling reference.
                .filter((successor) => byId.has(successor))
                .map((successor) => ({
                    id: `${world.id}->${successor}`,
                    source: world.id,
                    target: successor,
                }))),
    };
}

/**
 * Alloy names atoms after the signature they belong to, and the transformation puts every
 * endurant under `Object` or `Aspect` — the UFO natures. The class an endurant instantiates
 * is per-world and lives in `classes`, so this prefix is the only thing that says whether we
 * are looking at a substantial or a moment.
 */
export function natureOf(atomId: string): AtomNature {
    const signature = atomId.split("$")[0];
    if (signature.endsWith("Object")) {
        return "object";
    }
    if (signature.endsWith("Aspect")) {
        return "aspect";
    }
    return "unknown";
}

/** `Object$3` reads as `#3`; anything unexpected is shown whole rather than mangled. */
export function discriminatorOf(atomId: string): string {
    const index = atomId.lastIndexOf("$");
    return index >= 0 ? `#${atomId.slice(index + 1)}` : atomId;
}

/**
 * Splits what an endurant *is* from how it currently *is*.
 *
 * Listing every class flat reads as a wall of names of equal weight, but they are not equal:
 * a kind carries the principle of identity and holds in every world, while phases and roles
 * are contingent and come and go. Leading with the kind and trailing the rest is how a
 * modeller reads an endurant.
 *
 * Without an ontology to consult — the Alloy model alone does not say what a class is — every
 * class falls back to being shown as a qualifier, which is the honest reading of not knowing.
 */
export function describeAtom(atom: AtomDTO, ontology: Ontology): {
    label: string
    qualifiers: string[]
    issues: string[]
} {
    const kinds: string[] = [];
    const qualifiers: string[] = [];

    for (const className of atom.classes) {
        const known = ontology.get(className);
        const display = known?.name ?? className;
        if (known && known.stereotype && KIND_STEREOTYPES.has(known.stereotype)) {
            kinds.push(display);
        } else {
            qualifiers.push(display);
        }
    }

    return {
        label: kinds.length > 0 ? kinds.join(" + ") : fallbackLabel(atom, qualifiers),
        qualifiers,
        issues: findIssues(kinds),
    };
}

function fallbackLabel(atom: AtomDTO, qualifiers: string[]): string {
    if (qualifiers.length > 0) {
        return "";
    }
    return natureOf(atom.id) === "aspect" ? "(aspect)" : "(object)";
}

/**
 * Checks the endurant against the constraints a generated instance can break.
 *
 * Instantiating two kinds is impossible in UFO — axiom a22, "everything necessarily
 * instantiates at most one kind", and its theorem t10 that kinds are necessarily disjoint.
 * An instance that does so is evidence about the transformation that produced it, and the
 * reason to surface it here is that it is otherwise invisible: the `.als` looks fine, and
 * only a generated world shows the contradiction.
 */
function findIssues(kinds: string[]): string[] {
    if (kinds.length > 1) {
        return [`Instantiates ${kinds.length} kinds (${kinds.join(", ")}) — UFO allows at most one.`];
    }
    return [];
}

export function toWorldGraphs(
    instance: InstanceDTO | undefined,
    ontology: Ontology = new Map()
): WorldGraph[] {
    if (!instance) {
        return [];
    }
    return instance.worlds.map((world) => toWorldGraph(world, ontology));
}

function toWorldGraph(world: WorldDTO, ontology: Ontology): WorldGraph {
    const present = new Set(world.atoms.map((atom) => atom.id));

    return {
        id: world.id,
        title: world.kind ?? shortWorldName(world.id),
        kind: world.kind,
        next: world.next,
        nodes: world.atoms.map((atom) => {
            const described = describeAtom(atom, ontology);
            return {
                id: atom.id,
                label: described.label,
                qualifiers: described.qualifiers,
                discriminator: discriminatorOf(atom.id),
                nature: natureOf(atom.id),
                classes: atom.classes,
                issues: described.issues,
            };
        }),
        edges: world.tuples.flatMap((tuple, position) =>
            toEdges(tuple.relation, tuple.atoms, position, present)),
    };
}

/**
 * Relations of more than two ends are drawn as a fan from the first end to each of the others,
 * with the position appended to the label. Alloy allows arbitrary arity and Cytoscape edges
 * join exactly two nodes, so something has to give; a fan keeps every end visible, which
 * dropping the extra ends would not.
 */
function toEdges(
    relation: string,
    atoms: string[],
    position: number,
    present: Set<string>
): GraphEdge[] {
    // A tuple can name an atom that does not exist in this world. Drawing an edge to a node
    // that was never added leaves Cytoscape with a dangling reference and it throws.
    const known = atoms.filter((atom) => present.has(atom));
    if (known.length < 2) {
        return [];
    }

    const [source, ...targets] = known;
    return targets.map((target, index) => ({
        id: `${relation}-${position}-${index}`,
        source,
        target,
        label: targets.length > 1 ? `${relation} (${index + 1})` : relation,
    }));
}

function shortWorldName(worldId: string): string {
    const withoutModule = worldId.slice(worldId.lastIndexOf("/") + 1);
    const index = withoutModule.lastIndexOf("$");
    return index >= 0 ? withoutModule.slice(0, index) : withoutModule;
}
