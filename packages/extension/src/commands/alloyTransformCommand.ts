import * as fs from "node:fs";
import {
    AlloyResultResponse, ErrorAlloyResultResponse, isAlloyResultResponse,
    formatAlloyErrorMessage, readOrCreateDefaultTontoManifest, transformToAlloyCommand
} from "tonto-cli";
import * as vscode from "vscode";
import { getAlloyOutputDirectory, resolveAlloyOutputFiles } from "./alloyOutputFiles.js";
import { CommandIds } from "./commandIds.js";
import {
    promptForProjectFolder,
    resolveCommandFolderFromContext,
} from "./project-location.js";

function registerTransformToAlloyCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(CommandIds.transformToAlloyFromButton, transformToAlloyFromContext)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(CommandIds.transformToAlloy, transformToAlloyFromPalette)
    );
}

async function transformToAlloyFromContext(uri?: vscode.Uri) {
    const folderUri = await resolveCommandFolderFromContext({
        uri,
        missingContextMessage: "Failed! Could not find workspace to execute transformation",
    });

    if (folderUri) {
        await transformModel(folderUri);
    }
}

async function transformToAlloyFromPalette() {
    const folderUri = await promptForProjectFolder();

    if (folderUri) {
        await transformModel(folderUri);
    }
}

async function transformModel(directoryUri: vscode.Uri, label?: string, description?: string) {

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Transforming model to Alloy...",
            cancellable: false,
        },
        async () => {
            try {
                const response = await transformToAlloyCommand(directoryUri.fsPath, label, description);

                if (!isAlloyResultResponse(response)) {
                    const error = response as ErrorAlloyResultResponse;
                    vscode.window.showErrorMessage(formatAlloyErrorMessage(error));
                    return;
                }

                const alloyResult = response as AlloyResultResponse;
                const manifest = readOrCreateDefaultTontoManifest(directoryUri.fsPath);
                const outputFiles = resolveAlloyOutputFiles(
                    alloyResult.result,
                    directoryUri.fsPath,
                    manifest.outFolder
                );

                fs.mkdirSync(getAlloyOutputDirectory(directoryUri.fsPath, manifest.outFolder), { recursive: true });
                outputFiles.forEach(({ filePath, content }) => fs.writeFileSync(filePath, content));

                await showGeneratedModel(outputFiles.find((file) => file.isEntryPoint)?.filePath);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Error transforming model to Alloy";
                vscode.window.showErrorMessage(message);
            }
        }
    );
}

/**
 * `main.als` is the entry point a modeller opens in the Alloy Analyzer — the other two
 * modules only exist to be imported by it — so offer to open that one.
 */
async function showGeneratedModel(mainModulePath: string | undefined) {
    const openAction = "Open main.als";
    const selection = await vscode.window.showInformationMessage(
        "Generated Alloy model!",
        ...(mainModulePath ? [openAction] : [])
    );

    if (selection === openAction && mainModulePath) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(mainModulePath));
        await vscode.window.showTextDocument(document);
    }
}

export { registerTransformToAlloyCommands };
