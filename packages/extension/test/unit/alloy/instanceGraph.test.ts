import { describe, expect, it } from "vitest";
import { InstanceDTO, WorldDTO } from "../../../src/alloy/alloyTypes.js";
import {
    describeAtom,
    discriminatorOf,
    natureOf,
    toOntology,
    positionWorldMap,
    toWorldGraphs,
    toWorldMap,
} from "../../../src/alloy/instanceGraph.js";

const ontology = toOntology([
    { alloyName: "Pessoa", name: "Pessoa", stereotype: "kind" },
    { alloyName: "Organizacao", name: "Organizacao", stereotype: "kind" },
    { alloyName: "Matricula", name: "Matricula", stereotype: "relator" },
    { alloyName: "Crianca", name: "Crianca", stereotype: "phase" },
    { alloyName: "Estudante", name: "Estudante", stereotype: "role" },
    { alloyName: "PessoaFisica", name: "Pessoa Fisica", stereotype: "kind" },
]);

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

describe("describeAtom", () => {
    // A kind carries the principle of identity and holds in every world; phases and roles are
    // contingent. Listing them flat gives equal weight to what an endurant is and how it
    // happens to be, which is not how a modeller reads one.
    it("leads with what the endurant is and trails how it currently is", () => {
        const described = describeAtom(
            { id: "Object$1", classes: ["Pessoa", "Crianca", "Estudante"] }, ontology);

        expect(described.label).toBe("Pessoa");
        expect(described.qualifiers).toEqual(["Crianca", "Estudante"]);
    });

    it("shows the modeller's own name, spaces and all", () => {
        expect(describeAtom({ id: "Object$0", classes: ["PessoaFisica"] }, ontology).label)
            .toBe("Pessoa Fisica");
    });

    it("counts a relator as a kind, since it provides identity too", () => {
        const described = describeAtom({ id: "Aspect$0", classes: ["Matricula"] }, ontology);

        expect(described.label).toBe("Matricula");
        expect(described.issues).toEqual([]);
    });

    // Axiom a22 of UFO: everything necessarily instantiates at most one kind. An instance
    // breaking it is evidence about the transformation, and is invisible in the .als itself.
    it("flags an endurant instantiating two kinds", () => {
        const described = describeAtom(
            { id: "Object$0", classes: ["Pessoa", "Organizacao", "Estudante"] }, ontology);

        expect(described.issues).toHaveLength(1);
        expect(described.issues[0]).toContain("2 kinds");
        expect(described.issues[0]).toContain("Pessoa, Organizacao");
        expect(described.issues[0]).toContain("at most one");
    });

    it("does not flag several phases or roles, which are contingent by nature", () => {
        expect(describeAtom({ id: "Object$1", classes: ["Crianca", "Estudante"] }, ontology).issues)
            .toEqual([]);
    });

    // Without an ontology there is no way to tell a kind from a phase, and guessing would put
    // a name in the position that means "this is its identity" without grounds.
    it("treats every class as a qualifier when the ontology is unknown", () => {
        const described = describeAtom(
            { id: "Object$1", classes: ["Pessoa", "Crianca"] }, new Map());

        expect(described.label).toBe("");
        expect(described.qualifiers).toEqual(["Pessoa", "Crianca"]);
        expect(described.issues).toEqual([]);
    });

    it("labels an endurant in no class at all by its nature", () => {
        expect(describeAtom({ id: "Object$9", classes: [] }, ontology).label).toBe("(object)");
        expect(describeAtom({ id: "Aspect$0", classes: [] }, ontology).label).toBe("(aspect)");
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
        ]), ontology);

        expect(graphs[0].nodes[0]).toEqual({
            id: "Aspect$0",
            label: "Matricula",
            qualifiers: [],
            discriminator: "#0",
            nature: "aspect",
            classes: ["Matricula"],
            issues: [],
        });
    });
});

describe("toWorldMap", () => {
    const chain = toWorldGraphs(instance([
        world({ id: "w/PastWorld$0", kind: "PastWorld", next: ["w/CurrentWorld$0", "w/CounterfactualWorld$0"] }),
        world({ id: "w/CurrentWorld$0", kind: "CurrentWorld", next: ["w/FutureWorld$0"], atoms: [{ id: "Object$0", classes: [] }] }),
        world({ id: "w/FutureWorld$0", kind: "FutureWorld", next: [] }),
        world({ id: "w/CounterfactualWorld$0", kind: "CounterfactualWorld", next: [] }),
    ]));

    it("has one node per world", () => {
        expect(toWorldMap(chain).nodes.map((node) => node.kind)).toEqual([
            "PastWorld", "CurrentWorld", "FutureWorld", "CounterfactualWorld",
        ]);
    });

    // The branch is the point: one past leads to the present, another to what could have
    // happened instead. Tabs alone put them side by side as if unrelated.
    it("draws the branch from the past to both the present and the counterfactual", () => {
        const edges = toWorldMap(chain).edges;

        expect(edges).toEqual([
            { id: "w/PastWorld$0->w/CurrentWorld$0", source: "w/PastWorld$0", target: "w/CurrentWorld$0" },
            { id: "w/PastWorld$0->w/CounterfactualWorld$0", source: "w/PastWorld$0", target: "w/CounterfactualWorld$0" },
            { id: "w/CurrentWorld$0->w/FutureWorld$0", source: "w/CurrentWorld$0", target: "w/FutureWorld$0" },
        ]);
    });

    it("carries the tab position so clicking the map can select a world", () => {
        expect(toWorldMap(chain).nodes.map((node) => node.index)).toEqual([0, 1, 2, 3]);
    });

    it("says how many endurants each world holds", () => {
        const labels = toWorldMap(chain).nodes.map((node) => node.label);

        expect(labels[1]).toContain("1 endurant");
        expect(labels[0]).toContain("0 endurants");
    });

    it("skips a successor the instance does not contain", () => {
        const dangling = toWorldGraphs(instance([
            world({ id: "w/CurrentWorld$0", next: ["w/FutureWorld$9"] }),
        ]));

        expect(toWorldMap(dangling).edges).toEqual([]);
    });

    it("has nothing to draw for no worlds", () => {
        expect(toWorldMap([])).toEqual({ nodes: [], edges: [] });
    });
});

