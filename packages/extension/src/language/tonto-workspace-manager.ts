import { AstNode, DefaultWorkspaceManager, FileSystemNode, LangiumDocument, LangiumDocumentFactory } from "langium";
import { LangiumSharedServices } from "langium/lsp";
import { basicDataTypes } from "tonto-cli";

import { WorkspaceFolder } from "vscode-languageserver-protocol";
import { URI, Utils } from "vscode-uri";

export class TontoGrammarWorkspaceManager extends DefaultWorkspaceManager {
    private documentFactory: LangiumDocumentFactory;
    private basicDataTypes: string;

    constructor(services: LangiumSharedServices) {
        super(services);
        this.documentFactory = services.workspace.LangiumDocumentFactory;
        this.basicDataTypes = basicDataTypes;
    }

    /**
   * Loads built-in libraries into every Tonto Project
   */
    protected override async loadAdditionalDocuments(
        _folders: WorkspaceFolder[],
        _collector: (document: LangiumDocument<AstNode>) => void
    ): Promise<void> {
        const uri = URI.parse("builtin:///basicDataTypes.tonto");
        const document = this.documentFactory.fromString(this.basicDataTypes, uri);
        _collector(document);
    }

    override shouldIncludeEntry(entry: FileSystemNode): boolean {
        const name = Utils.basename(entry.uri);
        if (name.startsWith(".")) {
            return false;
        }

        if (entry.isDirectory) {
            return name !== "node_modules" && name !== "out";
        } else if (entry.isFile) {
            const extname = Utils.extname(entry.uri);
            return extname === ".tonto";
        }
        return false;
    }
}
