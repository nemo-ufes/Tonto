import { CompositeGeneratorNode } from "langium/generate";
import { NodeFileSystem } from "langium/node";
import { createTontoServices } from "../../../language/tonto-module.js";
import { ModularGeneratorContext, parseProjectModular } from "../../utils/parseProjectModular.js";
import { buildFolderDocuments } from "../../utils/buildFolderDocuments.js";
import { readOrCreateDefaultTontoManifest } from "../../utils/readManifest.js";
import {
    AlloyResultResponse,
    ErrorAlloyResultResponse,
    TransformTontoToAlloy,
    createAlloyErrorResponse,
} from "../../main.js";

export const transformToAlloyCommand = async (
    dirName: string,
    label?: string,
    description?: string
): Promise<AlloyResultResponse | ErrorAlloyResultResponse> => {
    const services = createTontoServices({ ...NodeFileSystem }).Tonto;

    try {
        const manifest = readOrCreateDefaultTontoManifest(dirName);
        const { folderAbsolutePath, models } = await buildFolderDocuments(dirName, services, { manifest });

        const context: ModularGeneratorContext = {
            models,
            fileNode: new CompositeGeneratorNode(),
            manifest,
            folderAbsolutePath,
            label,
            description,
        };

        const project = parseProjectModular(context);

        return await TransformTontoToAlloy(project);
    } catch (error) {
        return createAlloyErrorResponse("Failed to prepare model for Alloy transformation", { error });
    }
};

/**
 * Unlike the gUFO equivalent, a successful Alloy result carries an object of modules rather
 * than a single string, so the guard checks the bundle's shape.
 */
export function isAlloyResultResponse(value: unknown): value is AlloyResultResponse {
    if (typeof value !== "object" || value === null || !("result" in value)) {
        return false;
    }

    const result = (value as { result: unknown }).result;

    return typeof result === "object"
        && result !== null
        && typeof (result as Record<string, unknown>).mainModule === "string";
}
