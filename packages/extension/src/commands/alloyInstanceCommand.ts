import {
    AlloyResultResponse, ErrorAlloyResultResponse, isAlloyResultResponse,
    formatAlloyErrorMessage, readOrCreateDefaultTontoManifest, transformToAlloyCommand
} from "tonto-cli";
import * as vscode from "vscode";
import { AlloyInstancePanel } from "../alloy/alloyInstancePanel.js";
import { AlloyLspClient } from "../alloy/alloyLspClient.js";
import { AlloyServerNotFoundError } from "../alloy/alloyLspProcess.js";
import { CommandIds } from "./commandIds.js";
import { promptForProjectFolder, resolveCommandFolderFromContext } from "./project-location.js";

/**
 * The three run predicates the OntoUML → Alloy transformation emits, each at two scopes.
 *
 * <p>Offered as a pick rather than read from the model because the choice is the interesting
 * part of the workflow: how many worlds the modeller wants to reason about at once.
 */
const RUN_PREDICATES: { label: string; description: string }[] = [
    { label: "singleWorld", description: "One world — check the model is not over-constrained" },
    { label: "linearWorlds", description: "A chain of worlds — how things change over time" },
    { label: "multipleWorlds", description: "Several worlds — what varies across possibilities" },
];

function registerGenerateInstancesCommand(context: vscode.ExtensionContext, client: AlloyLspClient) {
    context.subscriptions.push(
        vscode.commands.registerCommand(CommandIds.generateInstancesFromButton, (uri?: vscode.Uri) =>
            runFromContext(context, client, uri))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(CommandIds.generateInstances, () => runFromPalette(context, client))
    );
}

async function runFromContext(context: vscode.ExtensionContext, client: AlloyLspClient, uri?: vscode.Uri) {
    const folderUri = await resolveCommandFolderFromContext({
        uri,
        missingContextMessage: "Failed! Could not find workspace to generate instances",
    });

    if (folderUri) {
        await generateInstances(context, client, folderUri);
    }
}

async function runFromPalette(context: vscode.ExtensionContext, client: AlloyLspClient) {
    const folderUri = await promptForProjectFolder();

    if (folderUri) {
        await generateInstances(context, client, folderUri);
    }
}

async function generateInstances(
    context: vscode.ExtensionContext,
    client: AlloyLspClient,
    directoryUri: vscode.Uri
): Promise<void> {
    const predicate = await vscode.window.showQuickPick(RUN_PREDICATES, {
        title: "Generate instances",
        placeHolder: "Which run predicate should Alloy explore?",
    });

    if (!predicate) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Generating instances (${predicate.label})...`,
            cancellable: false,
        },
        async () => {
            try {
                const modules = await transformInMemory(directoryUri);
                if (!modules) {
                    return;
                }

                const instance = await client.openSession(modules.result, predicate.label);
                // The server only sees the generated Alloy, which keeps class names but not
                // what each class is. The stereotypes come from this side, where the OntoUML
                // project still exists.
                instance.ontology = modules.ontology;

                if (!instance.satisfiable) {
                    // Not an error: no instance at this scope is itself a result about the model.
                    vscode.window.showWarningMessage(
                        `Alloy found no instance for ${predicate.label}. `
                        + "The model may be over-constrained."
                    );
                }

                const manifest = readOrCreateDefaultTontoManifest(directoryUri.fsPath);
                AlloyInstancePanel.show(context, client, instance, manifest.projectName);
            } catch (error) {
                reportFailure(error);
            }
        }
    );
}

/**
 * Transforms the project without writing anything to disk.
 *
 * <p>Generating instances is a question a modeller asks, not an artefact they want — leaving
 * `.als` files behind on every run would be noise. The `Transform to Alloy` command remains
 * the way to get files.
 */
async function transformInMemory(directoryUri: vscode.Uri) {
    const response = await transformToAlloyCommand(directoryUri.fsPath);

    if (!isAlloyResultResponse(response)) {
        vscode.window.showErrorMessage(formatAlloyErrorMessage(response as ErrorAlloyResultResponse));
        return undefined;
    }

    const success = response as AlloyResultResponse;
    return { result: success.result, ontology: success.ontology };
}

function reportFailure(error: unknown): void {
    if (error instanceof AlloyServerNotFoundError) {
        vscode.window.showErrorMessage(error.message, "Open settings").then((choice) => {
            if (choice === "Open settings") {
                void vscode.commands.executeCommand("workbench.action.openSettings", "tonto.alloy");
            }
        });
        return;
    }

    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not generate instances: ${message}`);
}

export { registerGenerateInstancesCommand, RUN_PREDICATES };
