function quoteToml(value: string): string { return JSON.stringify(value); }

/** Preserve unrelated configuration and refuse an existing Tonto entry that differs. */
export function mergeCodexConfig(existing: string, node: string, bundle: string, root: string): string {
  const section = `[mcp_servers.tonto]\ncommand = ${quoteToml(node)}\nargs = [${quoteToml(bundle)}, ${quoteToml(root)}]\n`;
  // TOML permits whitespace, quoted keys and subtables. Refuse alternate
  // representations rather than append a duplicate or silently ignore env settings.
  if (/^\s*\[\s*mcp_servers\s*\.\s*(?:tonto|"tonto"|'tonto')\s*\./m.test(existing) ||
      /^\s*\[\s*mcp_servers\s*\.\s*(?:"tonto"|'tonto')\s*\]/m.test(existing) ||
      /^\s*\[\s+mcp_servers\s*\.\s*tonto\s*\]/m.test(existing) ||
      /^\s*mcp_servers\s*=/m.test(existing) ||
      /^\s*\[\s*mcp_servers\s*\][\s\S]*?^\s*(?:tonto|"tonto"|'tonto')\s*[.=]/m.test(existing)) {
    throw new Error("Existing Codex Tonto configuration conflicts with setup.");
  }
  const alternativeHeaders = existing.match(/^[\t ]*\[[\t ]*mcp_servers[\t ]*\.[\t ]*tonto[\t ]*\][^\n]*$/gm) ?? [];
  if (alternativeHeaders.some(header => header.trim() !== "[mcp_servers.tonto]")) throw new Error("Existing Codex Tonto configuration conflicts with setup.");
  const entry = existing.match(/^\[mcp_servers\.tonto\][\s\S]*?(?=^\[|$(?![\s\S]))/m)?.[0];
  if (entry) { if (entry.trim() === section.trim()) return existing; throw new Error("Existing Codex Tonto configuration differs; resolve it before running setup."); }
  if (/^\[mcp_servers\.(?:tonto|"tonto"|'tonto')[.\]]/m.test(existing) || /^\[mcp_servers\][\s\S]*?^tonto\s*=/m.test(existing)) throw new Error("Existing Codex Tonto configuration conflicts with setup.");
  return `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}\n${section}`;
}
export function mergeClaudeConfig(existing: string | undefined, node: string, bundle: string, root: string): string {
  const value = JSON.parse(existing ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Claude configuration must be a JSON object.");
  const entry = { command: node, args: [bundle, root] };
  if (value.mcpServers !== undefined && (!value.mcpServers || typeof value.mcpServers !== "object" || Array.isArray(value.mcpServers))) throw new Error("Claude mcpServers must be an object.");
  if (value.mcpServers?.tonto !== undefined && JSON.stringify(value.mcpServers.tonto) !== JSON.stringify(entry)) throw new Error("Existing Claude Tonto configuration differs; resolve it before running setup.");
  value.mcpServers = { ...value.mcpServers, tonto: entry };
  return `${JSON.stringify(value, null, 2)}\n`;
}
