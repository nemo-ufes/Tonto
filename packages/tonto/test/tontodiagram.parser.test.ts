import { describe, expect, test } from "vitest";
import { parseTontoDiagramSpec, serializeTontoDiagramSpec, updateTontoDiagramLayout } from "../src/diagram-spec/index.js";

describe("tontodiagram parser", () => {
    test("parses the simplified diagram format", () => {
        const source = `diagram "People Overview" {
  source "./src/people.tonto"
  import people
  import hr

  include Person, Child, Employment
  relations employee, specializes
  direction LR
  stereotypes true
  attributes true
  external false
  datatypes true

  node Person { x 80 y 120 }
  node Child { x 360 y 120 }

  viewport { x 0 y 0 zoom 1 }
}`;

        const result = parseTontoDiagramSpec(source);

        expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
        expect(result.spec).toBeDefined();
        expect(result.spec?.title).toBe("People Overview");
        expect(result.spec?.source).toBe("./src/people.tonto");
        expect(result.spec?.imports).toEqual(["hr", "people"]);
        expect(result.spec?.filter.relations).toEqual(["employee", "specializes"]);
        expect(result.spec?.nodes).toEqual([
            { target: "Child", x: 360, y: 120 },
            { target: "Person", x: 80, y: 120 },
        ]);
    });

    test("parses the legacy block format for backwards compatibility", () => {
        const result = parseTontoDiagramSpec(`diagram "Legacy" {
  source "./src/people.tonto"
  module people

  filter {
    include Person, Child
    relations employee
    external false
    datatypes true
  }

  presentation {
    theme tonto-uml
    direction LR
    stereotypes true
    attributes true
  }

  viewport { x 0 y 0 zoom 1 }
}`);

        expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
        expect(result.spec?.imports).toEqual(["people"]);
        expect(result.spec?.filter.relations).toEqual(["employee"]);
    });

    test("serializes diagram state deterministically", () => {
        const parsed = parseTontoDiagramSpec(`diagram "People Overview" {
  source "./src/people.tonto"
  import people
  direction LR
  stereotypes true
  attributes true
  external false
  datatypes true

  viewport { x 0 y 0 zoom 1 }
}`);

        const updated = updateTontoDiagramLayout(
            parsed.spec!,
            [
                { target: "people.Child", x: 360.154, y: 120.499 },
                { target: "people.Person", x: 80, y: 120 },
            ]
        );

        expect(serializeTontoDiagramSpec(updated)).toContain("node people.Child { x 360.15 y 120.5 }");
        expect(serializeTontoDiagramSpec(updated)).toContain("import people");
        expect(serializeTontoDiagramSpec(updated)).not.toContain("viewport");
    });

    test("accepts diagrams without a source declaration", () => {
        const result = parseTontoDiagramSpec(`diagram "Empty" {
  import people
  viewport { x 0 y 0 zoom 1 }
}`);

        expect(result.spec).toBeDefined();
        expect(result.spec?.source).toBeUndefined();
        expect(result.spec?.imports).toEqual(["people"]);
        expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
    });

    test("strips legacy source declarations on serialize", () => {
        const parsed = parseTontoDiagramSpec(`diagram "Legacy" {
  source "./src/people.tonto"
  import people
  direction LR
  stereotypes true
  attributes true
  external false
  datatypes true
}`);

        const updated = updateTontoDiagramLayout(parsed.spec!, []);
        expect(serializeTontoDiagramSpec(updated)).not.toContain("source");
    });
});
