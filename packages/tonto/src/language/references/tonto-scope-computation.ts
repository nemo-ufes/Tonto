
import {
    AstNode,
    AstNodeDescription,
    AstUtils,
    DefaultScopeComputation,
    interruptAndCheck,
    LangiumDocument,
    MultiMap,
    LocalSymbols,
} from "langium";
import { CancellationToken } from "vscode-jsonrpc";
import {
    ClassDeclaration,
    ContextModule,
    DataType,
    ElementRelation,
    GeneralizationSet,
    isClassDeclaration,
    isContextModule,
    isDataType,
    isElementRelation,
    isGeneralizationSet,
    Individual,
    isIndividual,
    Model,
    RelationMetaAttributes,
} from "../generated/ast.js";
import { getModelImports, getPrimaryContextModule } from "../utils/modelStatements.js";
import { TontoServices } from "../tonto-module.js";
import { TontoQualifiedNameProvider } from "./tonto-name-provider.js";

export class TontoScopeComputation extends DefaultScopeComputation {
    private readonly qualifiedNameProvider: TontoQualifiedNameProvider;

    constructor(services: TontoServices) {
        super(services);
        this.qualifiedNameProvider = services.references.QualifiedNameProvider;
    }

    /**
     * Publishes globally visible symbols for the current document.
     *
     * Non-global context modules are exported so `import package.name` can resolve.
     * Declarations inside global context modules are exported by both simple and
     * qualified names so they remain accessible without imports.
     */
    override async collectExportedSymbols(
        document: LangiumDocument,
        cancelToken = CancellationToken.None
    ): Promise<AstNodeDescription[]> {
        const descriptions: AstNodeDescription[] = [];
        for (const childNode of AstUtils.streamAllContents(document.parseResult.value)) {
            await interruptAndCheck(cancelToken);
            this.addExportedSymbol(childNode, descriptions, document);
        }
        return descriptions;
    }

    /**
     * Precomputes the symbols visible from the current document.
     *
     * Imported context modules are processed first so their declarations become
     * visible at the primary context module level alongside local declarations.
     */
    override async collectLocalSymbols(
        document: LangiumDocument<AstNode>,
        cancelToken = CancellationToken.None
    ): Promise<LocalSymbols> {
        const model = document.parseResult.value as Model;
        const scopes = new MultiMap<AstNode, AstNodeDescription>();
        const primaryContextModule = getPrimaryContextModule(model);

        if (!primaryContextModule) {
            return scopes;
        }

        const importedContextModules = new Set<ContextModule>();
        for (const importItem of getModelImports(model)) {
            const importedContextModule = importItem.referencedModel?.ref;
            if (importedContextModule && !importedContextModules.has(importedContextModule)) {
                importedContextModules.add(importedContextModule);
                await this.processContainer(importedContextModule, scopes, cancelToken);
            }
        }
        await this.processContainer(primaryContextModule, scopes, cancelToken);

        const importedDescriptions: AstNodeDescription[] = [];
        scopes.forEach((description, key) => {
            if (isContextModule(key) && key !== primaryContextModule) {
                importedDescriptions.push(description);
            }
        });

        if (importedDescriptions.length > 0) {
            scopes.addAll(primaryContextModule, importedDescriptions);
        }

        return scopes;
    }

    protected override addExportedSymbol(node: AstNode, exports: AstNodeDescription[], document: LangiumDocument): void {
        if (isElementRelation(node)) {
            const contextModule = this.findOwningContextModule(node);
            if (contextModule?.isGlobal) {
                this.addRelationDescriptions(exports, node, document);
            }
            return;
        }

        if (this.isGlobalContextModuleDeclaration(node)) {
            this.addSimpleAndQualifiedDescriptions(exports, node, document);
            return;
        }

        if (isContextModule(node) && !node.isGlobal) {
            this.addDescription(exports, node, node.name, document);
        }
    }

    private async processContainer(
        container: ContextModule,
        scopes: MultiMap<AstNode, AstNodeDescription>,
        cancelToken: CancellationToken
    ): Promise<void> {
        const localDescriptions: AstNodeDescription[] = [];
        for (const declaration of container.declarations) {
            await interruptAndCheck(cancelToken);
            this.processDeclaration(declaration, localDescriptions);
        }
        scopes.addAll(container, localDescriptions);
    }

