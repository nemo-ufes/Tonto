import chalk from "chalk";

import * as fs from "node:fs";
import path from "node:path";
import { Project, serializationUtils } from "ontouml-js";
import { generateTontoFile } from "../../constructors/index.js";
import { generateTontoFile as generateSingleTontoFile } from "../../tontoGenerator.js";
import {
    createTontoGenerationError,
    formatTontoGenerationErrorMessage,
    normalizeTontoGenerationError,
    TONTO_GENERATION_STEPS,
    type TontoGenerationError,
    type TontoGenerationErrorInfo,
} from "../../requests/tontoGeneration.js";
import { parseSerializedProject } from "../../utils/parseSerializedProject.js";

export type ImportOptions = {
    fileName: string;
    destination?: string
}

export type ImportReturn = {
    success: boolean
    message: string
    filePath?: string
    error?: TontoGenerationError
}

export const importCommand = async (opts: ImportOptions): Promise<ImportReturn> => {
    try {
        const generatedFilePath = importProject(opts);
        return {
            success: true,
            message: "Tonto file generated",
            filePath: generatedFilePath,
        } as ImportReturn;
    } catch (error) {
        const normalizedError = normalizeTontoGenerationError(
            error,
            `Could not import "${path.basename(opts.fileName)}".`,
            TONTO_GENERATION_STEPS.importing
        );
        const message = formatTontoGenerationErrorMessage(normalizedError);
        console.log(chalk.red(message));
        const importReturn: ImportReturn = {
            message,
            error: normalizedError,
            success: false,
        };
        return importReturn;
    }
};

export const newImportCommand = async (opts: ImportOptions): Promise<void> => {
    importProject(opts);
};

export const newImportSingleCommand = async (opts: ImportOptions): Promise<string> => {
    const project = loadImportProject(opts.fileName);
    return generateSingleTontoFile(project.model.getAllPackages(), opts.fileName, opts.destination);
};

function importProject(opts: ImportOptions): string {
    const project = loadImportProject(opts.fileName);
    return generateTontoFile(project, opts.fileName, opts.destination);
}

function loadImportProject(fileName: string): Project {
    const data = readImportSource(fileName);
    validateImportSource(data, fileName);
    return parseImportProject(data, fileName);
}

function readImportSource(fileName: string): string {
    try {
        return fs.readFileSync(fileName, { encoding: "utf8" });
    } catch (error) {
        throw createTontoGenerationError(
            `Could not read the source JSON file "${path.basename(fileName)}".`,
            {
                error,
                step: TONTO_GENERATION_STEPS.sourceLoading,
                info: [createImportErrorInfo("Source loading error", fileName, error)],
            }
        );
    }
}

function validateImportSource(data: string, fileName: string): void {
    const isValid = serializationUtils.validate(data);

    if (isValid === true) {
        console.log(chalk.bold("Model is valid. Proceding to generate tonto project..."));
        return;
    }

    console.log(chalk.red("Model is not valid. Aborting..."));
    throw createTontoGenerationError(
        `Could not import "${path.basename(fileName)}" because the JSON model is invalid.`,
        {
            step: TONTO_GENERATION_STEPS.sourceValidation,
            info: [
                {
                    severity: "error",
                    title: "Source validation error",
                    description: "The selected JSON file did not pass OntoUML JSON validation.",
                    filePath: fileName,
                },
            ],
        }
    );
}

function parseImportProject(data: string, fileName: string): Project {
    try {
        return parseSerializedProject(data);
    } catch (error) {
        throw createTontoGenerationError(
            `Could not parse the source OntoUML project from "${path.basename(fileName)}".`,
            {
                error,
                step: TONTO_GENERATION_STEPS.projectParsing,
                info: [createImportErrorInfo("Project parsing error", fileName, error)],
            }
        );
    }
}

function createImportErrorInfo(title: string, filePath: string, error: unknown): TontoGenerationErrorInfo {
    return {
        severity: "error",
        title,
        description: error instanceof Error ? error.message : String(error),
        filePath,
    };
}
