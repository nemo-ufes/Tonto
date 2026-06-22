import * as path from "node:path";
import * as vscode from "vscode";
import { buildInitManifest, buildInitProjectFiles } from "../../../tonto/src/cli/actions/commands/initCommand.js";
import { toJson } from "../../../tonto/src/cli/model/grammar/TontoManifest.js";
import { getOutputChannel } from "../extension/outputChannel.js";
import { CommandIds } from "./commandIds.js";
import {
    type GuidanceTargetChoice,
    materializeInitProjectFiles,
    promptGuidanceTargetChoice,
    shouldIncludeTemplatePathForGuidanceTarget,
} from "./init-project-files.js";
import {
    getPrimaryWorkspaceFolderOrShowError,
    promptForWorkspaceTargetFolder,
} from "./project-location.js";

const PROJECT_TEMPLATE_CHOICES = ["Blank", "Cat and Dog example"] as const;
const PROJECT_OPEN_CHOICES = ["Open in current window", "Open in new window", "Don't open"] as const;

type ProjectTemplateChoice = (typeof PROJECT_TEMPLATE_CHOICES)[number];

type InitProjectAnswers = {
    projectName: string;
    displayName: string;
    version: string;
    description: string;
    license: string;
    authorName: string;
    authorEmail: string;
    guidanceTarget: GuidanceTargetChoice;
    templateChoice: ProjectTemplateChoice;
};

function createInitCommand(context: vscode.ExtensionContext, sharedOutputChannel?: vscode.OutputChannel) {
    context.subscriptions.push(
        vscode.commands.registerCommand(CommandIds.initProject, () => initAction(context, sharedOutputChannel))
    );
}

async function initAction(_context: vscode.ExtensionContext, sharedOutputChannel?: vscode.OutputChannel) {
    const outputChannel = sharedOutputChannel ?? getOutputChannel();
    outputChannel.appendLine("[Tonto: Init new project command] Init command invoked");

    const workspaceFolder = getPrimaryWorkspaceFolderOrShowError(
        "No workspace open to initialize project.",
        outputChannel
    );
    if (!workspaceFolder) {
        return;
    }

    outputChannel.appendLine(`Workspace root: ${workspaceFolder.uri.fsPath}`);

    const answers = await promptInitProjectAnswers(outputChannel);
    if (!answers) {
        return;
    }

    const targetRootUri = await promptForWorkspaceTargetFolder(workspaceFolder);
    outputChannel.appendLine(`Prompt result - targetRoot: ${String(targetRootUri?.fsPath)}`);
    if (!targetRootUri) {
        outputChannel.appendLine("User cancelled folder choice");
        outputChannel.show(true);
        return;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Initializing Tonto project",
                cancellable: false,
            },
            async () => {
                const initOptions = {
                    catDogExample: answers.templateChoice === "Cat and Dog example",
                };
                outputChannel.appendLine(
                    `Building file list for projectName='${answers.projectName}' options=${JSON.stringify(initOptions)}`
                );

                const files = buildInitProjectFiles(answers.projectName, initOptions);
                outputChannel.appendLine(`Files to create: ${files.length}`);

                await materializeInitProjectFiles(targetRootUri, files, {
                    outputChannel,
                    filterEntry: (_file, relativePath) =>
                        shouldIncludeTemplatePathForGuidanceTarget(answers.guidanceTarget, relativePath),
                });
                await writeManifestFile(targetRootUri, answers, outputChannel);

                outputChannel.appendLine(
                    `All files created for project '${answers.projectName}' at ${targetRootUri.fsPath}`
                );
                outputChannel.show(true);
                vscode.window.showInformationMessage("Tonto project initialized successfully.");
            }
        );

        await promptToOpenGeneratedProject(targetRootUri.fsPath, answers.projectName, outputChannel);
    } catch (error) {
        console.error(error);
        outputChannel.appendLine(`Error while initializing project: ${String(error)}`);
        outputChannel.show(true);
    }
}

