import { CompositeGeneratorNode, toString } from "langium/generate";
import * as fs from "node:fs";
import * as path from "node:path";
import { OntoumlElement } from "ontouml-js";
import { createTontoPackage } from "./constructors/package.constructor.js";
import { normalizeTontoGenerationError, TONTO_GENERATION_STEPS } from "./requests/tontoGeneration.js";

export function generateTontoFile(
    ontoumlElements: OntoumlElement[],
    filePath: string,
    destination: string | undefined
): string {
    const data = customExtractDestinationAndName(filePath, destination);
    const ctx = <GeneratorContext>{
        ontoumlElements,
        name: data.name,
        fileName: `${data.name}.tonto`,
        destination: data.destination,
        fileNode: new CompositeGeneratorNode(),
    };
    return generate(ctx);
}

interface GeneratorContext {
    ontoumlElements: OntoumlElement[]
    name: string
    fileName: string
    destination: string
    fileNode: CompositeGeneratorNode
}

function generate(ctx: GeneratorContext): string {
    try {
        ctx.ontoumlElements.forEach((ontoumlElement) => {
            createTontoPackage(ontoumlElement, ctx.fileNode);
        });
    } catch (error) {
        throw normalizeTontoGenerationError(
            error,
            `Could not generate the Tonto source for "${ctx.name}".`,
            TONTO_GENERATION_STEPS.packageGeneration
        );
    }

    try {
        if (!fs.existsSync(ctx.destination)) {
            fs.mkdirSync(ctx.destination, { recursive: true });
        }
    } catch (error) {
        throw normalizeTontoGenerationError(
            error,
            `Could not create the destination folder for "${ctx.name}".`,
            TONTO_GENERATION_STEPS.fileWriting
        );
    }

    try {
        const generatedFilePath = path.join(ctx.destination, ctx.fileName);
        fs.writeFileSync(generatedFilePath, toString(ctx.fileNode));
        return generatedFilePath;
    } catch (error) {
        throw normalizeTontoGenerationError(
            error,
            `Could not prepare the generated Tonto file "${ctx.fileName}".`,
            TONTO_GENERATION_STEPS.fileWriting
        );
    }
}

interface FilePathData {
    destination: string
    name: string
}

export function customExtractDestinationAndName(filePath: string, destination: string | undefined): FilePathData {
    filePath = filePath.replace(/\.json/, "");
    return {
        destination: destination ?? path.join(path.dirname(filePath), "generated"),
        name: path.basename(filePath),
    };
}
