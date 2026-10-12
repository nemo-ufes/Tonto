import { describe, expect, it } from "vitest";
import { filterItemsOf, filterView } from "../../src/diagram-editor/recovered-filters.js";
import type { ViewModel } from "tonto-cli/lib/view/model/index.js";

const model: ViewModel = {
  nodes: ["Person", "Student"].map(name => ({ id: `Model::${name}`, kind: "class", name, package: "Model", color: "#ddd", attributes: [] })),
  edges: ["one", "two"].map(id => ({ id, kind: "relation", source: "Model::Person", target: "Model::Student", name: "teaches", sourceEnd: {}, targetEnd: {} })),
  groups: [{ id: "Model", name: "Model", nodes: ["Model::Person", "Model::Student"] }],
  gensets: [],
};

describe("recovered visualizer filters", () => {
  it("distinguishes parallel associations without showing internal ids", () => {
    const items = filterItemsOf(model).filter(item => item.kind === "association");
    expect(items.map(item => item.label)).toEqual([
      "Model::Person — teaches — Model::Student (1 of 2)",
      "Model::Person — teaches — Model::Student (2 of 2)",
    ]);
    expect(items.map(item => item.ids)).toEqual([["one"], ["two"]]);
  });
  it("hides incident edges and restores from the unmodified catalog", () => {
    const hidden = filterView(model, ["Model::Student"]);
    expect(hidden.nodes.map(node => node.id)).toEqual(["Model::Person"]);
    expect(hidden.edges).toEqual([]);
    expect(hidden.groups[0].nodes).toEqual(["Model::Person"]);
    expect(filterView(model, []).edges).toHaveLength(2);
    expect(model.nodes).toHaveLength(2);
  });
});
