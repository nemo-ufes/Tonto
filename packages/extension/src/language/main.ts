import { Module } from "langium";
import { addDiagramHandler } from "langium-sprotty";
import { PartialLangiumSharedServices, startLanguageServer } from "langium/lsp";
import { NodeFileSystem } from "langium/node";
import { TontoLanguageServer, TontoSharedServices, createTontoServices } from "tonto-cli";
import { ProposedFeatures, createConnection } from "vscode-languageserver/node";

import { TontoGrammarWorkspaceManager } from "./tonto-workspace-manager.js";

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

type ExtensionSharedModule = Module<TontoSharedServices, PartialLangiumSharedServices>;
type StartLanguageServerServices = Parameters<typeof startLanguageServer>[0];
type DiagramHandlerServices = Parameters<typeof addDiagramHandler>[1];

export const TontoSharedModule: ExtensionSharedModule = {
    workspace: {
        WorkspaceManager: (services) => new TontoGrammarWorkspaceManager(services as unknown as ConstructorParameters<typeof TontoGrammarWorkspaceManager>[0]),
    },
    lsp: {
        LanguageServer: (services) => new TontoLanguageServer(services as unknown as ConstructorParameters<typeof TontoLanguageServer>[0]),
    }
};

// Inject the shared services and language-specific services
const { shared } = createTontoServices({
    connection,
    ...NodeFileSystem
}, TontoSharedModule as unknown as Parameters<typeof createTontoServices>[1]);

// Start the language server with the shared services
startLanguageServer(shared as unknown as StartLanguageServerServices);
addDiagramHandler(connection, shared as unknown as DiagramHandlerServices);
