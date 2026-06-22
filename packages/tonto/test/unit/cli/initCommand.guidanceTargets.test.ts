import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildGuidanceProjectFiles,
    buildInitManifest,
    buildInitProjectFiles,
    shouldIncludeTemplatePathForGuidanceTarget,
} from "../../../src/cli/actions/commands/initCommand.js";

describe("guidance scaffolding", () => {
    it("keeps description and author optional in init manifests", () => {
        const manifest = buildInitManifest({
            projectName: "demo-project",
            description: "",
            authorName: "   ",
        });

        expect(manifest.description).toBeUndefined();
        expect(manifest.authors).toEqual([]);
    });

    it("includes provided description and author when init answers contain them", () => {
        const manifest = buildInitManifest({
            projectName: "demo-project",
            description: "Demo ontology",
            authorName: "Jane Doe",
            authorEmail: "jane@example.com",
        });

        expect(manifest.description).toBe("Demo ontology");
        expect(manifest.authors).toEqual([{ name: "Jane Doe", email: "jane@example.com" }]);
    });

    it("includes folder-based guidance files for Codex, Claude Code, and Google tools", () => {
        const guidancePaths = buildGuidanceProjectFiles("demo-project").map((file) => file.relativePath);

        expect(guidancePaths).toContain(path.join("demo-project", ".codex"));
        expect(guidancePaths).toContain(path.join("demo-project", ".codex", "tonto-guidance.md"));
        expect(guidancePaths).toContain(path.join("demo-project", ".claude"));
        expect(guidancePaths).toContain(path.join("demo-project", ".claude", "tonto-guidance.md"));
        expect(guidancePaths).toContain(path.join("demo-project", ".agents"));
        expect(guidancePaths).toContain(path.join("demo-project", ".agents", "tonto-guidance.md"));
    });

    it("includes the VS Code copilot instructions file in the guidance scaffold", () => {
        const guidancePaths = buildGuidanceProjectFiles("demo-project").map((file) => file.relativePath);

        expect(guidancePaths).toContain(path.join("demo-project", ".github", "copilot-instructions.md"));
    });

    it("adds the new guidance files to the full init scaffold", () => {
        const scaffoldPaths = buildInitProjectFiles("demo-project", { catDogExample: false }).map(
            (file) => file.relativePath
        );

        expect(scaffoldPaths).toContain(path.join("demo-project", ".codex", "tonto-guidance.md"));
        expect(scaffoldPaths).toContain(path.join("demo-project", ".claude", "tonto-guidance.md"));
        expect(scaffoldPaths).toContain(path.join("demo-project", ".agents", "tonto-guidance.md"));
    });
});

describe("shouldIncludeTemplatePathForGuidanceTarget", () => {
    const withinProject = (relativePath: string): string => path.join("demo-project", relativePath);

    it("filters prefixed scaffold paths for Cursor and VS Code correctly", () => {
        expect(
            shouldIncludeTemplatePathForGuidanceTarget(
                "cursor",
                withinProject(path.join(".cursor", "rules", "tonto-guidance.mdc"))
            )
        ).toBe(true);
        expect(
            shouldIncludeTemplatePathForGuidanceTarget(
                "cursor",
                withinProject(path.join(".github", "instructions", "tonto-guidance.instructions.md"))
            )
        ).toBe(false);
        expect(
            shouldIncludeTemplatePathForGuidanceTarget(
                "vscode",
                withinProject(path.join(".github", "instructions", "tonto-guidance.instructions.md"))
            )
        ).toBe(true);
    });

    it("filters folder-based guidance targets correctly", () => {
        expect(
            shouldIncludeTemplatePathForGuidanceTarget(
                "codex",
                withinProject(path.join(".codex", "tonto-guidance.md"))
            )
        ).toBe(true);
        expect(
            shouldIncludeTemplatePathForGuidanceTarget(
                "codex",
                withinProject(path.join(".claude", "tonto-guidance.md"))
            )
        ).toBe(false);
        expect(
            shouldIncludeTemplatePathForGuidanceTarget(
                "claude",
                withinProject(path.join(".claude", "tonto-guidance.md"))
            )
        ).toBe(true);
        expect(
            shouldIncludeTemplatePathForGuidanceTarget(
                "google",
                withinProject(path.join(".agents", "tonto-guidance.md"))
            )
        ).toBe(true);
    });

    it("keeps non-guidance project files for every target", () => {
        expect(shouldIncludeTemplatePathForGuidanceTarget("codex", withinProject("README.md"))).toBe(true);
        expect(shouldIncludeTemplatePathForGuidanceTarget("google", withinProject("src/main.tonto"))).toBe(true);
    });
});