    private processDeclaration(
        declaration: ContextModule["declarations"][number],
        descriptions: AstNodeDescription[]
    ): void {
        if (isElementRelation(declaration)) {
            this.addRelationDescriptions(descriptions, declaration);
            return;
        }

        if (!this.isLocalScopeDeclaration(declaration)) {
            return;
        }

        this.addSimpleAndQualifiedDescriptions(descriptions, declaration);

        if (isClassDeclaration(declaration)) {
            for (const relation of declaration.references) {
                this.addRelationDescriptions(descriptions, relation);
            }
        } else if (isDataType(declaration)) {
            for (const enumElement of declaration.elements) {
                this.addSimpleAndQualifiedDescriptions(descriptions, enumElement);
            }
        }
    }

    private addRelationDescriptions(
        descriptions: AstNodeDescription[],
        relation: ElementRelation,
        document?: LangiumDocument
    ): void {
        this.addSimpleAndQualifiedDescriptions(descriptions, relation, document);

        const legacyQualifiedRelationName = this.getLegacyQualifiedRelationName(relation);
        const qualifiedRelationName = this.qualifiedNameProvider.getQualifiedName(relation);
        if (legacyQualifiedRelationName && legacyQualifiedRelationName !== qualifiedRelationName) {
            this.addDescription(descriptions, relation, legacyQualifiedRelationName, document);
        }

        this.addRelationEndDescriptions(descriptions, relation, document);
    }

    private addRelationEndDescriptions(
        descriptions: AstNodeDescription[],
        relation: ElementRelation,
        document?: LangiumDocument
    ): void {
        const relationName = this.qualifiedNameProvider.getQualifiedName(relation);
        const legacyRelationName = this.getLegacyQualifiedRelationName(relation);

        this.addRelationEndDescription(descriptions, relation.firstEndMetaAttributes, relationName, legacyRelationName, document);
        this.addRelationEndDescription(descriptions, relation.secondEndMetaAttributes, relationName, legacyRelationName, document);
    }

    private addRelationEndDescription(
        descriptions: AstNodeDescription[],
        relationEnd: RelationMetaAttributes | undefined,
        relationName: string | undefined,
        legacyRelationName: string | undefined,
        document?: LangiumDocument
    ): void {
        const endName = relationEnd?.endName;
        if (!relationEnd || !endName) {
            return;
        }

        this.addDescription(descriptions, relationEnd, endName, document);
        if (relationName) {
            this.addDescription(descriptions, relationEnd, `${relationName}.${endName}`, document);
        }
        if (legacyRelationName && legacyRelationName !== relationName) {
            this.addDescription(descriptions, relationEnd, `${legacyRelationName}.${endName}`, document);
        }
    }

    private addSimpleAndQualifiedDescriptions(
        descriptions: AstNodeDescription[],
        node: AstNode,
        document?: LangiumDocument
    ): void {
        const simpleName = this.qualifiedNameProvider.getName(node);
        this.addDescription(descriptions, node, simpleName, document);

        const qualifiedName = this.qualifiedNameProvider.getQualifiedName(node);
        if (qualifiedName && qualifiedName !== simpleName) {
            this.addDescription(descriptions, node, qualifiedName, document);
        }
    }

    private addDescription(
        descriptions: AstNodeDescription[],
        node: AstNode,
        name: string | undefined,
        document?: LangiumDocument
    ): void {
        if (!name) {
            return;
        }
        descriptions.push(this.descriptions.createDescription(node, name, document));
    }

    private getLegacyQualifiedRelationName(relation: ElementRelation): string | undefined {
        if (!relation.name) {
            return undefined;
        }

        const parent = relation.$container;
        if (isClassDeclaration(parent)) {
            return `${parent.name}.${relation.name}`;
        }
        if (isContextModule(parent)) {
            return relation.firstEnd?.$refText ? `${relation.firstEnd.$refText}.${relation.name}` : relation.name;
        }
        return relation.name;
    }

    private findOwningContextModule(node: AstNode): ContextModule | undefined {
        let currentNode: AstNode | undefined = node;
        while (currentNode && !isContextModule(currentNode)) {
            currentNode = currentNode.$container;
        }
        return currentNode;
    }

    private isGlobalContextModuleDeclaration(
        node: AstNode
    ): node is ClassDeclaration | DataType | GeneralizationSet | Individual {
        return (
            (isClassDeclaration(node) || isDataType(node) || isGeneralizationSet(node) || isIndividual(node)) &&
            isContextModule(node.$container) &&
            node.$container.isGlobal
        );
    }

    private isLocalScopeDeclaration(
        node: ContextModule["declarations"][number]
    ): node is ClassDeclaration | DataType | GeneralizationSet | Individual {
        return isClassDeclaration(node) || isDataType(node) || isGeneralizationSet(node) || isIndividual(node);
    }
}
