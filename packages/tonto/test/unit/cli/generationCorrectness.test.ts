import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NodeFileSystem } from "langium/node";
import { ClassStereotype, RelationStereotype } from "ontouml-js";
import { afterEach, describe, expect, it } from "vitest";
import { generateCommand, generateModularCommand } from "../../../src/cli/actions/commands/generateCommand.js";
import { generatePlantUMLCommand } from "../../../src/cli/actions/commands/generatePlantUMLCommand.js";
import { createDefaultTontoManifest, type TontoManifest } from "../../../src/cli/model/grammar/TontoManifest.js";
import { buildFolderDocuments } from "../../../src/cli/utils/buildFolderDocuments.js";
import { parseProjectModular } from "../../../src/cli/utils/parseProjectModular.js";
import { createTontoServices } from "../../../src/language/tonto-module.js";

const tempDirs: string[] = [];

function createTempProject(manifestOverrides: Partial<TontoManifest> = {}): { manifest: TontoManifest; tempDir: string } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonto-generation-correctness-"));
    tempDirs.push(tempDir);

    const manifest: TontoManifest = {
        ...createDefaultTontoManifest(),
        projectName: "test-project",
        displayName: "Test Project",
        publisher: "test-publisher",
        authors: [],
        ...manifestOverrides,
    };

    fs.writeFileSync(path.join(tempDir, "tonto.json"), JSON.stringify(manifest, null, 2));

    return {
        manifest,
        tempDir,
    };
}

function writeProjectFile(filePath: string, contents: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
}

async function buildModularProject(tempDir: string, manifest: TontoManifest) {
    const services = createTontoServices({ ...NodeFileSystem }).Tonto;
    const { folderAbsolutePath, models } = await buildFolderDocuments(tempDir, services, { manifest });

    return parseProjectModular({
        models,
        fileNode: null as never,
        manifest,
        folderAbsolutePath,
    });
}

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

