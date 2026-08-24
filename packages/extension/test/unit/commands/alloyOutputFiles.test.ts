import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAlloyOutputDirectory, resolveAlloyOutputFiles } from "../../../src/commands/alloyOutputFiles.js";

const bundle = {
    mainModule: "module main\n\nopen world_structure[World]\nopen ontological_properties[World]\n",
    worldStructureModule: "module world_structure[World]\n",
    ontologicalPropertiesModule: "module ontological_properties[World]\n",
};

describe("resolveAlloyOutputFiles", () => {
    it("writes every module of the bundle", () => {
        const files = resolveAlloyOutputFiles(bundle, "/projects/university", "generated-files");

        expect(files.map((file) => path.basename(file.filePath))).toEqual([
            "world_structure.als",
            "ontological_properties.als",
            "main.als",
        ]);
    });

    // main.als does `open world_structure[World]`, and Alloy resolves `open foo` to foo.als
    // beside the importing file. Spreading them across directories, or renaming one, breaks
    // loading in the Analyzer with no error from Tonto.
    it("puts the modules together in an alloy directory under outFolder", () => {
        const files = resolveAlloyOutputFiles(bundle, "/projects/university", "generated-files");

        const directories = new Set(files.map((file) => path.dirname(file.filePath)));
        expect([...directories]).toEqual([path.join("/projects/university", "generated-files", "alloy")]);
    });

    it("names each file after the module declared in its content", () => {
        const files = resolveAlloyOutputFiles(bundle, "/projects/university", "out");

        for (const file of files) {
            const moduleName = path.basename(file.filePath, ".als");
            expect(file.content).toMatch(new RegExp(`^module ${moduleName}\\b`, "m"));
        }
    });

    it("marks main as the entry point and nothing else", () => {
        const files = resolveAlloyOutputFiles(bundle, "/projects/university", "out");

        const entryPoints = files.filter((file) => file.isEntryPoint);
        expect(entryPoints).toHaveLength(1);
        expect(path.basename(entryPoints[0].filePath)).toBe("main.als");
    });

    it("keeps each module's content untouched", () => {
        const files = resolveAlloyOutputFiles(bundle, "/projects/university", "out");
        const contentByName = Object.fromEntries(
            files.map((file) => [path.basename(file.filePath, ".als"), file.content])
        );

        expect(contentByName["main"]).toBe(bundle.mainModule);
        expect(contentByName["world_structure"]).toBe(bundle.worldStructureModule);
        expect(contentByName["ontological_properties"]).toBe(bundle.ontologicalPropertiesModule);
    });

    it("resolves relative project paths so the CLI and the extension agree", () => {
        const files = resolveAlloyOutputFiles(bundle, "some/relative/project", "out");

        for (const file of files) {
            expect(path.isAbsolute(file.filePath)).toBe(true);
        }
    });

    it("honours a custom outFolder from the manifest", () => {
        const files = resolveAlloyOutputFiles(bundle, "/projects/university", "build/artifacts");

        expect(files[0].filePath).toBe(
            path.join("/projects/university", "build/artifacts", "alloy", "world_structure.als")
        );
    });
});

describe("getAlloyOutputDirectory", () => {
    it("matches the directory the resolved files land in", () => {
        const directory = getAlloyOutputDirectory("/projects/university", "generated-files");
        const files = resolveAlloyOutputFiles(bundle, "/projects/university", "generated-files");

        expect(files.every((file) => path.dirname(file.filePath) === directory)).toBe(true);
    });
});
