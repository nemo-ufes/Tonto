import { describe, expect, it } from "vitest";
import { InstanceDTO, WorldDTO } from "../../../src/alloy/alloyTypes.js";
import {
    discriminatorOf,
    labelOf,
    natureOf,
    toWorldGraphs,
} from "../../../src/alloy/instanceGraph.js";

function world(overrides: Partial<WorldDTO> = {}): WorldDTO {
    return {
        id: "world_structure/CurrentWorld$0",
        kind: "CurrentWorld",
        next: [],
        atoms: [],
        tuples: [],
        ...overrides,
    };
}

function instance(worlds: WorldDTO[]): InstanceDTO {
    return { commandName: "singleWorld", instanceNumber: 1, worlds, classes: [] };
}

describe("natureOf", () => {
    // The transformation puts every endurant under Object or Aspect — the UFO natures — and
    // the per-world classes say nothing about which. The signature prefix is the only source.
    it("tells substantials from moments by their signature", () => {
        expect(natureOf("Object$3")).toBe("object");
        expect(natureOf("Aspect$0")).toBe("aspect");
    });

    it("handles module-qualified signatures", () => {
        expect(natureOf("this/Object$1")).toBe("object");
    });

    it("falls back rather than guessing for anything else", () => {
        expect(natureOf("Datatype$0")).toBe("unknown");
        expect(natureOf("weird")).toBe("unknown");
    });
});

describe("discriminatorOf", () => {
    it("keeps the index that distinguishes two endurants of the same classes", () => {
        expect(discriminatorOf("Object$3")).toBe("#3");
    });

    it("shows an unexpected id whole rather than mangling it", () => {
        expect(discriminatorOf("Object")).toBe("Object");
    });
});

describe("labelOf", () => {
    // A Pessoa that is a Crianca and an Estudante belongs to all three. Picking one would
    // hide the phase or the role, which is what the modeller is reading the world for.
    it("names every class the endurant instantiates in this world", () => {
        expect(labelOf({ id: "Object$1", classes: ["Pessoa", "Crianca", "Estudante"] }))
            .toBe("Pessoa, Crianca, Estudante");
    });

    it("labels an endurant in no class by its nature instead of leaving it blank", () => {
        expect(labelOf({ id: "Object$9", classes: [] })).toBe("(object)");
        expect(labelOf({ id: "Aspect$0", classes: [] })).toBe("(aspect)");
    });
});

describe("toWorldGraphs", () => {
    it("produces one graph per world", () => {
        const graphs = toWorldGraphs(instance([
            world({ id: "w/CurrentWorld$0", kind: "CurrentWorld" }),
            world({ id: "w/FutureWorld$0", kind: "FutureWorld" }),
        ]));

        expect(graphs.map((graph) => graph.kind)).toEqual(["CurrentWorld", "FutureWorld"]);
    });

    it("returns nothing when there is no instance to draw", () => {
        expect(toWorldGraphs(undefined)).toEqual([]);
    });

    it("carries the successor chain so the worlds can be ordered", () => {
        const graphs = toWorldGraphs(instance([
            world({ id: "w/CurrentWorld$0", next: ["w/FutureWorld$0"] }),
        ]));

        expect(graphs[0].next).toEqual(["w/FutureWorld$0"]);
    });

    it("falls back to the atom id when a world has no known kind", () => {
        const graphs = toWorldGraphs(instance([
            world({ id: "world_structure/TemporalWorld$2", kind: undefined }),
        ]));

        expect(graphs[0].title).toBe("TemporalWorld");
    });

    it("turns a binary relation into one edge", () => {
        const graphs = toWorldGraphs(instance([
            world({
                atoms: [{ id: "Aspect$0", classes: ["Matricula"] }, { id: "Object$0", classes: ["Pessoa"] }],
                tuples: [{ relation: "relation1", atoms: ["Aspect$0", "Object$0"] }],
            }),
        ]));

        expect(graphs[0].edges).toEqual([
            { id: "relation1-0-0", source: "Aspect$0", target: "Object$0", label: "relation1" },
        ]);
    });

    // Alloy relations can have any arity, but an edge joins exactly two nodes. A fan keeps
    // every end visible, which dropping the extra ends would not.
    it("fans a relation of more than two ends out from the first", () => {
        const graphs = toWorldGraphs(instance([
            world({
                atoms: [
                    { id: "Aspect$0", classes: [] },
                    { id: "Object$0", classes: [] },
                    { id: "Object$1", classes: [] },
                ],
                tuples: [{ relation: "ternary", atoms: ["Aspect$0", "Object$0", "Object$1"] }],
            }),
        ]));

        expect(graphs[0].edges).toEqual([
            { id: "ternary-0-0", source: "Aspect$0", target: "Object$0", label: "ternary (1)" },
            { id: "ternary-0-1", source: "Aspect$0", target: "Object$1", label: "ternary (2)" },
        ]);
    });

    // Cytoscape throws on an edge whose endpoint was never added, which would take down the
    // whole graph rather than lose one edge.
    it("drops a relation naming an endurant absent from this world", () => {
        const graphs = toWorldGraphs(instance([
            world({
                atoms: [{ id: "Object$0", classes: ["Pessoa"] }],
                tuples: [{ relation: "relation1", atoms: ["Object$0", "Object$99"] }],
            }),
        ]));

        expect(graphs[0].edges).toEqual([]);
    });

    it("gives every edge of a world a distinct id", () => {
        const graphs = toWorldGraphs(instance([
            world({
                atoms: [
                    { id: "Aspect$0", classes: [] },
                    { id: "Object$0", classes: [] },
                    { id: "Object$1", classes: [] },
                ],
                tuples: [
                    { relation: "relation1", atoms: ["Aspect$0", "Object$0"] },
                    { relation: "relation1", atoms: ["Aspect$0", "Object$1"] },
                ],
            }),
        ]));

        const ids = graphs[0].edges.map((edge) => edge.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("carries each endurant's nature and classes through to the node", () => {
        const graphs = toWorldGraphs(instance([
            world({ atoms: [{ id: "Aspect$0", classes: ["Matricula"] }] }),
        ]));

        expect(graphs[0].nodes[0]).toEqual({
            id: "Aspect$0",
            label: "Matricula",
            discriminator: "#0",
            nature: "aspect",
            classes: ["Matricula"],
        });
    });
});
