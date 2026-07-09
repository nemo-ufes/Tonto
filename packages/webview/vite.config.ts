import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react({ jsxRuntime: "classic" })],
    build: {
        emptyOutDir: true,
        outDir: "../extension/pack/webview",
        sourcemap: true,
        cssCodeSplit: false,
        // The workspace symlink to sprotty-vscode-webview resolves outside of
        // node_modules, so its CommonJS lib must be included explicitly —
        // otherwise raw `require()` calls end up in the browser bundle.
        commonjsOptions: {
            include: [/node_modules/, /sprotty-vscode-webview[\\/]lib/],
        },
        rollupOptions: {
            input: {
                sprotty: resolve(__dirname, "src/main.ts"),
                "diagram-editor": resolve(__dirname, "src/diagram-editor/main.tsx"),
            },
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name?.endsWith(".css")) {
                        return "style.css";
                    }
                    return "assets/[name]-[hash][extname]";
                },
            },
        },
    },
});