describe("generation correctness", () => {
    it("should resolve qualified imports against the correct generated classes", async () => {
        const { manifest, tempDir } = createTempProject({ projectName: "qualified-imports" });

        writeProjectFile(path.join(tempDir, "Alpha.tonto"), "package Alpha\nkind Person\n");
        writeProjectFile(path.join(tempDir, "Beta.tonto"), "package Beta\nkind Person\n");
        writeProjectFile(
            path.join(tempDir, "Main.tonto"),
            "import Alpha\nimport Beta\npackage Main\n@material relation Alpha.Person [1] -- alphaToBeta -- [1] Beta.Person\n"
        );

        const project = await buildModularProject(tempDir, manifest);
        const relation = project.getAllRelations().find((item) => item.getName() === "alphaToBeta");

        expect(relation?.getSourceEnd().propertyType?.container?.getNameOrId()).toBe("Alpha");
        expect(relation?.getTargetEnd().propertyType?.container?.getNameOrId()).toBe("Beta");
    });

    it("should generate instantiation relations and preserve requested stereotypes", async () => {
        const { manifest, tempDir } = createTempProject({ projectName: "stereotypes-and-instantiation" });

        writeProjectFile(
            path.join(tempDir, "main.tonto"),
            "package Main\ntype Species\nkind Dog (instanceOf Species)\nhistoricalRoleMixin FormerEmployee\nprocess Manufacturing\n"
        );

        const project = await buildModularProject(tempDir, manifest);
        const dogInstantiation = project.getAllRelations().find(
            (relation) =>
                relation.stereotype === RelationStereotype.INSTANTIATION
                && relation.getSourceEnd().propertyType?.getNameOrId() === "Species"
                && relation.getTargetEnd().propertyType?.getNameOrId() === "Dog"
        );
        const formerEmployee = project.getAllClasses().find((item) => item.getNameOrId() === "FormerEmployee");
        const manufacturing = project.getAllClasses().find((item) => item.getNameOrId() === "Manufacturing");

        expect(dogInstantiation).toBeDefined();
        expect(formerEmployee?.stereotype).toBe(ClassStereotype.HISTORICAL_ROLE_MIXIN);
        expect(manufacturing?.stereotype).toBe(ClassStereotype.EVENT);
    });

    it("should write the generated JSON file for single-file generation", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonto-single-generate-"));
        tempDirs.push(tempDir);

        const sourceFile = path.join(tempDir, "main.tonto");
        const destination = path.join(tempDir, "generated");
        writeProjectFile(sourceFile, "package Main\nkind Person\n");

        const generatedFilePath = await generateCommand(sourceFile, destination);

        expect(generatedFilePath).toBe(path.join(destination, "main.json"));
        expect(fs.existsSync(generatedFilePath ?? "")).toBe(true);
    });

    it("should generate modular JSON into nested out folders", async () => {
        const { tempDir } = createTempProject({
            projectName: "nested-output",
            outFolder: "nested/out",
        });

        writeProjectFile(path.join(tempDir, "main.tonto"), "package Main\nkind Person\n");

        const generatedFilePath = await generateModularCommand(tempDir);

        expect(generatedFilePath).toBe(path.join(tempDir, "nested/out/nested-output.json"));
        expect(fs.existsSync(generatedFilePath ?? "")).toBe(true);
    });

    it("should generate one PlantUML file for the whole ontology", async () => {
        const { tempDir } = createTempProject({
            projectName: "full-ontology",
            outFolder: "diagrams",
        });

        writeProjectFile(path.join(tempDir, "Alpha.tonto"), "package Alpha\nkind Person\n");
        writeProjectFile(
            path.join(tempDir, "Beta.tonto"),
            "import Alpha\npackage Beta\nkind Course\n@material relation Alpha.Person [1] -- enrolledIn -- [*] Course\n"
        );

        const generatedFilePaths = await generatePlantUMLCommand(tempDir);

        expect(generatedFilePaths).toEqual([path.join(tempDir, "diagrams/full-ontology.puml")]);
        const contents = fs.readFileSync(generatedFilePaths[0], "utf-8");
        expect(contents).toContain(`class "Alpha::Person" <<kind>> #FF99A3`);
        expect(contents).toContain(`class "Beta::Course" <<kind>> #FF99A3`);
        expect(contents).toContain(`"Alpha::Person" "1" -- "*" "Beta::Course" : <back:WhiteSmoke>enrolledIn</back> >`);
        expect(contents.match(/class "Alpha::Person"/g)).toHaveLength(1);
    });

    it("should generate separate PlantUML files per package", async () => {
        const { tempDir } = createTempProject({ projectName: "split-ontology" });
        const destination = path.join(tempDir, "custom-diagrams");

        writeProjectFile(path.join(tempDir, "Alpha.tonto"), "package Alpha\nkind Person\n");
        writeProjectFile(
            path.join(tempDir, "Beta.tonto"),
            "import Alpha\npackage Beta\nkind Course\n@material relation Alpha.Person [1] -- enrolledIn -- [*] Course\n"
        );

        const generatedFilePaths = await generatePlantUMLCommand(tempDir, {
            destination,
            perPackage: true,
        });

        expect([...generatedFilePaths].sort()).toEqual([
            path.join(destination, "Alpha.puml"),
            path.join(destination, "Beta.puml"),
        ].sort());

        const alphaContents = fs.readFileSync(path.join(destination, "Alpha.puml"), "utf-8");
        const betaContents = fs.readFileSync(path.join(destination, "Beta.puml"), "utf-8");

        expect(alphaContents).toContain(`class "Person" <<kind>> #FF99A3`);
        expect(alphaContents).toContain(`class "Beta::Course" <<kind>> #FF99A3`);
        expect(alphaContents).toContain(`"Person" "1" ---- "*" "Beta::Course" : <back:WhiteSmoke>enrolledIn</back> >`);
        expect(betaContents).toContain(`class "Course" <<kind>> #FF99A3`);
        expect(betaContents).toContain(`"Alpha::Person" "1" ---- "*" "Course" : <back:WhiteSmoke>enrolledIn</back> >`);
    });
});
