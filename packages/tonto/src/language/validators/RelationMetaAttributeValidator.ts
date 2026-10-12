import {
    type AstNodeDescription,
    type AstNodeLocator,
    AstUtils,
    type IndexManager,
    type LangiumDocuments,
    type ValidationAcceptor,
} from "langium";
import { type ElementRelation, type Model, type RelationMetaAttribute, isElementRelation } from "../generated/ast.js";
import type { TontoServices } from "../tonto-module.js";
import { getPrimaryContextModule } from "../utils/modelStatements.js";

type RelationOverrideProperty = "subsetRelation" | "redefinesRelation";

type RelationOverrideDescriptor = {
    keyword: "subsets" | "redefines";
    property: RelationOverrideProperty;
};

type VisibleRelationMatch = {
    displayName: string;
    relation: ElementRelation;
};

const RELATION_OVERRIDE_DESCRIPTORS: RelationOverrideDescriptor[] = [
    { keyword: "subsets", property: "subsetRelation" },
    { keyword: "redefines", property: "redefinesRelation" },
];

const RELATION_END_OVERRIDE_REQUIRES_NAMED_END = "relation-end-override-requires-named-end";
const SELF_REDEFINED_RELATION_END = "self_redefined_property";

export class RelationMetaAttributeValidator {
    private readonly astNodeLocator: AstNodeLocator;
    private readonly documents: LangiumDocuments;
    private readonly indexManager: IndexManager;

    constructor(private readonly services: TontoServices) {
        this.astNodeLocator = services.workspace.AstNodeLocator;
        this.documents = services.shared.workspace.LangiumDocuments;
        this.indexManager = services.shared.workspace.IndexManager;
    }

    checkRelationEndOverrideUsesNamedEnd = (metaAttribute: RelationMetaAttribute, accept: ValidationAcceptor): void => {
        for (const descriptor of RELATION_OVERRIDE_DESCRIPTORS) {
            this.checkSpecificRelationEndOverride(metaAttribute, descriptor, accept);
        }
    };

    checkRelationEndDoesNotRedefineItself = (
        metaAttribute: RelationMetaAttribute,
        accept: ValidationAcceptor
    ): void => {
        const redefinedRelationEnd = metaAttribute.redefinesRelation?.ref;
        if (!redefinedRelationEnd || redefinedRelationEnd !== metaAttribute.$container) {
            return;
        }

        accept("error", this.buildSelfRedefinitionMessage(metaAttribute), {
            node: metaAttribute,
            property: "redefinesRelation",
            code: SELF_REDEFINED_RELATION_END,
        });
    };

    private checkSpecificRelationEndOverride(
        metaAttribute: RelationMetaAttribute,
        descriptor: RelationOverrideDescriptor,
        accept: ValidationAcceptor
    ): void {
        const reference = metaAttribute[descriptor.property];
        const refText = reference?.$refText?.trim();
        if (!reference || !refText || reference.ref) {
            return;
        }

        const relationMatch = this.findVisibleRelation(metaAttribute, refText);
        if (!relationMatch) {
            return;
        }

        accept("error", this.buildNamedEndRequirementMessage(descriptor.keyword, refText, relationMatch), {
            node: metaAttribute,
            property: descriptor.property,
            code: RELATION_END_OVERRIDE_REQUIRES_NAMED_END,
        });
    }

    private buildNamedEndRequirementMessage(
        keyword: RelationOverrideDescriptor["keyword"],
        refText: string,
        relationMatch: VisibleRelationMatch
    ): string {
        const relationName = relationMatch.displayName;
        const namedEnds = this.getNamedEnds(relationMatch.relation);

        if (namedEnds.length > 0) {
            const endReferences = namedEnds.map((endName) => `"${relationName}.${endName}"`);
            const referencesPhrase = endReferences.length === 1
                ? endReferences[0]
                : `${endReferences.slice(0, -1).join(", ")} or ${endReferences[endReferences.length - 1]}`;

            return `"${keyword} ${refText}" references the relation "${relationName}", but ${keyword} must reference a named relation end, not a relation. Use ${referencesPhrase} instead.`;
        }

        return `"${keyword} ${refText}" references the relation "${relationName}", but ${keyword} must reference a named relation end, not a relation. Add an end name to "${relationName}" and reference "${relationName}.<endName>" instead.`;
    }

