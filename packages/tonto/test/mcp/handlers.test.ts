import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { TontoAgentHandlers, vscodeToolNames } from "../../src/mcp/handlers.js";
import { knowledge } from "../../src/mcp/knowledge.js";
import { createTontoMcpServer } from "../../src/mcp/server.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe("shared agent handlers", () => {
  it("supports read-only knowledge, formatter and repair previews and schema cancellation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tonto-handlers-"));
    try {
      const source = "package Test\nkind Person";
      await writeFile(path.join(root, "test.tonto"), source);
      const handlers = new TontoAgentHandlers(root);
      expect(vscodeToolNames).toHaveLength(14);
      expect(vscodeToolNames).not.toContain("tonto_hold");
      expect(await handlers.invoke("tonto_tables", {})).toEqual(knowledge.tables);
      const patterns = await handlers.invoke("tonto_patterns", {}) as { examples: { valid: boolean }[] };
      expect(patterns.examples.every(example => example.valid)).toBe(true);
      const format = await handlers.invoke("tonto_format", { path: "test.tonto" }) as { saved: boolean; source: string };
      expect(format.saved).toBe(false);
      expect(format.source).toContain("Person");
      const gufoPreview = await handlers.invoke("tonto_gufo", { path: "test.tonto" }) as { available: boolean; saved: boolean; result: string };
      expect(gufoPreview).toMatchObject({ available: true, saved: false });
      expect(gufoPreview.result).toContain("Person");
      expect(await readdir(root)).toEqual(["test.tonto"]);
      const repair = await handlers.invoke("tonto_repair", { path: "test.tonto" }) as { saved: boolean; applied: boolean };
      expect(repair).toMatchObject({ saved: false, applied: false });
      const gufo = await handlers.invoke("tonto_gufo", { source: "package Test\nkind {" }) as { available: boolean; saved: boolean; reason: string };
      expect(gufo).toMatchObject({ available: false, saved: false });
      expect(gufo.reason).toContain("errors");
      expect(await readFile(path.join(root, "test.tonto"), "utf8")).toBe(source);
      await expect(handlers.invoke("tonto_complete", { line: -1, character: 0 })).rejects.toThrow();
      await expect(handlers.invoke("tonto_ast", { source }, () => true)).rejects.toThrow("cancelled");
      const other = new TontoAgentHandlers(root);
      await handlers.workspace.hold("base.tonto", "package Base\nkind Person");
      const input = { source: "package Test\nimport Base\nsubkind Adult specializes Person" };
      expect((await handlers.workspace.validate(input)).valid).toBe(true);
      expect((await other.workspace.validate(input)).valid).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("digests semantic declarations and resolved cross-file references", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tonto-digest-"));
    try {
      await writeFile(path.join(root, "base.tonto"), "package Base\nkind Person");
      const handlers = new TontoAgentHandlers(root);
      const result = await handlers.invoke("tonto_digest", { path: "test.tonto",
        source: "package Test\nimport Base\nsubkind Adult specializes Person { age: number }",
      }) as { packages: { name: string }[]; classes: { name: string; stereotype: string; attributes: { type: { target: { name: string; uri: string } } }[]; generalizations: { resolved: boolean; target: { qualifiedName: string; uri: string } }[] }[]; declarations: { name: string }[]; diagnostics: unknown[] };
      expect(result.packages.map(item => item.name)).toEqual(expect.arrayContaining(["Base", "Test"]));
      const adult = result.classes.find(item => item.name === "Adult")!;
      expect(adult.stereotype).toBe("subkind");
      expect(adult.generalizations[0]).toMatchObject({ resolved: true, target: { qualifiedName: "Base.Person" } });
      expect(adult.generalizations[0].target.uri).toContain("base.tonto");
      expect(adult.attributes[0].type.target).toMatchObject({ name: "number" });
      expect(adult.attributes[0].type.target.uri).toContain("builtin:");
      expect(result.declarations.some(item => item.name === "Adult")).toBe(true);
      expect(result.declarations.some(item => item.name === "Person")).toBe(false);
      expect(result.diagnostics).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("serves four resources and two prompts over the protocol", async () => {
    const server = createTontoMcpServer(os.tmpdir());
    const client = new Client({ name: "test", version: "1" });
    const [left, right] = InMemoryTransport.createLinkedPair();
    await server.connect(right); await client.connect(left);
    try {
      expect((await client.listResources()).resources).toHaveLength(4);
      expect((await client.listPrompts()).prompts).toHaveLength(2);
      const resource = await client.readResource({ uri: "tonto://tables" });
      expect(JSON.stringify(resource)).toContain("allowedNatures");
      const result = await client.getPrompt({ name: "review", arguments: { path: "test.tonto" } });
      expect(JSON.stringify(result)).toContain("tonto_validate");
    } finally { await client.close(); await server.close(); }
  });
});
