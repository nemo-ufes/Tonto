import { describe, expect, it } from "vitest";
import { mergeClaudeConfig, mergeCodexConfig } from "../../../extension/src/ai/config.js";

describe("agent configuration merge", () => {
  it("preserves other client configuration and refuses conflicts", () => {
    const initial = 'model = "example"\n[mcp_servers.other]\ncommand = "other"\n';
    const merged = mergeCodexConfig(initial, "/bin/node", "/bundle.mjs", "/project");
    expect(merged.startsWith(initial)).toBe(true);
    expect(mergeCodexConfig(merged, "/bin/node", "/bundle.mjs", "/project")).toBe(merged);
    expect(() => mergeCodexConfig(merged, "different", "/bundle.mjs", "/project")).toThrow("differs");
    expect(() => mergeCodexConfig('[mcp_servers.tonto.env]\nX = "test"', "node", "bundle", "root")).toThrow("conflicts");
    const claude = mergeClaudeConfig('{"custom":true,"mcpServers":{"other":{"command":"other"}}}', "node", "bundle", "root");
    expect(JSON.parse(claude)).toMatchObject({ custom: true, mcpServers: { other: { command: "other" } } });
    expect(() => mergeClaudeConfig(claude, "different", "bundle", "root")).toThrow("differs");
    expect(() => mergeClaudeConfig('{"mcpServers":[]}', "node", "bundle", "root")).toThrow("object");
  });
});

it("refuses alternate TOML Tonto entries instead of appending duplicate tables", () => {
  for (const existing of [
    '[ mcp_servers.tonto ]\ncommand = "custom"',
    '[mcp_servers."tonto"]\ncommand = "custom"',
    '[mcp_servers.tonto.env]\nTOKEN = "example"',
    '[mcp_servers]\n"tonto" = { command = "custom" }',
    'mcp_servers = { tonto = { command = "custom" } }',
  ]) expect(() => mergeCodexConfig(existing, "node", "/runtime/mcp.mjs", "/root")).toThrow("conflict");
});
