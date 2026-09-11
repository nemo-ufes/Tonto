import { AtomDTO, InstanceDTO, WorldDTO } from "./alloyTypes.js";

/**
 * The instance as a graph, one per world.
 *
 * Free of both `vscode` and Cytoscape: this is where the decisions that matter live — how an
 * endurant is labelled, what counts as its nature, how a relation of more than two ends is
 * drawn — and none of them need a browser to be checked.
 */

export interface GraphNode {
    id: string
    /** What the modeller reads: the classes the endurant instantiates in this world. */
    label: string
    /** Short discriminator, so two endurants of the same classes stay distinguishable. */
    discriminator: string
    /** `object`, `aspect`, or `unknown` — drives shape and colour. */
    nature: AtomNature
    classes: string[]
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
 * An endurant is labelled with every class it instantiates in this world, not just one.
 *
 * A Pessoa that is currently a Crianca and an Estudante belongs to all three, and that is
 * precisely what a modeller is looking for when reading a generated world — picking one name
 * would hide the phase or the role. An endurant in no class at all still exists in the world,
 * so it is labelled by its nature rather than left blank.
 */
export function labelOf(atom: AtomDTO): string {
    if (atom.classes.length > 0) {
        return atom.classes.join(", ");
    }
    return natureOf(atom.id) === "aspect" ? "(aspect)" : "(object)";
}

export function toWorldGraphs(instance: InstanceDTO | undefined): WorldGraph[] {
    if (!instance) {
        return [];
    }
    return instance.worlds.map(toWorldGraph);
}

function toWorldGraph(world: WorldDTO): WorldGraph {
    const present = new Set(world.atoms.map((atom) => atom.id));

    return {
        id: world.id,
        title: world.kind ?? shortWorldName(world.id),
        kind: world.kind,
        next: world.next,
        nodes: world.atoms.map((atom) => ({
            id: atom.id,
            label: labelOf(atom),
            discriminator: discriminatorOf(atom.id),
            nature: natureOf(atom.id),
            classes: atom.classes,
        })),
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
