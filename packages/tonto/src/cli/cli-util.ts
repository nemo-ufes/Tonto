import chalk from "chalk";
import { AstNode, LangiumDocument, LangiumDocuments } from "langium";
import { LangiumServices } from "langium/lsp";
import * as fs from "node:fs";
import * as path from "node:path";
import { Diagnostic } from "vscode-languageserver-types";
import { URI } from "vscode-uri";
import { BuiltInLib } from "./model/BuiltInLib.js";
import {
    JSON_GENERATION_STEPS,
    createJsonGenerationError,
    getJsonGenerationBlockingDiagnosticInfos,
} from "./requests/jsonGeneration.js";

export async function extractAllDocuments(
    fileNames: string[],
    services: LangiumServices,
    builtInLibs: BuiltInLib[],
    validationChecks: boolean
): Promise<LangiumDocuments> {
    const documents: Array<LangiumDocument<AstNode>> = [];

    for (const lib of builtInLibs) {
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(lib.content, URI.parse(lib.uri));
        services.shared.workspace.LangiumDocuments.addDocument(document);
        documents.push(document);
    }

    for (const fileName of fileNames) {
        const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));
        documents.push(document);
    }

    await services.shared.workspace.DocumentBuilder.build(documents, {
        validation: validationChecks
    });

    for (const document of documents) {
        const validationErrors = (document.diagnostics ?? []).filter((e) => e.severity === 1);
        if (validationErrors.length > 0) {
            console.error(chalk.red("There are validation errors:"));
            for (const validationError of validationErrors) {
                console.error(
                    chalk.red(
                        `line ${validationError.range.start.line + 1}: ${validationError.message} [${document.textDocument.getText(
                            validationError.range
                        )}]`
                    )
                );
            }
        }
    }
    return services.shared.workspace.LangiumDocuments;
}

export async function extractDocument(fileName: string, services: LangiumServices): Promise<LangiumDocument> {
    // const extensions = services.LanguageMetaData.fileExtensions;
    // if (!extensions.includes(path.extname(fileName))) {
    //   console.error(
    //     chalk.yellow(
    //       `Please choose a file with one of these extensions: ${ extensions }.`
    //     )
    //   );
    //   process.exit(1);
    // }

    if (!fs.existsSync(fileName)) {
        throw createJsonGenerationError(`Could not load Tonto source file "${fileName}".`, {
            step: JSON_GENERATION_STEPS.sourceLoading,
            info: [{
                severity: "error",
                title: "Source file not found",
                description: `File "${fileName}" does not exist.`,
                filePath: fileName,
            }],
        });
    }

    const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));
    await services.shared.workspace.DocumentBuilder.build([document], {
        validation: true
    });

    const validationErrors = (document.diagnostics ?? []).filter((e) => e.severity === 1);
    if (validationErrors.length > 0) {
        console.error(chalk.red("There are validation errors:"));
        for (const validationError of validationErrors) {
            console.error(
                chalk.red(
                    `line ${validationError.range.start.line + 1}: ${validationError.message} [${document.textDocument.getText(
                        validationError.range
                    )}]`
                )
            );
        }
    }

    const blockingErrors = getJsonGenerationBlockingDiagnosticInfos(document);
    if (blockingErrors.length > 0) {
        throw createJsonGenerationError("Could not generate JSON because the Tonto source file contains syntax or linking errors.", {
            step: JSON_GENERATION_STEPS.documentValidation,
            info: blockingErrors,
        });
    }

    return document;
}

export async function extractAllValidationErrors(
    fileNames: string[],
    services: LangiumServices,
    builtInLibs: BuiltInLib[]): Promise<Diagnostic[]> {
    try {
        const docs = await extractAllDocuments(fileNames, services, builtInLibs, true);
        const errors: Diagnostic[] = docs.all.flatMap(doc => doc.diagnostics)
            .toArray()
            .filter((item): item is Diagnostic => item !== undefined);
        return errors;
    } catch (error) {
        return [];
    }
    return [];
}

export async function extractAllAstNodes<T extends AstNode>(
    fileNames: string[],
    services: LangiumServices,
    builtInLibs: BuiltInLib[],
    validationChecks: boolean
): Promise<T[]> {
    const docs = await extractAllDocuments(fileNames, services, builtInLibs, validationChecks);
    const nodes: T[] = docs.all.flatMap((doc) => doc.parseResult?.value as T).toArray();
    return nodes;
}

export async function extractAstNode<T extends AstNode>(fileName: string, services: LangiumServices): Promise<T> {
    return (await extractDocument(fileName, services)).parseResult?.value as T;
}

interface FilePathData {
    destination: string
    name: string
}

export function extractDestinationAndName(filePath: string, destination: string | undefined): FilePathData {
    filePath = filePath.replace(/\..*$/, "").replace(/[.-]/g, "");
    return {
        destination: destination ?? path.join(path.dirname(filePath), "generated"),
        name: path.basename(filePath),
    };
}

export function extractName(filePath: string): string {
    filePath = filePath.replace(/\..*$/, "").replace(/[.-]/g, "");
    return path.basename(filePath);
}
