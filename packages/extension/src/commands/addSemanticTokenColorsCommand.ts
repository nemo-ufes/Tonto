import * as vscode from "vscode";
import { getOutputChannel } from "../extension/outputChannel.js";
import { CommandIds } from "./commandIds.js";
import {
    buildTontoSemanticTokenColorCustomizations,
    buildTontoSemanticTokenColorSettingsSnippet,
} from "./semantic-token-settings.js";

const ADD_TO_USER_SETTINGS = "Add to User Settings";
const COPY_SETTINGS_JSON = "Copy Settings JSON";

function createAddSemanticTokenColorsCommand(
    context: vscode.ExtensionContext,
    sharedOutputChannel?: vscode.OutputChannel
) {
    context.subscriptions.push(
        vscode.commands.registerCommand(CommandIds.addSemanticTokenColors, () =>
            addSemanticTokenColors(sharedOutputChannel)
        )
    );
}

async function addSemanticTokenColors(sharedOutputChannel?: vscode.OutputChannel): Promise<void> {
    const outputChannel = sharedOutputChannel ?? getOutputChannel();
    outputChannel.appendLine("[Tonto: Add semantic token colors] Command invoked");

    const action = await vscode.window.showInformationMessage(
        "Use Tonto semantic token colors with your current theme.",
        ADD_TO_USER_SETTINGS,
        COPY_SETTINGS_JSON
    );

    if (action === COPY_SETTINGS_JSON) {
        try {
            await vscode.env.clipboard.writeText(buildTontoSemanticTokenColorSettingsSnippet());
            outputChannel.appendLine("Copied Tonto semantic token color settings JSON to clipboard");
            vscode.window.showInformationMessage("Tonto semantic token color settings copied to clipboard.");
        } catch (error) {
            outputChannel.appendLine(`Failed to copy semantic token color settings: ${String(error)}`);
            outputChannel.show(true);
            vscode.window.showErrorMessage("Could not copy Tonto semantic token color settings.");
        }
        return;
    }

    if (action !== ADD_TO_USER_SETTINGS) {
        outputChannel.appendLine("Semantic token colors command cancelled");
        return;
    }

    const configuration = vscode.workspace.getConfiguration();
    const currentCustomizations = configuration.get("editor.semanticTokenColorCustomizations");
    const nextCustomizations = buildTontoSemanticTokenColorCustomizations(currentCustomizations);

    try {
        await configuration.update(
            "editor.semanticTokenColorCustomizations",
            nextCustomizations,
            vscode.ConfigurationTarget.Global
        );
        outputChannel.appendLine("Updated user setting: editor.semanticTokenColorCustomizations");
        vscode.window.showInformationMessage("Tonto semantic token colors added to user settings.");
    } catch (error) {
        outputChannel.appendLine(`Failed to update semantic token colors: ${String(error)}`);
        outputChannel.show(true);
        vscode.window.showErrorMessage("Could not add Tonto semantic token colors to user settings.");
    }
}

export { createAddSemanticTokenColorsCommand };