async function promptInitProjectAnswers(
    outputChannel: vscode.OutputChannel
): Promise<InitProjectAnswers | undefined> {
    const projectName = await promptTextValue(
        outputChannel,
        "projectName",
        {
            prompt: "Project name",
            value: "tonto-project",
            validateInput: (value) => (value && value.trim() ? undefined : "Enter a project name"),
        },
        { allowEmpty: false }
    );
    if (projectName === undefined) {
        return undefined;
    }

    const displayName = await promptTextValue(outputChannel, "displayName", {
        prompt: "Display name",
        value: projectName,
    });
    if (displayName === undefined) {
        return undefined;
    }

    const version = await promptTextValue(outputChannel, "version", {
        prompt: "Version",
        value: "1.0.0",
    });
    if (version === undefined) {
        return undefined;
    }

    const description = await promptTextValue(outputChannel, "description", {
        prompt: "Description",
        value: "",
    }, { allowEmpty: true });
    if (description === undefined) {
        return undefined;
    }

    const license = await promptTextValue(outputChannel, "license", {
        prompt: "License",
        value: "MIT",
    });
    if (license === undefined) {
        return undefined;
    }

    const authorName = await promptTextValue(outputChannel, "authorName", {
        prompt: "Author name",
        value: "",
    }, { allowEmpty: true });
    if (authorName === undefined) {
        return undefined;
    }

    const authorEmail = await promptTextValue(outputChannel, "authorEmail", {
        prompt: "Author email (optional)",
        value: "",
    }, { allowEmpty: true });
    if (authorEmail === undefined) {
        return undefined;
    }

    const guidanceTarget = await promptGuidanceTargetChoice();
    outputChannel.appendLine(`Prompt result - guidanceTarget: ${String(guidanceTarget)}`);
    if (!guidanceTarget) {
        outputChannel.appendLine("User cancelled guidance target pick");
        outputChannel.show(true);
        return undefined;
    }

    const templateChoice = await promptSelection(
        outputChannel,
        "templateChoice",
        PROJECT_TEMPLATE_CHOICES,
        {
            placeHolder: "Choose a project template",
        }
    );
    if (!templateChoice) {
        return undefined;
    }

    return {
        projectName,
        displayName,
        version,
        description,
        license,
        authorName,
        authorEmail,
        guidanceTarget,
        templateChoice,
    };
}

async function promptTextValue(
    outputChannel: vscode.OutputChannel,
    fieldName: string,
    options: vscode.InputBoxOptions,
    config: { allowEmpty?: boolean } = {}
): Promise<string | undefined> {
    const value = await vscode.window.showInputBox(options);
    outputChannel.appendLine(`Prompt result - ${fieldName}: ${String(value)}`);

    if (value === undefined || (!config.allowEmpty && value.trim() === "")) {
        outputChannel.appendLine(`User cancelled ${fieldName} input`);
        outputChannel.show(true);
        return undefined;
    }

    return value;
}

async function promptSelection<T extends string>(
    outputChannel: vscode.OutputChannel,
    fieldName: string,
    options: readonly T[],
    quickPickOptions: vscode.QuickPickOptions
): Promise<T | undefined> {
    const items = options.map((option) => ({
        label: option,
        value: option,
    }));
    const selection = await vscode.window.showQuickPick(items, quickPickOptions);
    outputChannel.appendLine(`Prompt result - ${fieldName}: ${String(selection?.value)}`);

    if (!selection) {
        outputChannel.appendLine(`User cancelled ${fieldName} pick`);
        outputChannel.show(true);
        return undefined;
    }

    return selection.value;
}

async function writeManifestFile(
    targetRootUri: vscode.Uri,
    answers: InitProjectAnswers,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const manifestPath = path.join(targetRootUri.fsPath, answers.projectName, "tonto.json");
    const manifestUri = vscode.Uri.file(manifestPath);

    try {
        await vscode.workspace.fs.writeFile(
            manifestUri,
            new TextEncoder().encode(buildManifestContent(answers))
        );
        outputChannel.appendLine(`Wrote manifest: ${manifestPath}`);
    } catch (error) {
        outputChannel.appendLine(`Failed writing manifest ${manifestPath}: ${String(error)}`);
        outputChannel.show(true);
        throw error;
    }
}

function buildManifestContent(answers: InitProjectAnswers): string {
    const manifest = buildInitManifest({
        projectName: answers.projectName,
        displayName: answers.displayName,
        version: answers.version,
        description: answers.description,
        license: answers.license,
        authorName: answers.authorName,
        authorEmail: answers.authorEmail,
    });
    manifest.publisher = "";
    return toJson(manifest);
}

async function promptToOpenGeneratedProject(
    targetRootPath: string,
    projectName: string,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const openChoice = await promptSelection(outputChannel, "openChoice", PROJECT_OPEN_CHOICES, {
        placeHolder: "Open the generated project now?",
    });
    if (!openChoice) {
        return;
    }

    const projectPath = path.resolve(targetRootPath, projectName);

    try {
        if (openChoice === "Open in current window") {
            await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(projectPath), false);
            outputChannel.appendLine("Opened project in current window");
            return;
        }

        if (openChoice === "Open in new window") {
            await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(projectPath), true);
            outputChannel.appendLine("Opened project in new window");
            return;
        }

        outputChannel.appendLine("User chose not to open the project");
    } catch (error) {
        outputChannel.appendLine(`Error while opening project: ${String(error)}`);
    }
}

export { createInitCommand };