// Instance 30 of the University example, as the server actually returned it. Every relation
// runs through a relator, so anything that drops aspect nodes drops all four edges with them.
describe("a world whose relations all run through relators", () => {
    const graphs = toWorldGraphs({
        commandName: "singleWorld",
        instanceNumber: 30,
        classes: [],
        worlds: [{
            id: "w/CurrentWorld$0",
            kind: "CurrentWorld",
            next: [],
            atoms: [
                { id: "Object$0", classes: ["Organizacao", "Universidade"] },
                { id: "Object$1", classes: ["Pessoa", "Estudante"] },
                { id: "Object$2", classes: ["Pessoa", "Organizacao", "Crianca", "Adulto"] },
                { id: "Aspect$0", classes: ["Matricula"] },
                { id: "Aspect$1", classes: ["Matricula"] },
            ],
            tuples: [
                { relation: "relation1", atoms: ["Aspect$0", "Object$2"] },
                { relation: "relation1", atoms: ["Aspect$1", "Object$1"] },
                { relation: "relation2", atoms: ["Aspect$0", "Object$0"] },
                { relation: "relation2", atoms: ["Aspect$1", "Object$2"] },
            ],
        }],
    }, ontology)[0];

    it("keeps every endurant, relators included", () => {
        expect(graphs.nodes).toHaveLength(5);
        expect(graphs.nodes.filter((node) => node.nature === "aspect")).toHaveLength(2);
    });

    it("keeps all four relations", () => {
        expect(graphs.edges).toHaveLength(4);
    });

    it("gives the two relators distinct ids despite identical labels", () => {
        const relators = graphs.nodes.filter((node) => node.nature === "aspect");

        expect(relators.map((node) => node.label)).toEqual(["Matricula", "Matricula"]);
        expect(relators.map((node) => node.discriminator)).toEqual(["#0", "#1"]);
    });

    it("gives every edge a distinct id, including repeats of the same relation", () => {
        const ids = graphs.edges.map((edge) => edge.id);

        expect(new Set(ids).size).toBe(4);
    });

    it("flags only the endurant with two kinds", () => {
        const flagged = graphs.nodes.filter((node) => node.issues.length > 0);

        expect(flagged.map((node) => node.discriminator)).toEqual(["#2"]);
    });
});

describe("positionWorldMap", () => {
    const chain = toWorldMap(toWorldGraphs({
        commandName: "multipleWorlds",
        instanceNumber: 1,
        classes: [],
        worlds: [
            { id: "w/CurrentWorld$0", kind: "CurrentWorld", next: ["w/FutureWorld$0"], atoms: [], tuples: [] },
            { id: "w/PastWorld$0", kind: "PastWorld", next: ["w/CurrentWorld$0", "w/CounterfactualWorld$0"], atoms: [], tuples: [] },
            { id: "w/FutureWorld$0", kind: "FutureWorld", next: [], atoms: [], tuples: [] },
            { id: "w/CounterfactualWorld$0", kind: "CounterfactualWorld", next: [], atoms: [], tuples: [] },
        ],
    }, ontology));

    // Depth from the start of time is the arrow of time, so a column is a generation. A
    // general layout would arrange these differently on each run, which for a picture of
    // time reads as noise.
    it("puts each world in the generation it belongs to", () => {
        const at = positionWorldMap(chain);

        expect(at.get("w/PastWorld$0")?.x).toBe(0);
        expect(at.get("w/CurrentWorld$0")?.x).toBe(190);
        expect(at.get("w/CounterfactualWorld$0")?.x).toBe(190);
        expect(at.get("w/FutureWorld$0")?.x).toBe(380);
    });

    // The present and the counterfactual are the two branches out of the same past, so they
    // share a column and have to be told apart by row.
    it("separates the branches that share a generation", () => {
        const at = positionWorldMap(chain);

        expect(at.get("w/CurrentWorld$0")?.y).not.toBe(at.get("w/CounterfactualWorld$0")?.y);
    });

    it("gives every world a position", () => {
        expect(positionWorldMap(chain).size).toBe(4);
    });

    it("places a lone world at the start", () => {
        const single = toWorldMap(toWorldGraphs({
            commandName: "singleWorld", instanceNumber: 1, classes: [],
            worlds: [{ id: "w/CurrentWorld$0", kind: "CurrentWorld", next: [], atoms: [], tuples: [] }],
        }, ontology));

        expect(positionWorldMap(single).get("w/CurrentWorld$0")).toEqual({ x: 0, y: 0 });
    });

    // Nothing in the generated model forbids a cycle in `next` outright, and a cycle leaves
    // every world with a predecessor — so there is no root to start from and the loop that
    // assigns depth would leave them unplaced.
    it("still places worlds that form a cycle", () => {
        const cyclic = toWorldMap(toWorldGraphs({
            commandName: "x", instanceNumber: 1, classes: [],
            worlds: [
                { id: "a", kind: "A", next: ["b"], atoms: [], tuples: [] },
                { id: "b", kind: "B", next: ["a"], atoms: [], tuples: [] },
            ],
        }, ontology));

        expect(positionWorldMap(cyclic).size).toBe(2);
    });
});
