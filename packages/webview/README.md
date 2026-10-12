# Tonto SVG visualizer webview

The active entry is `src/recovered/main.ts`: the vanilla TypeScript interface recovered from **Tonto Visualizer 0.1.53**, with its shipped `canvas.css`. Vite builds it into the extension's `pack/webview/diagram-editor.js` and `style.css`. The previous React editor shell and SVG React component are removed.

The interface receives a serializable `ViewModel` and arrangement from Tonto's current parser through the extension. It retains the inspected visualizer's toolbar, settings, class and association filters, legend, pointer gestures, resize and route handles, selection and PNG rasterisation. Browser-safe rendering lives in `tonto-cli/lib/view/canvas`; the browser never imports Langium or filesystem code. Layout and document changes belong to the extension and use VS Code document undo.

The native protocol uses `model`, `select`, `theme` and `rasterise` inbound messages and operation messages (`moved`, `rerouted`, `content`, `display`, `layout`, constraints, export and navigation) outbound. `viewport` adds debounced persistence of the native browser viewport in `.tontoview` JSON. This adapter adds no ontology semantics.

```bash
npm run build --workspace=tonto-sprotty-webview
npx tsc -p packages/webview --noEmit
PLAYWRIGHT_MODULE=/path/to/playwright node packages/webview/test/recovered-browser.cjs
```

`test/recovered-panel.html` is the matching inspected HTML structure; the extension supplies nonce-based script loading and resource policy. MIT attribution for recovered code is preserved in `packages/tonto/src/view/THIRD-PARTY-NOTICES.md`. Dormant Sprotty source is retained for repository history and is not included in the active build.
