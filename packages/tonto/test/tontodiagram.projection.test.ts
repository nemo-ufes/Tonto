import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildTontoDiagramGraph, parseTontoDiagramSpec } from "../src/diagram-spec/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map(async (directory) => {
            await rm(directory, { force: true, recursive: true });
        })
    );
});

describe("tontodiagram projection", () => {
    test("projects tonto models into graph nodes and edges", async () => {
        const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "tonto-diagram-"));
        temporaryDirectories.push(temporaryDirectory);

        const sourcePath = path.join(temporaryDirectory, "people.tonto");
        const hrSourcePath = path.join(temporaryDirectory, "hr.tonto");
        const diagramPath = path.join(temporaryDirectory, "people.tontodiagram");

        await writeFile(sourcePath, `package people

kind Person {
  name: string
}

phase Child specializes Person

relator Employment

@mediation relation Employment [1] -- employee -- [1] Person
`, "utf8");
        await writeFile(hrSourcePath, `import people

package hr

relator Contract
@mediation relation Contract [1] -- contractor -- [1] people.Person
`, "utf8");

        const parsed = parseTontoDiagramSpec(`diagram "People Overview" {
  source "./people.tonto"
  import people
  import hr
  direction LR
  stereotypes true
  attributes true
  external false
  datatypes false

  node Child { x 360 y 120 }

  viewport { x 0 y 0 zoom 1 }
}`);

        await writeFile(diagramPath, `placeholder`, "utf8");

        const graph = await buildTontoDiagramGraph(parsed.spec!, diagramPath);

        expect(graph.packages).toEqual(["hr", "people"]);
        expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
            "people.Person",
            "people.Child",
            "people.Employment",
            "hr.Contract",
        ]));
        expect(graph.edges.map((edge) => edge.id)).toEqual(expect.arrayContaining([
            "people.Child::specializes::people.Person",
            "people.Employment::employee::people.Person",
            "hr.Contract::contractor::people.Person",
        ]));
        expect(graph.nodes.find((node) => node.id === "people.Child")?.position).toEqual({ x: 360, y: 120 });
    });

    test("applies relation filters using edge labels", async () => {
        const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "tonto-diagram-"));
        temporaryDirectories.push(temporaryDirectory);

        const sourcePath = path.join(temporaryDirectory, "people.tonto");
        const diagramPath = path.join(temporaryDirectory, "filtered.tontodiagram");

        await writeFile(sourcePath, `package people

kind Person
relator Employment
@mediation relation Employment [1] -- employee -- [1] Person
`, "utf8");

        const parsed = parseTontoDiagramSpec(`diagram "Filtered" {
  source "./people.tonto"
  import people
  relations employee
  direction LR
  stereotypes true
  attributes true
  external false
  datatypes false

  viewport { x 0 y 0 zoom 1 }
}`);

        const graph = await buildTontoDiagramGraph(parsed.spec!, diagramPath);

        expect(graph.nodes).toHaveLength(2);
        expect(graph.edges).toHaveLength(1);
        expect(graph.edges[0]?.label).toBe("employee");
    });

    test("keeps objects nature as its own palette token", async () => {
        const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "tonto-diagram-"));
        temporaryDirectories.push(temporaryDirectory);

        const sourcePath = path.join(temporaryDirectory, "objects.tonto");
        const diagramPath = path.join(temporaryDirectory, "objects.tontodiagram");

        await writeFile(sourcePath, `package things

category PhysicalThing of objects
`, "utf8");

        const parsed = parseTontoDiagramSpec(`diagram "Objects" {
  source "./objects.tonto"
  import things

  viewport { x 0 y 0 zoom 1 }
}`);

        const graph = await buildTontoDiagramGraph(parsed.spec!, diagramPath);

        expect(graph.nodes.find((node) => node.id === "things.PhysicalThing")?.appearance.palette).toBe("objects");
    });
});
