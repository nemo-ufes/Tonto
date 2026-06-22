import * as vscode from "vscode";

const COMMAND_ID = "tonto.diagram.createFile";

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

        const targetUri = sourceDocument.uri.with({
            path: sourceDocument.uri.path.replace(/\.tonto$/i, ".tontodiagram"),
        });

        const diagramContents = createDiagramTemplate(sourceDocument);

        try {
            await vscode.workspace.fs.stat(targetUri);
        } catch {
            await vscode.workspace.fs.writeFile(targetUri, Buffer.from(diagramContents, "utf8"));
        }

        await vscode.commands.executeCommand("vscode.openWith", targetUri, "tonto.diagram.editor");
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

    vscode.window.showErrorMessage("Open a `.tonto` file to scaffold a diagram.");
    return undefined;
}

function createDiagramTemplate(document: vscode.TextDocument): string {
    const fileName = document.uri.path.split("/").pop()?.replace(/\.tonto$/i, "") ?? "diagram";
    const title = toTitleCase(fileName);

    return `diagram "${title} Diagram" {
  direction TB
  stereotypes true
  attributes true
  external false
  datatypes true
}
`;
}

function toTitleCase(value: string): string {
    return value
        .split(/[-_.]/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
}