    private getNamedEnds(relation: ElementRelation): string[] {
        const endNames = [relation.firstEndMetaAttributes?.endName, relation.secondEndMetaAttributes?.endName]
            .filter((endName): endName is string => Boolean(endName));

        return [...new Set(endNames)];
    }

    private buildSelfRedefinitionMessage(metaAttribute: RelationMetaAttribute): string {
        const currentEndName = metaAttribute.$container.endName;
        const currentRelationName = this.services.references.QualifiedNameProvider.getQualifiedName(metaAttribute.$container.$container) ??
            metaAttribute.$container.$container.name ??
            "relation";
        const endLabel = currentEndName ?? `${currentRelationName} end`;

        return `Relation end "${endLabel}" cannot redefine itself.`;
    }

    private findVisibleRelation(node: RelationMetaAttribute, refText: string): VisibleRelationMatch | undefined {
        const normalizedReference = refText.toLocaleLowerCase();
        const visibleDescriptions = this.getVisibleRelationDescriptions(node);

        for (const description of visibleDescriptions) {
            if (description.name.toLocaleLowerCase() !== normalizedReference) {
                continue;
            }

            const relation = this.loadRelation(description);
            if (relation) {
                return {
                    displayName: this.getPreferredRelationReference(description, relation, visibleDescriptions),
                    relation,
                };
            }
        }

        return undefined;
    }

    private getPreferredRelationReference(
        matchingDescription: AstNodeDescription,
        relation: ElementRelation,
        visibleDescriptions: AstNodeDescription[]
    ): string {
        const matchingRelationDescriptions = visibleDescriptions
            .filter((description) =>
                description.documentUri.toString() === matchingDescription.documentUri.toString() &&
                description.path === matchingDescription.path
            )
            .map((description) => description.name)
            .filter((name) => name.includes("."))
            .sort((left, right) => left.length - right.length || left.localeCompare(right));

        return matchingRelationDescriptions[0] ??
            this.services.references.QualifiedNameProvider.getQualifiedName(relation) ??
            relation.name ??
            matchingDescription.name;
    }

    private getVisibleRelationDescriptions(node: RelationMetaAttribute): AstNodeDescription[] {
        const document = AstUtils.getDocument(node);
        const primaryContextModule = getPrimaryContextModule(document.parseResult.value as Model);
        const localDescriptions = primaryContextModule
            ? (document.localSymbols?.getStream(primaryContextModule).toArray() ?? [])
            : [];
        const globalDescriptions = Array.from(this.indexManager.allElements("ElementRelation"));
        const relationDescriptions = [...localDescriptions, ...globalDescriptions]
            .filter((description): description is AstNodeDescription => description.type === "ElementRelation");

        const uniqueDescriptions = new Map<string, AstNodeDescription>();
        for (const description of relationDescriptions) {
            const key = `${description.documentUri.toString()}::${description.path}::${description.name.toLocaleLowerCase()}`;
            uniqueDescriptions.set(key, description);
        }

        return [...uniqueDescriptions.values()];
    }

    private loadRelation(description: AstNodeDescription): ElementRelation | undefined {
        if (isElementRelation(description.node)) {
            return description.node;
        }

        const document = this.documents.getDocument(description.documentUri);
        if (!document) {
            return undefined;
        }

        const node = this.astNodeLocator.getAstNode(document.parseResult.value, description.path);
        return isElementRelation(node) ? node : undefined;
    }
}
