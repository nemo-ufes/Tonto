import * as path from "node:path";
import { AlloyModelBundle, getAlloyModules } from "tonto-cli";

export interface AlloyOutputFile {
    /** Absolute path the module should be written to. */
    filePath: string
    content: string
    /** The module a modeller opens in the Analyzer; the others exist to be imported by it. */
    isEntryPoint: boolean
}

/**
 * Decides where each Alloy module goes.
 *
 * Kept free of `vscode` so it can be tested outside the extension host — the command file
 * around it is then only wiring: progress, notifications and writing bytes to disk.
 */
export function resolveAlloyOutputFiles(
    bundle: AlloyModelBundle,
    projectPath: string,
    outFolder: string
): AlloyOutputFile[] {
    // The modules reference each other with `open`, and Alloy resolves `open foo` to foo.als
    // beside the importing file, so they need a directory of their own rather than sitting
    // loose among the other generated artefacts.
    const outputDirectory = path.join(path.resolve(projectPath), outFolder, "alloy");

    return getAlloyModules(bundle).map(({ name, content }) => ({
        filePath: path.join(outputDirectory, `${name}.als`),
        content,
        isEntryPoint: name === "main",
    }));
}

export function getAlloyOutputDirectory(projectPath: string, outFolder: string): string {
    return path.join(path.resolve(projectPath), outFolder, "alloy");
}
