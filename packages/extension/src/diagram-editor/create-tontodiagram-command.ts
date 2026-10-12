import path from "node:path";
import { emptyViewFile } from "tonto-cli/lib/view/model/viewfile.js";
import { namedViewPath } from "./view-paths.js";
import * as vscode from "vscode";
import {
    getTontoDiagramProjectName,
} from "./tontodiagram-template.js";

const COMMAND_ID = "tonto.diagram.createFile";
const MANIFEST_FILE_NAME = "tonto.json";

export function registerCreateTontoDiagramCommand(): vscode.Disposable {
    return vscode.commands.registerCommand(COMMAND_ID, async (resource?: vscode.Uri) => {
        const sourceDocument = await resolveSourceDocument(resource);
        if (!sourceDocument) {
            return;
        }

        if (sourceDocument.uri.scheme !== "file") {
            vscode.window.showErrorMessage("Tonto diagram files can only be created from files on disk.");
            return;
        }

        await resolveTontoProject(sourceDocument.uri);
        const targetUri = vscode.Uri.file(namedViewPath(sourceDocument.uri.fsPath));
        const view = emptyViewFile();
        view.source = path.relative(path.dirname(targetUri.fsPath), sourceDocument.uri.fsPath).split(path.sep).join("/");
        view.content.scope = "workspace";
        const diagramContents = JSON.stringify(view, null, 2) + "\n";
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetUri.fsPath)));

        try {
            await vscode.workspace.fs.stat(targetUri);
        } catch {
            await vscode.workspace.fs.writeFile(targetUri, Buffer.from(diagramContents, "utf8"));
        }

        await vscode.commands.executeCommand("vscode.openWith", targetUri, "tonto.view.editor");
    });
}

async function resolveSourceDocument(resource?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
    if (resource) {
        const document = await vscode.workspace.openTextDocument(resource);
        if (document.languageId === "tonto") {
            return document;
        }
    }

    const activeDocument = vscode.window.activeTextEditor?.document;
    if (activeDocument?.languageId === "tonto") {
        return activeDocument;
    }

    vscode.window.showErrorMessage("Open a `.tonto` file to create the ontology diagram.");
    return undefined;
}

async function resolveTontoProject(sourceUri: vscode.Uri): Promise<{ rootPath: string; name: string }> {
    const sourceDirectory = path.dirname(sourceUri.fsPath);
    let currentDirectory = sourceDirectory;

    while (true) {
        const manifestUri = vscode.Uri.file(path.join(currentDirectory, MANIFEST_FILE_NAME));

        try {
            const manifestContents = await vscode.workspace.fs.readFile(manifestUri);
            return {
                rootPath: currentDirectory,
                name: getTontoDiagramProjectName(
                    Buffer.from(manifestContents).toString("utf8"),
                    path.basename(currentDirectory),
                ),
            };
        } catch {
            const parentDirectory = path.dirname(currentDirectory);
            if (parentDirectory === currentDirectory) {
                break;
            }
            currentDirectory = parentDirectory;
        }
    }

    return {
        rootPath: sourceDirectory,
        name: path.basename(sourceDirectory) || "Tonto",
    };
}
