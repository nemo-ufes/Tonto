import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTontoMcpServer } from "../../src/mcp/server.js";
import { TontoMcpWorkspace } from "../../src/mcp/workspace.js";

describe("Tonto MCP", () => {
  let root: string;
  let workspace: TontoMcpWorkspace;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "tonto-mcp-"));
    workspace = new TontoMcpWorkspace(root);
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("serializes the real AST, references and source ranges without cycles", async () => {
    const result = await workspace.ast({ source: "package Test\nkind Person\nsubkind Adult specializes Person" });
    expect(result.valid).toBe(true);
    const serialized = JSON.stringify(result.ast);
    expect(serialized).toContain('"$type":"ClassDeclaration"');
    expect(serialized).toContain('"$refText":"Person"');
    expect(serialized).toContain('"$textRegion"');
    expect(serialized).not.toContain('"$container"');
    expect(serialized).not.toContain('"$cstNode"');
  });

  it("returns syntax, linking and ontological diagnostics", async () => {
    const syntax = await workspace.validate({ source: "package Test\nkind {" });
    expect(syntax.valid).toBe(false);
    expect(syntax.targetDiagnostics.some((diagnostic) => diagnostic.severity === 1)).toBe(true);
    const linking = await workspace.validate({ source: "package Test\nsubkind Adult specializes Missing" });
    expect(linking.valid).toBe(false);
    expect(linking.targetDiagnostics.some((diagnostic) => diagnostic.message.includes("Missing"))).toBe(true);
    const semantic = await workspace.validate({ source: "package Test\nrole Student" });
    expect(semantic.valid).toBe(false);
    expect(semantic.targetDiagnostics.length).toBeGreaterThan(0);
  });

  it("loads project imports and builtins, replaces disk text, and refreshes changed files", async () => {
    const base = path.join(root, "base.tonto");
    await writeFile(base, "package Base\nkind Person");
    const input = { source: "package Test\nimport Base\nsubkind Adult specializes Person" };
    expect((await workspace.validate(input)).valid).toBe(true);
    await writeFile(base, "package Base\nkind Other");
    expect((await workspace.validate(input)).valid).toBe(false);
    const override = await workspace.validate({ path: "base.tonto", source: "package Base\nkind Person" });
    expect(override.valid).toBe(true);
    expect(await readFile(base, "utf8")).toContain("Other");
    const builtins = await workspace.validate({ source: "package Test\nkind Person { age: number }" });
    expect(builtins.valid).toBe(true);
  });

  it("holds and releases unsaved imports without saving files", async () => {
    const input = { source: "package Test\nimport Base\nsubkind Adult specializes Person" };
    expect((await workspace.validate(input)).valid).toBe(false);
    await workspace.hold("base.tonto", "package Base\nkind Person");
    expect((await workspace.validate(input)).valid).toBe(true);
    await workspace.hold("base.tonto");
    expect((await workspace.validate(input)).valid).toBe(false);
    await expect(readFile(path.join(root, "base.tonto"))).rejects.toThrow();
  });

  it("applies text edits and compares diagnostics while leaving files intact", async () => {
    const before = "package Test\nsubkind Adult specializes Missing";
    const after = "package Test\nkind Person\nsubkind Adult specializes Person";
    await writeFile(path.join(root, "test.tonto"), before);
    const result = await workspace.apply({ path: "test.tonto", edits: [{
      range: { start: { line: 0, character: 0 }, end: { line: 1, character: before.split("\n")[1].length } }, newText: after,
    }] });
    expect(result.source).toBe(after);
    expect(result.valid).toBe(true);
    expect(result.saved).toBe(false);
    expect(await readFile(path.join(root, "test.tonto"), "utf8")).toBe(before);
    const difference = await workspace.diff({ before, after, path: "test.tonto" });
    expect(difference.resolved.length).toBeGreaterThan(0);
    expect(difference.introduced).toEqual([]);
  });

  it("rejects escaping paths, symlinks, invalid edits and unavailable repairs", async () => {
    const source = "package Test\nkind Person";
    await expect(workspace.validate({ source, path: "../outside.tonto" })).rejects.toThrow("project root");
    await symlink(os.tmpdir(), path.join(root, "outside"));
    await expect(workspace.hold("outside/new.tonto", source)).rejects.toThrow("project root");
    await expect(workspace.validate({ source, path: "secret.txt" })).rejects.toThrow(".tonto");
    await expect(workspace.apply({ source, diagnosticIndex: 0 })).rejects.toThrow("repair");
    await expect(workspace.apply({ source, edits: [{ range: {
      start: { line: 99, character: 0 }, end: { line: 99, character: 1 },
    }, newText: "x" }] })).rejects.toThrow("outside the model");
    const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };
    await expect(workspace.apply({ source, edits: [{ range, newText: "x" }, { range, newText: "y" }] }))
      .rejects.toThrow("overlap");
  });

  it("exposes tools through an actual MCP client, validates schemas and reports tool errors", async () => {
    const server = createTontoMcpServer(root);
    const client = new Client({ name: "tonto-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const list = await client.listTools();
      expect(list.tools.map((tool) => tool.name).sort()).toEqual([
        "tonto_apply", "tonto_ast", "tonto_complete", "tonto_diff", "tonto_digest", "tonto_explain", "tonto_format", "tonto_gufo", "tonto_guide", "tonto_hold", "tonto_patterns", "tonto_repair", "tonto_rules", "tonto_tables", "tonto_validate",
      ]);
      const result = await client.callTool({ name: "tonto_validate", arguments: { source: "package Test\nkind Person" } });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result.content)).toContain('\\"valid\\":true');
      const error = await client.callTool({ name: "tonto_validate", arguments: {} });
      expect(error.isError).toBe(true);
      const badPosition = await client.callTool({ name: "tonto_complete", arguments: { source: "", line: -1, character: 0 } });
      expect(badPosition.isError).toBe(true);
      const completions = await client.callTool({ name: "tonto_complete", arguments: {
        source: "package Test\n", line: 1, character: 0,
      } });
      expect(completions.isError).not.toBe(true);
      expect(JSON.stringify(completions.content)).toContain("items");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
