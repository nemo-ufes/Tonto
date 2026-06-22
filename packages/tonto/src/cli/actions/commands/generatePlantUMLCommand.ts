import { LangiumDocuments } from "langium";
import { NodeFileSystem } from "langium/node";
import * as fs from "node:fs";
import * as path from "node:path";
import { Model, isModel } from "../../../language/generated/ast.js";
import { getModelContextModules } from "../../../language/utils/modelStatements.js";
import { generatePlantUML, PlantUMLLayoutVariant } from "../../generators/plantuml.generator.js";
import { TontoManifest } from "../../model/grammar/TontoManifest.js";
import {
    JSON_GENERATION_STEPS,
    createJsonGenerationError,
    getJsonGenerationDocumentErrorInfos,
    normalizeJsonGenerationError,
} from "../../requests/jsonGeneration.js";
import { buildFolderDocuments } from "../../utils/buildFolderDocuments.js";
import { readOrCreateDefaultTontoManifest } from "../../utils/readManifest.js";
import { createTontoServices, TontoServices } from "../../../language/tonto-module.js";

const plantUMLLayoutVariants: PlantUMLLayoutVariant[] = [
    "default",
    "top-to-bottom",
    "left-to-right",
    "polyline",
    "orthogonal",
    "smetana",
    "elk",
];

export interface GeneratePlantUMLCommandOptions {
    destination?: string;
    perPackage?: boolean;
    showExternalReferences?: boolean;
    layout?: string;
}

export async function generatePlantUMLCommand(
    dir: string,
    options: GeneratePlantUMLCommandOptions = {}
): Promise<string[]> {
    const services = createTontoServices({ ...NodeFileSystem }).Tonto;
    const manifest = readManifest(dir);
    const { allFiles, documents, folderAbsolutePath } = await loadProject(dir, manifest, services);

    if (allFiles.length === 0) {
        throw createJsonGenerationError(`Could not generate PlantUML because no Tonto source files were found in "${dir}".`, {
            step: JSON_GENERATION_STEPS.sourceLoading,
            info: [{
                severity: "error",
                code: "no_tonto_source_files",
                title: "No Tonto source files found",
                description: `The selected folder does not contain any ".tonto" files outside the configured output directory.`,
                filePath: dir,
            }],
        });
    }

    const diagnosticInfos = getJsonGenerationDocumentErrorInfos(documents);
    if (diagnosticInfos.length > 0) {
        throw createJsonGenerationError("Could not generate PlantUML because the Tonto sources contain syntax or validation errors.", {
            step: JSON_GENERATION_STEPS.documentValidation,
            info: diagnosticInfos,
        });
    }

    const contextModules = getSourceModels(allFiles, documents).flatMap(getModelContextModules);
    if (contextModules.length === 0) {
        throw createJsonGenerationError(`Could not generate PlantUML because no package declarations were found in "${dir}".`, {
            step: JSON_GENERATION_STEPS.sourceLoading,
            info: [{
                severity: "error",
                code: "no_tonto_package_declarations",
                title: "No package declarations found",
                description: `The selected folder does not contain Tonto package declarations.`,
                filePath: dir,
            }],
        });
    }

    const layout = getPlantUMLLayoutVariant(options.layout);
    const outputDirectory = path.resolve(options.destination ?? path.join(folderAbsolutePath, manifest.outFolder));
    const plantUMLOptions = {
        showExternalReferences: options.showExternalReferences ?? true,
        layout,
    };

    if (options.perPackage) {
        return contextModules.map((contextModule) => writePlantUMLFile(
            outputDirectory,
            getPlantUMLFileName(contextModule.name),
            generatePlantUML(contextModule, {
                ...plantUMLOptions,
                externalReferenceModules: contextModules,
            })
        ));
    }

    return [
        writePlantUMLFile(
            outputDirectory,
            getPlantUMLFileName(manifest.projectName || "ontology"),
            generatePlantUML(contextModules, plantUMLOptions)
        ),
    ];
}

function readManifest(dir: string): TontoManifest {
    try {
        return readOrCreateDefaultTontoManifest(dir);
    } catch (error) {
        throw normalizeJsonGenerationError(
            error,
            `Could not read the Tonto manifest in "${dir}".`,
            JSON_GENERATION_STEPS.manifestLoading
        );
    }
}

async function loadProject(dir: string, manifest: TontoManifest, services: TontoServices) {
    try {
        return await buildFolderDocuments(dir, services, {
            manifest,
            validation: true,
        });
    } catch (error) {
        throw normalizeJsonGenerationError(
            error,
            `Could not load the Tonto project in "${dir}".`,
            JSON_GENERATION_STEPS.sourceLoading
        );
    }
}

function getSourceModels(allFiles: string[], documents: LangiumDocuments): Model[] {
    const sourceFilePaths = new Set(allFiles.map((filePath) => path.resolve(filePath)));

    return documents.all
        .filter((document) => document.uri.scheme === "file" && sourceFilePaths.has(path.resolve(document.uri.fsPath)))
        .map((document) => document.parseResult.value)
        .filter(isModel)
        .toArray();
}

function getPlantUMLLayoutVariant(layout?: string): PlantUMLLayoutVariant {
    if (!layout) {
        return "default";
    }

    if (isPlantUMLLayoutVariant(layout)) {
        return layout;
    }

    throw createJsonGenerationError(`Unsupported PlantUML layout "${layout}".`, {
        step: JSON_GENERATION_STEPS.serialization,
        info: [{
            severity: "error",
            code: "unsupported_plantuml_layout",
            title: "Unsupported PlantUML layout",
            description: `Use one of: ${plantUMLLayoutVariants.join(", ")}.`,
        }],
    });
}

function isPlantUMLLayoutVariant(value: string): value is PlantUMLLayoutVariant {
    return plantUMLLayoutVariants.includes(value as PlantUMLLayoutVariant);
}

function writePlantUMLFile(destination: string, fileName: string, contents: string): string {
    try {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }

        const generatedFilePath = path.join(destination, fileName);
        fs.writeFileSync(generatedFilePath, contents);
        return generatedFilePath;
    } catch (error) {
        throw normalizeJsonGenerationError(
            error,
            `Could not write the generated PlantUML file "${fileName}".`,
            JSON_GENERATION_STEPS.fileWriting
        );
    }
}

function getPlantUMLFileName(name: string): string {
    const safeName = name.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
    return `${safeName || "ontology"}.puml`;
}
