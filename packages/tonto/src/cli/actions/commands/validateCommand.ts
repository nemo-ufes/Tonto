import { CompositeGeneratorNode } from "langium/generate";
import { NodeFileSystem } from "langium/node";
import { createTontoServices } from "../../../index.js";
import { ModularGeneratorContext, parseProjectModular } from "../../utils/parseProjectModular.js";
import { buildFolderDocuments } from "../../utils/buildFolderDocuments.js";
import { readOrCreateDefaultTontoManifest } from "../../utils/readManifest.js";
import { ErrorResultResponse, validateTontoFile, ValidationReturn } from "../../main.js";

export const validateCommand = async (dirName: string = "", locally: boolean = false): Promise<ValidationReturn | ErrorResultResponse> => {
    const services = createTontoServices({ ...NodeFileSystem }).Tonto;

    try {
        const resolvedDirName = dirName || process.cwd();
        const manifest = readOrCreateDefaultTontoManifest(resolvedDirName);
        const { folderAbsolutePath, models } = await buildFolderDocuments(resolvedDirName, services, { manifest });

        const context: ModularGeneratorContext = {
            models,
            fileNode: new CompositeGeneratorNode(),
            manifest,
            folderAbsolutePath,
        };

        const project = parseProjectModular(context);

        const validationResult = await validateTontoFile(project, locally);

        if (validationResult) {
            return validationResult;
        } else {
            return {
                status: 500,
                message: "Validation failed",
            } as ErrorResultResponse;
        }
    } catch (error) {
        console.log(error);
    }
    return {
        status: 500,
        message: "Validation failed",
    } as ErrorResultResponse;
};
