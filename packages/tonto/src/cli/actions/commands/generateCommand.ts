import chalk from "chalk";
import { NodeFileSystem } from "langium/node";
import { Model } from "../../../language/index.js";
import { TontoServices, createTontoServices } from "../../../language/tonto-module.js";
import { extractAstNode } from "../../cli-util.js";
import { generateJSONFileModular } from "../../generators/jsonModular.generator.js";
import { generateJSONFile } from "../../jsonGenerator.js";
import { TontoManifest } from "../../model/grammar/TontoManifest.js";
import {
    JSON_GENERATION_STEPS,
    createJsonGenerationError,
    getJsonGenerationDocumentBlockingErrorInfos,
    normalizeJsonGenerationError,
} from "../../requests/jsonGeneration.js";
import { buildFolderDocuments } from "../../utils/buildFolderDocuments.js";
import { readOrCreateDefaultTontoManifest } from "../../utils/readManifest.js";

export const generateCommand = async (fileName: string, destination: string): Promise<string | undefined> => {
    const services = createTontoServices({ ...NodeFileSystem }).Tonto;
    const model = await extractAstNode<Model>(fileName, services);
    const generatedFilePath = generateJSONFile(model, fileName, destination);
    return generatedFilePath;
};

// TODO: Make this function generate file on folder
export async function generateModularCommand(dir: string, label?: string, description?: string): Promise<string | undefined> {
    const services = createTontoServices({ ...NodeFileSystem }).Tonto;
    let manifest: TontoManifest;

    try {
        manifest = readOrCreateDefaultTontoManifest(dir);
    } catch (error) {
        throw normalizeJsonGenerationError(
            error,
            `Could not read the Tonto manifest in "${dir}".`,
            JSON_GENERATION_STEPS.manifestLoading
        );
    }

    console.log(chalk.bold("tonto.json file parsed successfully."));
    const createdFile = await createModel(dir, manifest, services, label, description);

    console.log(chalk.green("JSON File generated successfully: "));
    return createdFile;
}

async function createModel(
    dir: string,
    manifest: TontoManifest,
    services: TontoServices,
    label?: string,
    description?: string
): Promise<string | undefined> {
    const { allFiles, documents, folderAbsolutePath, models } = await buildFolderDocuments(dir, services, {
        manifest,
        validation: true,
    });

    if (allFiles.length === 0) {
        throw createJsonGenerationError(`Could not generate JSON because no Tonto source files were found in "${dir}".`, {
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

    const diagnosticInfos = getJsonGenerationDocumentBlockingErrorInfos(documents);
    if (diagnosticInfos.length > 0) {
        throw createJsonGenerationError("Could not generate JSON because the Tonto sources contain syntax or linking errors.", {
            step: JSON_GENERATION_STEPS.documentValidation,
            info: diagnosticInfos,
        });
    }

    return generateJSONFileModular(models, manifest, folderAbsolutePath, label, description);
}
