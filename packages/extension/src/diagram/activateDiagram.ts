import {
  createFileUri,
  registerDefaultCommands, registerLspEditCommands, registerTextEditorSync, SprottyDiagramIdentifier, WebviewContainer, WebviewEndpoint
} from "sprotty-vscode";
import { addLspLabelEditActionHandler, addWorkspaceEditActionHandler } from "sprotty-vscode/lib/lsp/editing/index.js";
import { LspSprottyEditorProvider, LspSprottyViewProvider, LspWebviewEndpoint, LspWebviewPanelManager } from "sprotty-vscode/lib/lsp/index.js";
import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node.js";
import { Messenger } from "vscode-messenger";
import { createWebviewHtml as doCreateWebviewHtml } from "./webview-utils.js";

export function activateDiagram(
  context: vscode.ExtensionContext,
  languageClient: LanguageClient): void {
  const diagramMode = process.env.DIAGRAM_MODE || "panel";
  if (!["panel", "editor", "view"].includes(diagramMode)) {
    throw new Error("The environment variable 'DIAGRAM_MODE' must be set to 'panel', 'editor' or 'view'.");
  }
  const extensionPath = context.extensionUri.fsPath;
  const localResourceRoots = [createFileUri(extensionPath, "pack", "webview")];
  const createWebviewHtml = (identifier: SprottyDiagramIdentifier, container: WebviewContainer) => doCreateWebviewHtml(identifier, container, {
    scriptUri: createFileUri(extensionPath, "pack", "webview", "sprotty.js"),
    cssUri: createFileUri(extensionPath, "pack", "webview", "style.css")
  });
  const configureEndpoint = (endpoint: WebviewEndpoint) => {
    addWorkspaceEditActionHandler(endpoint as LspWebviewEndpoint);
    addLspLabelEditActionHandler(endpoint as LspWebviewEndpoint);
  };

  if (diagramMode === "panel") {
    // Set up webview panel manager for freestyle webviews
    const webviewPanelManager = new LspWebviewPanelManager({
      extensionUri: context.extensionUri,
      defaultDiagramType: "tonto",
      languageClient,
      supportedFileExtensions: [".tonto"],
      localResourceRoots,
      createWebviewHtml,
      configureEndpoint
    });
    registerDefaultCommands(webviewPanelManager, context, { extensionPrefix: "tonto" });
    registerLspEditCommands(webviewPanelManager, context, { extensionPrefix: "tonto" });
  }

  if (diagramMode === "editor") {
    // Set up webview editor associated with file type
    const webviewEditorProvider = new LspSprottyEditorProvider({
      extensionUri: context.extensionUri,
      viewType: "tonto",
      languageClient,
      supportedFileExtensions: [".tonto"],
      localResourceRoots,
      createWebviewHtml,
      configureEndpoint
    });
    context.subscriptions.push(
      vscode.window.registerCustomEditorProvider("tonto", webviewEditorProvider, {
        webviewOptions: { retainContextWhenHidden: true }
      })
    );
    registerDefaultCommands(webviewEditorProvider, context, { extensionPrefix: "tonto" });
    registerLspEditCommands(webviewEditorProvider, context, { extensionPrefix: "tonto" });
  }

  if (diagramMode === "view") {
    // Set up webview view shown in the side panel
    const webviewViewProvider = new LspSprottyViewProvider({
      extensionUri: context.extensionUri,
      viewType: "tonto",
      languageClient,
      supportedFileExtensions: [".tonto"],
      openActiveEditor: true,
      messenger: new Messenger({ ignoreHiddenViews: false }),
      localResourceRoots,
      createWebviewHtml
    });
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider("tonto", webviewViewProvider, {
        webviewOptions: { retainContextWhenHidden: true }
      })
    );
    registerDefaultCommands(webviewViewProvider, context, { extensionPrefix: "tonto" });
    registerTextEditorSync(webviewViewProvider, context);
  }
}
