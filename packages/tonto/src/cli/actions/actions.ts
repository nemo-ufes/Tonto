import chalk from "chalk";
import * as fs from "node:fs";
import path from "path";
import { ErrorGufoResultResponse, GufoResultResponse, formatGufoErrorMessage } from "../requests/gufoTransform.js";
import { formatJsonGenerationErrorMessage } from "../requests/jsonGeneration.js";
import { formatTontoGenerationErrorMessage } from "../requests/tontoGeneration.js";
import { ErrorResultResponse, ValidationReturn } from "../requests/ontoumljsValidator.js";
import { readOrCreateDefaultTontoManifest } from "../utils/readManifest.js";
import { generateCommand, generateModularCommand } from "./commands/generateCommand.js";
import { isGufoResultResponse, transformToGufoCommand } from "./commands/generateGufoCommand.js";
import { generatePlantUMLCommand } from "./commands/generatePlantUMLCommand.js";
import { ImportOptions, newImportCommand, newImportSingleCommand } from "./commands/importCommand.js";
import { validateCommand } from "./commands/validateCommand.js";
import { validateCommandLocal } from "./commands/validateLocalCommand.js";


export type GenerateOptions = {
    destination?: string;
};

export type ValidateOptions = {
    local: boolean;
}

export type GeneratePlantUMLOptions = {
    destination?: string;
    perPackage?: boolean;
    externalReferences?: boolean;
    layout?: string;
}

export class TontoActions {
    /**
   * This action imports a JSON File and create a Tonto Project based on it
   * @param opts An object containing options for importing
   */
    async importAction(fileName: string, dir?: ImportOptions): Promise<void> {
        console.log("Importing JSON!");
        try {
            await newImportCommand({
                fileName: fileName,
                destination: dir?.destination
            });
        } catch (error) {
            console.log(chalk.red(formatTontoGenerationErrorMessage(error)));
            markCommandFailed();
        }
        // if (result.success) {
        //   console.log(`Generated .tonto file at ${result.filePath}`);
        // } else {
        //   console.log("Error generating .tonto");
        // }
    }

    async importSingleAction(fileName: string, dir?: ImportOptions): Promise<void> {
        console.log("Importing JSON into a single Tonto file!");
        try {
            const generatedFile = await newImportSingleCommand({
                fileName,
                destination: dir?.destination,
            });
            console.log(chalk.green(`Tonto file generated successfully: ${generatedFile}`));
        } catch (error) {
            console.log(chalk.red(formatTontoGenerationErrorMessage(error)));
            markCommandFailed();
        }
    }

    async generateAction(dirName: string, opts: GenerateOptions): Promise<void> {
        try {
            const generatedFile = await generateModularCommand(dirName, undefined, undefined, opts.destination);
            if (generatedFile) {
                console.log(chalk.green(`JSON File generated successfully: ${generatedFile}`));
            }
        } catch (error) {
            console.log(chalk.red(formatJsonGenerationErrorMessage(error)));
            markCommandFailed();
        }
    }

    async generateSingleAction(fileName: string, opts: GenerateOptions): Promise<void> {
        try {
            const generatedFile = await generateCommand(fileName, opts.destination);
            console.log(chalk.green(`JSON File generated successfully: ${generatedFile}`));
        } catch (error) {
            console.log(chalk.red(formatJsonGenerationErrorMessage(error)));
            markCommandFailed();
        }
    }

