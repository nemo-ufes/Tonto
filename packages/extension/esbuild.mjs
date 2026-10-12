import { copyFile, mkdir } from "node:fs/promises";
//@ts-check
import * as esbuild from "esbuild";

const options = {
    watch: process.argv.includes("--watch"),
    minify: process.argv.includes("--minify"),
};

const successMessage = options.watch
    ? "Watch build succeeded"
    : "Build succeeded";

/** @type {import('esbuild').Plugin[]} */
const plugins = [
    {
        name: "watch-plugin",
        setup(build) {
            build.onEnd((result) => {
                if (result.errors.length === 0) {
                    console.log(getTime() + successMessage);
                }
            });
        },
    },
];

await mkdir("syntaxes", { recursive: true });
await copyFile("../tonto/syntaxes/tonto.tmLanguage.json", "syntaxes/tonto.tmLanguage.json");
await copyFile("data/tontodiagram.tmLanguage.json", "syntaxes/tontodiagram.tmLanguage.json");
await mkdir("pack/licenses", { recursive: true });
await copyFile("../tonto/src/view/THIRD-PARTY-NOTICES.md", "pack/licenses/Tonto-Visualizer-MIT.md");
await copyFile("../../node_modules/elkjs/LICENSE.md", "pack/licenses/ELK.md");

const nodeContext = await esbuild.context({
    entryPoints: [
        "src/extension/main.ts",
        "src/language/main.ts"
    ],
    outdir: "pack",
    bundle: true,
    target: "es6",
    format: "cjs",
    loader: { ".ts": "ts" },
    outExtension: {
        ".js": ".cjs",
    },
    external: ["vscode"],
    platform: "node",
    sourcemap: !options.minify,
    minify: options.minify,
    plugins,
});

const mcpContext = await esbuild.context({
    entryPoints: ["../tonto/src/mcp/main.ts"],
    outfile: "pack/mcp.mjs",
    bundle: true, platform: "node", format: "esm", target: "node20",
    sourcemap: !options.minify, minify: options.minify,
    banner: { js: 'import { createRequire as createTontoRequire } from "node:module"; const require = createTontoRequire(import.meta.url);' },
});

if (options.watch) {
    await nodeContext.watch();
    await mcpContext.watch();
} else {
    await nodeContext.rebuild();
    await mcpContext.rebuild();
    await nodeContext.dispose();
    await mcpContext.dispose();
}

function getTime() {
    const date = new Date();
    return `[${`${padZeroes(date.getHours())}:${padZeroes(
        date.getMinutes()
    )}:${padZeroes(date.getSeconds())}`}] `;
}

/**
 * @param {number} i
 */
function padZeroes(i) {
    return i.toString().padStart(2, "0");
}
