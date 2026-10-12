# SVG and agent integration verification

Verified on 2026-10-12 from the isolated implementation worktree. The original
checkout and its existing uncommitted work were preserved. The review stack starts
from `codex/svg-mcp-baseline`, a snapshot of that existing work, rather than adding
those changes to the feature PRs' diffs. That baseline must be integrated separately
before this stack can target main.

## Results

- 42 focused tests across 12 files passed: MCP contracts and handlers, setup
  preservation, versioned arrangements, graph identities, legacy conversion,
  buffer overlays, diagram projection, and editor path/template/metadata helpers.
- Core build, extension and webview TypeScript checks passed.
- Milestone 1 was independently built and checked at its own commit: core build,
  vendored Sprotty build, extension type check and 8 MCP/setup tests passed.
- The packaged ESM MCP server initialized over stdio, discovering 15 tools,
  4 resources and 2 prompts, and serving the guide. Its stderr was empty.
- Packaged extension-host tests passed on VS Code 1.95.3 and 1.141.0:
  activation, 14 registered chat tools, validation, unsaved-buffer AST, format
  previews, version-1 view creation/custom-editor opening, stable runtime staging,
  preservation of unrelated project settings, and repeatable agent setup.
- Chrome exercised the built SVG bundle: escaped labels, dragging as one update,
  pinned partial layout, hiding/restoring, source and editor selection messages,
  pan/zoom persistence, initial-layout viewport persistence, stale-drawing display,
  SVG export and numeric PNG request/response rasterization.
- VSIX inventory includes the standalone MCP bundle, SVG editor bundle, stylesheet,
  embedded ELK, JSON schema and MIT/ELK attribution. No source maps are shipped.

The browser fixture exercises the webview protocol independently; extension-host
checks exercise VS Code tool registration and custom editor creation. These are not
an end-to-end Copilot conversation or a real Codex/Claude session. Live dependent
buffer behavior and arrangement conversion also have focused unit tests. Full
manual editing sequences for undo/redo and file lifecycle remain useful release
qualification; no marketplace publication was performed.

## Reproduction

```sh
npm run build --workspace=tonto-cli
npm run build --workspace=sprotty-vscode
npx tsc --noEmit -p packages/extension/tsconfig.json
npx tsc --noEmit -p packages/webview/tsconfig.json
npx vitest run packages/tonto/test/mcp packages/tonto/test/view \
  packages/tonto/test/tontodiagram.projection.test.ts \
  packages/tonto/test/tontodiagram.parser.test.ts packages/extension/test/editor
npm run build --workspace=tonto -- --minify
```

Package from `packages/extension` using `npx @vscode/vsce package --no-dependencies`.
Run `test/host/integration.cjs` with VS Code's `--extensionTestsPath` and the extracted
VSIX as `--extensionDevelopmentPath`, using an isolated profile and a temporary
workspace with a valid `model.tonto`. `TONTO_TEST_REPORT` selects the JSON report.

The browser fixture is `packages/extension/test/host/svg-browser.cjs`. It requires
Playwright and installed Chrome; `TONTO_PLAYWRIGHT_MODULE` can select a preinstalled
Playwright module, and `TONTO_TEST_ARTIFACTS` selects the screenshot directory.

## Preview use

Run **Open SVG Diagram** from a `.tonto` model. New views use `.tontoview`
JSON. Previous Sprotty and PlantUML previews are disabled; `.tontodiagram` files
open as text and retain **Convert to Tonto View**. Run **Tonto: Set Up Agents** explicitly for local Codex/Claude project
configuration. Remote setup reports that it is unsupported. The SVG JSON editor is enabled directly, regardless of the obsolete diagram toggle.


## Recovered interface replacement

The follow-up replaces the retained React editor shell entirely with the recovered
`src/webview/main.ts` and `diagram-panel.ts` HTML from Tonto Visualizer 0.1.53.
The stylesheet matches the shipped `media/canvas.css` byte for byte. The old React
sidebar, settings panels, canvas shell and stylesheet are deleted. The compiled
webview uses the recovered native message protocol and no longer imports React.
Host adapters persist native option, drag, route, hide/show, pin, constraint and
layout actions to `.tontoview` through WorkspaceEdit. Parsing and linking remain
in the current repository's services.

The replacement passed extension/webview type checks and build, 12 focused filter
and arrangement tests, browser checks of the actual recovered toolbar/options,
escaped labels, dragging, selection, fit/viewport persistence and PNG rendering,
and packaged extension-host checks on VS Code 1.141.0 and 1.95.3.

Run the new fixture with `PLAYWRIGHT_MODULE` selecting a Playwright installation:
`node packages/webview/test/recovered-browser.cjs`. The old extension browser
fixture delegates to this replacement. The installed extension requires a window
reload after force-installing the new VSIX.
