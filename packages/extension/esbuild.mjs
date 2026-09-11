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

/**
 * Webview scripts are built separately from the extension host: they run in a browser, not
 * in node, and they bundle their own dependencies because a webview cannot reach into
 * node_modules — everything it loads has to be a file the extension hands it a URI for.
 */
const webviewContext = await esbuild.context({
    entryPoints: ["src/webview/alloyGraph.ts"],
    outdir: "pack/webview",
    bundle: true,
    target: "es2020",
    format: "iife",
    platform: "browser",
    sourcemap: !options.minify,
    minify: options.minify,
    plugins,
});

if (options.watch) {
    await Promise.all([nodeContext.watch(), webviewContext.watch()]);
} else {
    await Promise.all([nodeContext.rebuild(), webviewContext.rebuild()]);
    nodeContext.dispose();
    webviewContext.dispose();
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