    async transformToGufoAction(dirName: string): Promise<void> {
        if (!dirName) {
            console.log(chalk.red("Directory not provided!"));
            return;
        }
        console.log(chalk.bold("Transforming to gufo..."));

        try {
            const manifest = readOrCreateDefaultTontoManifest(dirName);
            const response = await transformToGufoCommand(dirName);

            if (isGufoResultResponse(response)) {
                const resultResponse = response as GufoResultResponse;
                if (!fs.existsSync(dirName)) {
                    fs.mkdirSync(dirName);
                }
                fs.writeFileSync(path.join(dirName, manifest.outFolder, manifest.projectName), resultResponse.result);
            } else {
                const errorResponse = response as ErrorGufoResultResponse;
                const details = errorResponse.info ?? [];

                if (details.length > 0) {
                    details.forEach((errorInfo) => {
                        console.log(chalk.bold.redBright(`[${errorInfo.severity}] ${errorInfo.title}:`));
                        console.log(chalk.red(errorInfo.description));
                    });
                } else {
                    console.log(chalk.red(formatGufoErrorMessage(errorResponse)));
                }
                markCommandFailed();
            }
            console.log(chalk.bold.green("Transformation to Gufo finished"));
        } catch (error) {
            console.log(chalk.red(error));
            markCommandFailed();
        }
    }

    async generatePlantUMLAction(dirName: string, opts: GeneratePlantUMLOptions = {}): Promise<void> {
        if (!dirName) {
            console.log(chalk.red("Directory not provided!"));
            return;
        }

        try {
            const generatedFiles = await generatePlantUMLCommand(dirName, {
                destination: opts.destination,
                perPackage: opts.perPackage,
                showExternalReferences: opts.externalReferences !== false,
                layout: opts.layout,
            });

            if (generatedFiles.length === 1) {
                console.log(chalk.green(`PlantUML file generated successfully: ${generatedFiles[0]}`));
                return;
            }

            console.log(chalk.green("PlantUML files generated successfully:"));
            generatedFiles.forEach((filePath) => console.log(chalk.green(`- ${filePath}`)));
        } catch (error) {
            console.log(chalk.red(formatJsonGenerationErrorMessage(error)));
            markCommandFailed();
        }
    }

    async validateAction(dirName: string, opts: { withApi?: boolean }): Promise<void> {
        if (!dirName) {
            console.log(chalk.red("Directory not provided!"));
            return;
        }
        console.log(chalk.bold("Performing local validation..."));
        let diagnostics;
        try {
            diagnostics = await validateCommandLocal(dirName);
        } catch (error) {
            console.log(chalk.red(error instanceof Error ? error.message : String(error)));
            markCommandFailed();
            return;
        }
        const errors = diagnostics?.filter((diagnostic) => diagnostic.severity === 1) ?? [];
        const warnings = diagnostics?.filter((diagnostic) => diagnostic.severity === 2) ?? [];

        if (errors.length > 0) {
            console.log(chalk.bold(`- Total of local errors: ${errors.length}`));
            markCommandFailed();
        } else {
            console.log(chalk.green("No local errors found."));
        }
        if (warnings.length > 0) {
            console.log(chalk.yellow(`- Total of local warnings: ${warnings.length}`));
        }

        if (opts.withApi) {
            console.log(chalk.bold("\nPerforming API validation..."));
            try {
                const response = await validateCommand(dirName, false);

                if (isValidationReturn(response)) {
                    if (response.result.length > 0) {
                        response.result.forEach(resultResponse => {
                            console.log(chalk.bold.redBright(`[${resultResponse.severity}] ${resultResponse.title}:`));
                            console.log(chalk.red(resultResponse.description));
                        });
                        console.log(chalk.bold(`- Total of API errors: ${response.numberOfErrors}`));
                        if (response.numberOfErrors > 0) {
                            markCommandFailed();
                        }
                    } else {
                        console.log(chalk.green("No API errors found."));
                    }
                } else {
                    console.log(chalk.bold.red(response.message ?? "API validation failed."));
                    markCommandFailed();
                }
            } catch (error) {
                console.log(chalk.red(error));
                markCommandFailed();
            }
        }
        console.log(chalk.bold.green("\nValidation finished."));
    }

}

function isValidationReturn(response: ValidationReturn | ErrorResultResponse): response is ValidationReturn {
    return "result" in response && Array.isArray(response.result);
}

function markCommandFailed(): void {
    process.exitCode = 1;
}
