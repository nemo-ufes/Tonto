# Tonto MCP server

The `tonto-cli` package includes a standalone stdio MCP server. It uses the same
Langium parser, linker, validators, completion provider, and code-action provider
as Tonto's editor. No VS Code process or external validation API is required.

## Run from this checkout

Use Node.js 24+ for repository development:

```bash
npm install
npm run build --workspace=tonto-cli
node packages/tonto/bin/mcp.js /absolute/path/to/ontology-project
```

Configure an MCP client to launch the built checkout:

```json
{
  "mcpServers": {
    "tonto": {
      "command": "node",
      "args": ["/absolute/path/to/Tonto/packages/tonto/bin/mcp.js", "/absolute/path/to/ontology-project"]
    }
  }
}
```

After publishing this version, installing `tonto-cli` will also install the
`tonto-mcp` executable. Both `tonto-mcp /path/to/project` and
`tonto-cli mcp /path/to/project` start the server. The project root defaults to
the process working directory. The server reserves stdout for MCP messages;
language-service warnings and launch errors use stderr.

## Tools

| Tool | Result |
| --- | --- |
| `tonto_validate` | Project diagnostics with file URIs, target diagnostics, available editor repairs, and `valid` (no project errors). |
| `tonto_ast` | Validation results plus the target's JSON-safe Langium AST, including `$type`, `$refText`, `$ref` targets, and `$textRegion` ranges. Invalid models return a partial AST. |
| `tonto_apply` | Edited source and fresh project validation after explicit text edits or one selected editor repair. |
| `tonto_diff` | Diagnostics introduced, resolved, and unchanged between two versions of one model. |
| `tonto_hold` | Hold or release unsaved source at a project path so subsequent calls can resolve its declarations. |
| `tonto_complete` | Editor completion proposals at a cursor position. |

`tonto_validate`, `tonto_ast`, `tonto_apply`, and `tonto_complete` accept `source`
and/or `path`. Paths are relative to the configured project root or absolute
paths within it, and must end in `.tonto`. With `source` and no `path`, the target
is `__mcp_model__.tonto`. Providing `source` replaces the target's disk or held
content for that request. Providing only `path` reads the held or disk version.

Each request rebuilds the workspace from project `.tonto` files, excludes the
manifest's `outFolder`, loads Tonto's built-in datatypes, then overlays held
models and the request's source. This includes locally installed TPM sources;
dependencies are not downloaded by the server. Built-in datatypes such as
`number` and `string` are already globally available. The current language
services do not resolve an explicit `import Tonto.BasicDataTypes`.

All diagnostic, edit, and cursor positions use zero-based lines and UTF-16
characters, matching LSP. AST ranges use Langium's serialization format. Internal
container pointers and CST objects are omitted; references identify their targets
without recursively embedding them.

## Agent editing workflow

1. Call `tonto_validate` or `tonto_ast` with `{"path":"src/model.tonto"}`.
2. Use diagnostic locations and AST ranges to prepare an edit.
3. Call `tonto_apply` and inspect the returned `source` and diagnostics.
4. Save the returned text using the agent's file tools, or hold it with
   `tonto_hold` to inspect related models before saving.

For example, replace a declaration name with an explicit edit:

```json
{
  "path": "src/model.tonto",
  "edits": [{
    "range": {
      "start": { "line": 1, "character": 5 },
      "end": { "line": 1, "character": 11 }
    },
    "newText": "Agent"
  }]
}
```

Edit ranges refer to the input model before any edits. Out-of-bounds, reversed,
overlapping ranges and edits sharing a start position are rejected. Pass the
exact inspected `source` alongside `path` when the file might change between
inspection and editing.

If `repairs` contains an editor repair, select it with `diagnosticIndex` (an index
into `targetDiagnostics`) and, if needed, `repairTitle`. Supply either `edits` or
`diagnosticIndex`. The current code-action provider implements a capitalization
repair, but the validators do not emit its `name_lowercase` diagnostic, so
`repairs` is normally empty. This server does not invent repairs for modelling
decisions, and does not provide the reference server's automatic repair,
formatting, guide, rule catalog, or gUFO tools.

`tonto_diff` accepts `before`, `after`, and optional `path`. It compares the whole
project so an edit that breaks consumers can appear as an introduced diagnostic
in another file. It matches URI, code, severity, and message, ignoring location
shifts and preserving duplicate counts.

`tonto_hold` requires `path`; pass `source` to hold content and omit it to release
that overlay. Held files are scoped to the server session. `tonto_apply` returns
`saved: false` and does not update held content. No tool writes model files.
Paths outside the project root, including symlink escapes, are rejected. Tool
failures return MCP `isError`; validation errors are successful tool results
with diagnostics and `valid: false`.

## Verify

```bash
npm run build --workspace=tonto-cli
npx vitest run packages/tonto/test/mcp/server.test.ts
```

The transport and tool registration use the [official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).

## Shared tools and VS Code

The stdio server and VS Code chat invoke the same schema-validated `TontoAgentHandlers`.
All original six tools retain their contracts. Nine additions provide `tonto_guide`,
`tonto_rules`, `tonto_tables`, `tonto_patterns`, `tonto_explain`, `tonto_format`,
`tonto_digest`, `tonto_repair`, and `tonto_gufo`. Knowledge comes from this repository,
not a different parser. Resources live at `tonto://{guide,rules,tables,patterns}`;
prompts are `draft` and `review`.

Fourteen VS Code tools exclude session-local `tonto_hold`. Each invocation overlays
open model buffers on a fresh, isolated language-service workspace. Cancellation
rejects results before publication. Formatting and repair return previews; repair
refuses overlapping edits. gUFO uses the current modular OntoUML transformation and
returns generated Turtle or a reason it is unavailable, without writing output.

Run **Tonto: Set Up Agents** explicitly in a local desktop workspace. It checks the
configured `tonto.agents.nodePath` launcher, stages the ESM server in stable extension
storage, and merges `.codex/config.toml`, `.mcp.json`, `AGENTS.md`, and `CLAUDE.md`.
Existing differing Tonto configurations abort setup. Unrelated settings and
instructions survive. Updated files receive backups, and a failed write rolls back
completed writes when they have not changed concurrently. Remote setup is unsupported.
Restart external clients after setup. The bundle remains available after extension
upgrades at a stable runtime path; setup checks its recorded digest, preserves modified
runtimes, stages upgrades atomically and retains a backup of replaced bundles.
