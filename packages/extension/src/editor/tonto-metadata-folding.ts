import * as vscode from "vscode";
import { CommandIds } from "../commands/commandIds.js";
import { findTontoMetadataBlocks } from "./tonto-metadata-blocks.js";

const TONTO_LANGUAGE_ID = "tonto";
const TONTO_CONFIGURATION_SECTION = "tonto";
const AUTO_FOLD_SETTING = "editor.autoFoldLabelsAndDescriptions";
const AUTO_FOLD_CONFIGURATION_KEY = `${TONTO_CONFIGURATION_SECTION}.${AUTO_FOLD_SETTING}`;
const FOLD_COMMAND = "editor.fold";
const UNFOLD_COMMAND = "editor.unfold";

type FoldingCommandArguments = {
  readonly selectionLines: number[];
};

type FoldingCommand = typeof FOLD_COMMAND | typeof UNFOLD_COMMAND;

export function registerTontoMetadataFolding(context: vscode.ExtensionContext): void {
  const processedDocuments = new Set<string>();
  const autoFoldedDocuments = new Set<string>();
  const syncingDocuments = new Set<string>();
  const pendingSyncDocuments = new Set<string>();

  const syncEditor = async (editor: vscode.TextEditor | undefined): Promise<void> => {
    if (!editor || editor.document.languageId !== TONTO_LANGUAGE_ID) {
      return;
    }

    const documentKey = editor.document.uri.toString();
    if (syncingDocuments.has(documentKey)) {
      pendingSyncDocuments.add(documentKey);
      return;
    }

    syncingDocuments.add(documentKey);

    try {
      const enabled = isAutoFoldEnabled(editor.document.uri);
      if (enabled) {
        if (processedDocuments.has(documentKey)) {
          return;
        }

        const selectionLines = getMetadataBlockStartLines(editor.document);
        if (selectionLines.length === 0) {
          processedDocuments.add(documentKey);
          return;
        }

        if (vscode.window.activeTextEditor !== editor) {
          return;
        }

        await executeFoldingCommand(FOLD_COMMAND, selectionLines);
        processedDocuments.add(documentKey);
        autoFoldedDocuments.add(documentKey);
        return;
      }

      if (!autoFoldedDocuments.has(documentKey)) {
        return;
      }

      const selectionLines = getMetadataBlockStartLines(editor.document);
      if (selectionLines.length > 0 && vscode.window.activeTextEditor === editor) {
        await executeFoldingCommand(UNFOLD_COMMAND, selectionLines);
      }

      processedDocuments.delete(documentKey);
      autoFoldedDocuments.delete(documentKey);
    } catch (error) {
      console.error("Failed to update Tonto label and description folding", error);
    } finally {
      syncingDocuments.delete(documentKey);
      if (pendingSyncDocuments.delete(documentKey) && vscode.window.activeTextEditor === editor) {
        void syncEditor(editor);
      }
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      CommandIds.toggleLabelAndDescriptionFolding,
      toggleMetadataFolding,
    ),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      void syncEditor(editor);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(AUTO_FOLD_CONFIGURATION_KEY)) {
        void syncEditor(vscode.window.activeTextEditor);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      const documentKey = document.uri.toString();
      processedDocuments.delete(documentKey);
      autoFoldedDocuments.delete(documentKey);
      syncingDocuments.delete(documentKey);
      pendingSyncDocuments.delete(documentKey);
    }),
    new vscode.Disposable(() => {
      processedDocuments.clear();
      autoFoldedDocuments.clear();
      syncingDocuments.clear();
      pendingSyncDocuments.clear();
    }),
  );

  void syncEditor(vscode.window.activeTextEditor);
}

function getMetadataBlockStartLines(document: vscode.TextDocument): number[] {
  return [...new Set(findTontoMetadataBlocks(document.getText()).map((block) => block.startLine))];
}

function isAutoFoldEnabled(resource?: vscode.Uri): boolean {
  return vscode.workspace
    .getConfiguration(TONTO_CONFIGURATION_SECTION, resource)
    .get<boolean>(AUTO_FOLD_SETTING, false);
}

async function toggleMetadataFolding(): Promise<void> {
  const resource = vscode.window.activeTextEditor?.document.uri;
  const configuration = vscode.workspace.getConfiguration(TONTO_CONFIGURATION_SECTION, resource);
  const currentlyEnabled = configuration.get<boolean>(AUTO_FOLD_SETTING, false);
  const target = hasWorkspace()
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  try {
    await configuration.update(AUTO_FOLD_SETTING, !currentlyEnabled, target);
    const state = currentlyEnabled ? "disabled" : "enabled";
    vscode.window.showInformationMessage(`Automatic Tonto label and description folding ${state}.`);
  } catch (error) {
    console.error("Failed to toggle Tonto label and description folding", error);
    vscode.window.showErrorMessage("Could not update automatic Tonto label and description folding.");
  }
}

function hasWorkspace(): boolean {
  return vscode.workspace.workspaceFile !== undefined
    || (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
}

async function executeFoldingCommand(command: FoldingCommand, selectionLines: number[]): Promise<void> {
  const arguments_: FoldingCommandArguments = { selectionLines };
  await vscode.commands.executeCommand(command, arguments_);
}
