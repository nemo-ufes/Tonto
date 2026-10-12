import { AstNode, MaybePromise } from "langium";
import { AstNodeHoverProvider } from "langium/lsp";
import { isClassDeclaration } from "../generated/ast.js";
import { TontoServices } from "../tonto-module.js";
import { buildClassDeclarationHoverMarkdown } from "./tonto-hover-content.js";
export class TontoHoverProvider extends AstNodeHoverProvider {
    constructor(services: TontoServices) {
        super(services);
    }

    protected override getAstNodeHoverContent(node: AstNode): MaybePromise<string | undefined> {
        if (isClassDeclaration(node)) {
            return buildClassDeclarationHoverMarkdown(node);
        }
        return undefined;
    }
}
