import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cliVersion, createCli } from "../../../src/cli/main.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(currentDirectory, "../../fixtures/comprehensive-project");
const temporaryDirectories: string[] = [];

afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
    for (const temporaryDirectory of temporaryDirectories.splice(0)) {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
});

describe("CLI integration", () => {
    it("registers the complete public command surface", () => {
        const commandNames = createCli().commands.map((command) => command.name());

        expect(commandNames).toEqual([
            "generate",
            "generateSingle",
            "import",
            "importSingle",
            "validate",
            "transform",
            "transformToAlloy",
            "plantuml",
            "init",
            "add-skill",
        ]);

        const packageJson = JSON.parse(
            fs.readFileSync(path.resolve(currentDirectory, "../../../package.json"), "utf8")
        ) as { version: string };
        expect(cliVersion).toBe(packageJson.version);
    });

    it("generates comprehensive project JSON through Commander and honors --destination", async () => {
        const projectDirectory = copyFixture();
        const destination = createTemporaryDirectory("tonto-cli-generate-output-");

        await runCli("generate", projectDirectory, "--destination", destination);

        const generatedFile = path.join(destination, "comprehensive-grammar.json");
        expect(fs.existsSync(generatedFile)).toBe(true);
        const generatedProject = JSON.parse(fs.readFileSync(generatedFile, "utf8")) as {
            model: { contents: Array<{ contents?: Array<{ type: string }> }> };
        };
        const generatedElements = generatedProject.model.contents.flatMap((element) => element.contents ?? []);
        expect(generatedElements.some((element) => element.type === "Class")).toBe(true);
        expect(generatedElements.some((element) => element.type === "Relation")).toBe(true);
        expect(generatedElements.some((element) => element.type === "GeneralizationSet")).toBe(true);
    });

    it("generates JSON from one Tonto source through generateSingle", async () => {
        const projectDirectory = copyFixture();
        const destination = createTemporaryDirectory("tonto-cli-generate-single-output-");
        const sourceFile = path.join(projectDirectory, "src", "shared.tonto");

        await runCli("generateSingle", sourceFile, "--destination", destination);

        expect(fs.existsSync(path.join(destination, "shared.json"))).toBe(true);
    });

    it("imports generated JSON as modular and single-file Tonto output", async () => {
        const projectDirectory = copyFixture();
        const jsonDestination = createTemporaryDirectory("tonto-cli-import-source-");
        const modularDestination = createTemporaryDirectory("tonto-cli-import-modular-");
        const singleDestination = createTemporaryDirectory("tonto-cli-import-single-");
        const sourceFile = path.join(projectDirectory, "src", "shared.tonto");

        await runCli("generateSingle", sourceFile, "--destination", jsonDestination);
        const generatedJson = path.join(jsonDestination, "shared.json");
        await runCli("import", generatedJson, "--destination", modularDestination);
        await runCli("importSingle", generatedJson, "--destination", singleDestination);

        expect(findFiles(modularDestination, ".tonto").length).toBeGreaterThan(0);
        const singleFile = path.join(singleDestination, "shared.tonto");
        expect(fs.existsSync(singleFile)).toBe(true);
        expect(fs.readFileSync(singleFile, "utf8")).toContain("package SharedFoundation");
    });

    it("validates the comprehensive project and distinguishes warnings from errors", async () => {
        const projectDirectory = copyFixture();
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

        await runCli("validate", projectDirectory);

        const output = log.mock.calls.flat().join("\n");
        expect(output).toContain("No local errors found.");
        expect(output).toContain("Total of local warnings: 1");
    });

    it("generates PlantUML with CLI layout and destination options", async () => {
        const projectDirectory = copyFixture();
        const destination = createTemporaryDirectory("tonto-cli-plantuml-output-");

        await runCli("plantuml", projectDirectory, "--destination", destination, "--layout", "elk");

        const generatedFile = path.join(destination, "comprehensive-grammar.puml");
        expect(fs.existsSync(generatedFile)).toBe(true);
        const plantUML = fs.readFileSync(generatedFile, "utf8");
        expect(plantUML).toContain("!pragma layout elk");
        expect(plantUML).toContain("<<kind>>");
    });

    it("installs the ontology skill through the non-interactive CLI option", async () => {
        const projectDirectory = copyFixture();

        await runCli("add-skill", projectDirectory, "--target", "codex");

        expect(fs.existsSync(path.join(projectDirectory, ".codex", "skills", "tonto-ontology", "SKILL.md"))).toBe(true);
    });

    it("initializes a project non-interactively with the selected template and guidance target", async () => {
        const destinationParent = createTemporaryDirectory("tonto-cli-init-parent-");
        const destination = path.join(destinationParent, "initialized-project");

        await runCli(
            "init",
            "--destination",
            destination,
            "--template",
            "blank",
            "--guidance",
            "codex"
        );

        expect(fs.existsSync(path.join(destination, "tonto.json"))).toBe(true);
        expect(fs.existsSync(path.join(destination, "src", "main.tonto"))).toBe(true);
        expect(fs.existsSync(path.join(destination, ".codex", "tonto-guidance.md"))).toBe(true);
        expect(fs.existsSync(path.join(destination, ".claude"))).toBe(false);
    });

    it("returns failure status for missing projects and unsupported PlantUML layouts", async () => {
        const missingProject = path.join(os.tmpdir(), `missing-tonto-project-${Date.now()}`);
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

        await runCli("generate", missingProject);

        expect(process.exitCode).toBe(1);
        expect(log.mock.calls.flat().join("\n")).toContain("no Tonto source files were found");

        process.exitCode = 0;
        const projectDirectory = copyFixture();
        await runCli("plantuml", projectDirectory, "--layout", "diagonal");

        expect(process.exitCode).toBe(1);
        expect(log.mock.calls.flat().join("\n")).toContain("Unsupported PlantUML layout");
    });

    it("returns failure status when validation targets a missing project", async () => {
        const missingProject = path.join(os.tmpdir(), `missing-tonto-validation-${Date.now()}`);
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

        await runCli("validate", missingProject);

        expect(process.exitCode).toBe(1);
        expect(log.mock.calls.flat().join("\n")).toContain("Project directory does not exist");
    });
});

async function runCli(...arguments_: string[]): Promise<void> {
    await createCli().parseAsync(arguments_, { from: "user" });
}

function copyFixture(): string {
    const destination = createTemporaryDirectory("tonto-cli-project-");
    fs.cpSync(fixtureDirectory, destination, { recursive: true });
    return destination;
}

function createTemporaryDirectory(prefix: string): string {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    temporaryDirectories.push(temporaryDirectory);
    return temporaryDirectory;
}

function findFiles(directory: string, extension: string): string[] {
    const matchingFiles: string[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            matchingFiles.push(...findFiles(entryPath, extension));
        } else if (entryPath.endsWith(extension)) {
            matchingFiles.push(entryPath);
        }
    }
    return matchingFiles;
}
