import * as vscode from "vscode";
import { TontoDiagramEditorProvider } from "./tonto-diagram-editor-provider.js";

const TONTO_DIAGRAM_LANGUAGE_ID = "tontodiagram";

export function registerAutoOpenTontoDiagramPreview(): vscode.Disposable {
    const handledDocuments = new Set<string>();

    const maybeOpenPreview = async (editor: vscode.TextEditor | undefined): Promise<void> => {
        if (!editor) {
            return;
        }

        const { document } = editor;
        if (document.languageId !== TONTO_DIAGRAM_LANGUAGE_ID || document.uri.scheme !== "file") {
            return;
        }

        const documentKey = document.uri.toString();
        if (handledDocuments.has(documentKey) || hasDiagramPreviewOpen(document.uri)) {
            handledDocuments.add(documentKey);
            return;
        }

        handledDocuments.add(documentKey);

        try {
            await vscode.commands.executeCommand(
                "vscode.openWith",
                document.uri,
                TontoDiagramEditorProvider.viewType,
                vscode.ViewColumn.Beside,
            );
            await vscode.window.showTextDocument(document, editor.viewColumn);
        } catch (error) {
            handledDocuments.delete(documentKey);
            console.error("Failed to auto-open Tonto diagram preview", error);
        }
    };

    const disposable = vscode.Disposable.from(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            void maybeOpenPreview(editor);
        }),
        vscode.workspace.onDidCloseTextDocument((document) => {
            if (document.languageId === TONTO_DIAGRAM_LANGUAGE_ID) {
                handledDocuments.delete(document.uri.toString());
            }
        }),
        new vscode.Disposable(() => {
            handledDocuments.clear();
        }),
    );

    void maybeOpenPreview(vscode.window.activeTextEditor);

    return disposable;
}

function hasDiagramPreviewOpen(uri: vscode.Uri): boolean {
    const targetUri = uri.toString();

    return vscode.window.tabGroups.all.some((group) =>
        group.tabs.some((tab) => {
            const input = tab.input;
            return input instanceof vscode.TabInputCustom
                && input.uri.toString() === targetUri
                && input.viewType === TontoDiagramEditorProvider.viewType;
        }),
    );
}
