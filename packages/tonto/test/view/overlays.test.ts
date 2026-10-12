import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { loadTontoDiagramWorkspace } from "../../src/diagram-spec/context.js";
import { projectSvgView } from "../../src/view/projection.js";

it("relinks unsaved cross-file buffers and reverts to disk without changing model files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tonto-view-buffers-"));
  try {
    const base = path.join(root, "base.tonto");
    const child = path.join(root, "child.tonto");
    await writeFile(base, "package Base\nkind Person");
    await writeFile(child, "package Child\nimport Base\nsubkind Adult specializes Person");
    const view = path.join(root, "child.tontoview");
    const initial = await loadTontoDiagramWorkspace("child.tonto", view);
    expect(initial.issues).toEqual([]);
    const changed = await loadTontoDiagramWorkspace("child.tonto", view, new Map([[base, "package Base\nkind Human"]]));
    expect(changed.issues.some(issue => issue.message.includes("Person"))).toBe(true);
    const both = await loadTontoDiagramWorkspace("child.tonto", view, new Map([
      [base, "package Base\nkind Human"], [child, "package Child\nimport Base\nsubkind Adult specializes Human"],
    ]));
    expect(both.issues).toEqual([]);
    expect(projectSvgView(both.ontologyModels).nodes.some(node => node.name === "Human")).toBe(true);
    expect(await readFile(base, "utf8")).toContain("Person");
    expect((await loadTontoDiagramWorkspace("child.tonto", view)).issues).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
