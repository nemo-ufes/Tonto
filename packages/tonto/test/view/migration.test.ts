import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { it, expect } from "vitest";
import { buildTontoDiagramGraph, parseTontoDiagramSpec } from "../../src/diagram-spec/index.js";
import { canonicalizeLegacyViewFile, legacyGraphToSvgView, legacySpecToViewFile } from "../../src/view/model/legacy.js";
import { parseViewFile, serializeViewFile } from "../../src/view/model/viewfile.js";
it("converts legacy placements and preserves reverse direction without changing legacy source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tonto-view-migration-"));
  try {
    await writeFile(path.join(root, "tonto.json"), '{"projectName":"migration"}');
    await writeFile(path.join(root, "model.tonto"), "package Test\nkind Person\n");
    const text =
      'diagram "People" {\n source "model.tonto"\n direction RL\n stereotypes false\n attributes false\n node Person { x 10 y 20 }\n}';
    const parsed = parseTontoDiagramSpec(text);
    expect(parsed.issues).toEqual([]);
    const graph = await buildTontoDiagramGraph(parsed.spec!, path.join(root, "people.tontodiagram"));
    const { file, unmapped } = legacySpecToViewFile(parsed.spec!, graph, "../model.tonto");
    expect(unmapped).toEqual([]);
    expect(legacyGraphToSvgView(graph).nodes[0].id).toBe("Test.Person");
    const migrated = parseViewFile(serializeViewFile(canonicalizeLegacyViewFile(file, graph)));
    expect(migrated.nodes["Test::Person"]).toEqual({ x: 10, y: 20 });
    expect(migrated.source).toBe("../model.tonto");
    expect(migrated.legacyDirection).toBe("RL");
    expect(migrated.display.showAttributes).toBe(false);
    expect(migrated.display.showRelationStereotypes).toBe(false);
    expect(parseTontoDiagramSpec(text).spec).toEqual(parsed.spec);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("transfers implicit visible positions and remaps hidden workspace identities without replacing package punctuation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tonto-filter-migration-"));
  try {
    await writeFile(path.join(root, "tonto.json"), '{"projectName":"filtered"}');
    await writeFile(
      path.join(root, "model.tonto"),
      "package People.Core\nkind Person\nkind Organization\nkind Hidden\n"
    );
    const parsed = parseTontoDiagramSpec('diagram "Visible" {\n source "model.tonto"\n include Person, Organization\n}');
    expect(parsed.issues).toEqual([]);
    const graph = await buildTontoDiagramGraph(parsed.spec!, path.join(root, "visible.tontodiagram"));
    expect(graph.nodes).toHaveLength(2);
    const { file } = legacySpecToViewFile(parsed.spec!, graph, "../model.tonto");
    const migrated = parseViewFile(serializeViewFile(canonicalizeLegacyViewFile(file, graph)));
    for (const node of graph.nodes) expect(migrated.nodes[`${node.module}::${node.label}`]).toEqual(node.position);
    expect(migrated.content.hidden).toContain("People.Core::Hidden");
    expect(migrated.content.hidden).not.toContain("People::Core::Hidden");
    expect(migrated.nodes["People.Core::Organization"].x).not.toEqual(migrated.nodes["People.Core::Person"].x);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
