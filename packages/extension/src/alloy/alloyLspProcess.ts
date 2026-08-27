import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export interface AlloyServerLocation {
    command: string
    args: string[]
    /** Human-readable origin, for error messages and the output channel. */
    description: string
}

export class AlloyServerNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AlloyServerNotFoundError";
    }
}

/**
 * Where the Alloy server lives.
 *
 * Resolution order, most specific first:
 *
 * 1. the `tonto.alloy.serverPath` setting — a `.jar`, or a launcher script such as the one
 *    `./gradlew installDist` produces. This is how the server is used during development,
 *    pointing at a local build of ontouml-alloy-lsp.
 * 2. a copy bundled with the extension under `resources/alloy-lsp/`.
 *
 * The server is not bundled yet: which Alloy it embeds is still open, and Alloy 5 is not
 * published to Maven Central, so shipping it means committing a binary. Until that is
 * settled the setting is the supported path, and the error below says so.
 */
export function resolveServerLocation(context: vscode.ExtensionContext): AlloyServerLocation {
    const configured = vscode.workspace.getConfiguration("tonto").get<string>("alloy.serverPath")?.trim();
    if (configured) {
        if (!fs.existsSync(configured)) {
            throw new AlloyServerNotFoundError(
                `tonto.alloy.serverPath points at "${configured}", which does not exist.`
            );
        }
        return toLocation(configured, "tonto.alloy.serverPath");
    }

    const bundled = context.asAbsolutePath(path.join("resources", "alloy-lsp", "ontouml-alloy-lsp.jar"));
    if (fs.existsSync(bundled)) {
        return toLocation(bundled, "bundled with the extension");
    }

    throw new AlloyServerNotFoundError(
        "The Alloy server was not found. Build ontouml-alloy-lsp and set tonto.alloy.serverPath "
        + "to its launcher, for example "
        + "<repo>/build/install/ontouml-alloy-lsp/bin/ontouml-alloy-lsp."
    );
}

function toLocation(serverPath: string, description: string): AlloyServerLocation {
    if (serverPath.endsWith(".jar")) {
        return { command: resolveJava(), args: ["-jar", serverPath], description };
    }
    return { command: serverPath, args: [], description };
}

/**
 * The Java to run the server with: the `tonto.alloy.javaPath` setting, then JAVA_HOME, then
 * whatever `java` is on the PATH.
 */
export function resolveJava(): string {
    const configured = vscode.workspace.getConfiguration("tonto").get<string>("alloy.javaPath")?.trim();
    if (configured) {
        return configured;
    }

    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
        const candidate = path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return "java";
}

export function spawnServer(location: AlloyServerLocation): ChildProcessWithoutNullStreams {
    return spawn(location.command, location.args, { stdio: "pipe" });
}
