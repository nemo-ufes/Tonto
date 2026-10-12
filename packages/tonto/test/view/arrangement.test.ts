import { describe, it, expect } from "vitest";
import {
  emptyViewFile,
  parseViewFile,
  readViewFile,
  serializeViewFile,
  reconcile,
  invalidateMovedRoutes,
  RelationIds,
  type ViewModel,
} from "../../src/view/model/index.js";
import { sizeOf } from "../../src/view/canvas/measure.js";
import { placeNewNodes } from "../../src/view/canvas/place.js";
import { render } from "../../src/view/canvas/render.js";
import { autoLayout } from "../../src/view/canvas/autolayout.js";

const view: ViewModel = {
  nodes: ["a", "b", "c"].map((id) => ({ id, kind: "class", name: id, color: "#FFFFFF", attributes: [] })),
  edges: [{ id: "ab", kind: "generalization", source: "b", target: "a" }],
  groups: [],
  gensets: [],
};
describe("SVG arrangements", () => {
  it("roundtrips source, viewport, routes, orphans and constraints without discarding saved work", () => {
    const file = emptyViewFile();
    file.source = "../model.tonto";
    file.viewport = { x: 2, y: 3, zoom: 1.5 };
    file.nodes.a = { x: 10, y: 20, width: 250 };
    file.nodes.removed = { x: -20, y: 40 };
    file.edges.deleted = {
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
      ],
    };
    file.constraints.pinned = ["a"];
    const read = parseViewFile(serializeViewFile(file));
    expect(read).toEqual(file);
    const reconciled = reconcile(read, view);
    expect(reconciled.orphans).toEqual(["removed", "deleted"]);
    expect(reconciled.unplaced).toEqual(["b", "c"]);
    expect(read.nodes.removed).toBeDefined();
    expect(read.edges.deleted).toBeDefined();
  });
  it("rejects malformed/unsupported documents and invalid numeric geometry", () => {
    expect(() => parseViewFile("{")).toThrow();
    expect(() => parseViewFile('{"version":2}')).toThrow();
    const file = readViewFile({
      nodes: { a: { x: Infinity, y: 0 }, b: { x: 0, y: 0, width: -1 } },
      viewport: { x: 0, y: 0, zoom: 0 },
    });
    expect(file.nodes.a).toBeUndefined();
    expect(file.nodes.b.width).toBeUndefined();
    expect(file.viewport).toBeUndefined();
  });
  it("distinguishes duplicate associations without changing unrelated identifiers", () => {
    const ids = new RelationIds();
    const first = ids.next("a", "b", "material", "owns");
    ids.next("c", "d", "material");
    expect(ids.next("a", "b", "material", "owns")).toBe(`${first}#2`);
  });
  it("places only new nodes and escapes model text in rendered/exported SVG", () => {
    const file = emptyViewFile();
    const model = {
      ...view,
      nodes: [{ ...view.nodes[0], name: '<script>alert("x")</script>', documentation: '<img onerror="x">' }],
    };
    const sizes = Object.fromEntries(model.nodes.map((node) => [node.id, sizeOf(node, file.display)]));
    const positions = placeNewNodes(model, sizes, { a: { x: 125, y: 75 } });
    expect(positions.a.x).toBe(125);
    const svg = render({ view: model, positions, display: file.display }).svg;
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img");
  });
  it("invalidates incident and obstructed guides but retains label offsets and orphan routes", () => {
    const file = emptyViewFile();
    file.nodes.c = { x: 40, y: 0, width: 30, height: 40 };
    file.edges.ab = {
      points: [
        { x: 0, y: 5 },
        { x: 100, y: 5 },
      ],
      labelOffset: { x: 1, y: 2 },
    };
    file.edges.orphan = {
      points: [
        { x: 300, y: 300 },
        { x: 400, y: 300 },
      ],
    };
    const routes = invalidateMovedRoutes(file, view, ["c"]);
    expect(routes.ab).toEqual({ labelOffset: { x: 1, y: 2 } });
    expect(routes.orphan).toEqual(file.edges.orphan);
  });
  it("partial layout preserves unselected placements and pins", async () => {
    const file = emptyViewFile();
    const sizes = Object.fromEntries(view.nodes.map((node) => [node.id, sizeOf(node, file.display)]));
    const current = placeNewNodes(view, sizes, { a: { x: 123, y: 456 }, b: { x: 999, y: 111 }, c: { x: 888, y: 222 } });
    const result = await autoLayout(view, sizes, current, {
      only: ["a", "b"],
      constraints: { pinned: ["a"], alignments: [], distributions: [] },
    });
    expect(result.positions.a).toEqual(current.a);
    expect(result.positions.c).toEqual(current.c);
  });
});
