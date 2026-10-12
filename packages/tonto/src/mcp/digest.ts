import { AstUtils, type AstNode, type LangiumDocument, type Reference } from "langium";
import type { Range } from "vscode-languageserver-types";

import { isClassDeclaration, isContextModule, isDataType, isElementRelation, isGeneralizationSet,
  isIndividual, type Cardinality } from "../language/generated/ast.js";

export interface DigestIdentity { name?: string; type: string; qualifiedName?: string; uri: string; range?: Range }

/** Project semantic summary. References retain their spelling and their linked declaration identity. */
export function digestDocuments(documents: LangiumDocument[], targetUri: string) {
  const packageName = (node: AstNode): string | undefined => {
    let current: AstNode | undefined = node;
    while (current && !isContextModule(current)) current = current.$container;
    return current && isContextModule(current) ? current.name : undefined;
  };
  const identity = (node: AstNode): DigestIdentity => {
    const name = "name" in node && typeof node.name === "string" ? node.name : undefined;
    const pkg = packageName(node);
    return { name, type: node.$type, qualifiedName: name && pkg && !isContextModule(node) ? `${pkg}.${name}` : name,
      uri: AstUtils.getDocument(node).uri.toString(), range: node.$cstNode?.range };
  };
  const reference = (ref: Reference<AstNode> | undefined) => ref ? {
    text: ref.$refText, resolved: Boolean(ref.ref), target: ref.ref ? identity(ref.ref) : undefined,
  } : undefined;
  const cardinality = (value: Cardinality | undefined) => value ? {
    lowerBound: value.lowerBound, upperBound: value.upperBound ?? value.lowerBound,
  } : undefined;
  const nodes = documents.filter(document => document.uri.scheme === "file")
    .flatMap(document => AstUtils.streamAllContents(document.parseResult.value).toArray());
  return {
    packages: nodes.filter(isContextModule).map(node => ({ ...identity(node), global: node.isGlobal,
      imports: node.imports.map(item => ({ alias: item.packageAlias, ...reference(item.referencedModel) })) })),
    classes: nodes.filter(isClassDeclaration).map(node => ({ ...identity(node),
      stereotype: node.classElementType?.ontologicalCategory, natures: node.ontologicalNatures?.natures ?? [],
      attributes: node.attributes.map(attribute => ({ ...identity(attribute), type: reference(attribute.attributeTypeRef),
        cardinality: cardinality(attribute.cardinality), const: attribute.isConst, derived: attribute.isDerived,
        ordered: attribute.isOrdered })),
      generalizations: node.specializationEndurants.map(reference), instanceOf: reference(node.instanceOf),
    })),
    datatypes: nodes.filter(isDataType).map(node => ({ ...identity(node), stereotype: node.isEnum ? "enumeration" : "datatype",
      literals: node.elements.map(element => element.name),
      attributes: node.attributes.map(attribute => ({ ...identity(attribute), type: reference(attribute.attributeTypeRef), cardinality: cardinality(attribute.cardinality) })),
      generalizations: node.specializationEndurants.map(reference),
    })),
    associations: nodes.filter(isElementRelation).map(node => ({ ...identity(node), stereotype: node.relationType,
      source: node.firstEnd ? reference(node.firstEnd) : isClassDeclaration(node.$container) ? {
        text: node.$container.name, resolved: true, implicit: true, target: identity(node.$container),
      } : undefined,
      target: reference(node.secondEnd), sourceCardinality: cardinality(node.firstCardinality),
      targetCardinality: cardinality(node.secondCardinality),
      composition: node.isComposition || node.isCompositionInverted,
      aggregation: node.isAggregation || node.isAggregationInverted,
      inverseOf: reference(node.inverseEnd), generalization: reference(node.specializeRelation),
    })),
    generalizationSets: nodes.filter(isGeneralizationSet).map(node => ({ ...identity(node),
      complete: node.complete, disjoint: node.disjoint, general: reference(node.generalItem),
      specifics: node.specificItems.map(reference), categorizers: node.categorizerItems.map(reference),
    })),
    individuals: nodes.filter(isIndividual).map(node => ({ ...identity(node), instanceOf: reference(node.type) })),
    declarations: nodes.filter(node => AstUtils.getDocument(node).uri.toString() === targetUri && "name" in node)
      .map(node => ({ type: node.$type, name: (node as { name?: string }).name, range: node.$cstNode?.range as Range | undefined })),
  };
}
