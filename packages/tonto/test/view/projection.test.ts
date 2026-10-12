import { EmptyFileSystem } from "langium";
import { describe, it, expect } from "vitest";
import { createTontoServices } from "../../src/language/tonto-module.js";
import { parseHelper } from "../../src/test/tonto-test.js";
import type { Model } from "../../src/language/generated/ast.js";
import { projectSvgView } from "../../src/view/projection.js";

describe("current AST SVG projection", () => {
  it("projects qualified identities, parallel declarations, package groups, gensets and source ranges", async () => {
    const services = createTontoServices(EmptyFileSystem);
    const parse = parseHelper<Model>(services.Tonto);
    const doc = await parse(`package Test
kind Person
subkind Adult specializes Person
subkind Child specializes Person
relation Adult -- knows -- Person
relation Adult -- knows -- Person
disjoint complete genset Ages { general Person specifics Adult, Child }
`);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    const view = projectSvgView([doc.parseResult.value]);
    expect(view.nodes.map((node) => node.id)).toEqual(["Test::Person", "Test::Adult", "Test::Child"]);
    const parallel = view.edges.filter((edge) => edge.kind === "relation");
    expect(parallel).toHaveLength(2);
    expect(parallel[1].id).toBe(`${parallel[0].id}#2`);
    expect(view.gensets[0]).toMatchObject({
      general: "Test::Person",
      specifics: ["Test::Adult", "Test::Child"],
      complete: true,
      disjoint: true,
    });
    expect(view.groups[0].nodes).toHaveLength(3);
    expect(view.nodes[0].source).toMatchObject({ line: 1, character: 0 });
    expect(parallel[0].source_?.uri).toMatch(/^file:/);
  });
});
