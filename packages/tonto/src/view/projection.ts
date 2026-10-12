import { AstUtils, type AstNode } from "langium";
import {
  type Model,
  type ClassDeclaration,
  type DataType,
  type ElementRelation,
  type RelationMetaAttributes,
  type Cardinality,
  isClassDeclaration,
  isDataType,
  isElementRelation,
  isGeneralizationSet,
} from "../language/generated/ast.js";
import { getModelContextModules } from "../language/utils/modelStatements.js";
import { tontoNatureUtils } from "../language/utils/tontoNatureUtils.js";
import {
  type ContentOptions,
  defaultContentOptions,
  type ViewModel,
  type ViewNode,
  type ViewEdge,
  type ViewRelation,
  type ViewRelationEnd,
  type SourceLocation,
  qualify,
  generalizationId,
  instantiationId,
  gensetId,
  RelationIds,
  fullTone,
  lightTone,
  DATATYPE_COLOR,
  UNRESOLVED_COLOR,
} from "./model/index.js";

/** Project only the current linked Tonto AST; redesigned grammar is never involved. */
export function projectSvgView(models: Model[], options: Partial<ContentOptions> = {}, focus?: string): ViewModel {
  const content = { ...defaultContentOptions, ...options };
  const packages = models.flatMap(getModelContextModules);
  const included = content.includedPackages
    ? new Set(content.includedPackages)
    : focus && content.scope === "file"
      ? new Set([focus])
      : undefined;
  const visible = packages.filter((pkg) => !included || included.has(pkg.name));
  const visibleNames = new Set(visible.map((pkg) => pkg.name));
  const hidden = new Set(content.hidden ?? []);
  const nodes = new Map<string, ViewNode>();
  const edges: ViewEdge[] = [];
  const view: ViewModel = { nodes: [], edges, groups: [], gensets: [] };
  const ids = new RelationIds();
  const relations = new Map<ElementRelation, ViewRelation>();
  const idOf = (node: ClassDeclaration | DataType) => qualify(node.$container.name, node.name);
  const add = (declaration: ClassDeclaration | DataType): string | undefined => {
    const id = idOf(declaration);
    const external = !visibleNames.has(declaration.$container.name);
    if (
      hidden.has(id) ||
      (external && !content.showExternalReferences) ||
      (isDataType(declaration) && !content.showDatatypes)
    )
      return undefined;
    if (nodes.has(id)) return id;
    const nature = isClassDeclaration(declaration) ? safeNature(declaration) : undefined;
    const palette = nature?.nature === "modes" ? "intrinsic-modes" : nature?.nature;
    const source = location(declaration);
    nodes.set(id, {
      id,
      name: declaration.name,
      package: declaration.$container.name,
      kind: isClassDeclaration(declaration) ? "class" : declaration.isEnum ? "enumeration" : "datatype",
      stereotype: isClassDeclaration(declaration)
        ? declaration.classElementType.ontologicalCategory
        : declaration.isEnum
          ? "enum"
          : "datatype",
      color: palette ? ((nature?.isKind ? fullTone[palette] : lightTone[palette]) ?? UNRESOLVED_COLOR) : DATATYPE_COLOR,
      isExternal: external,
      attributes: declaration.attributes.map((attribute) => ({
        name: attribute.name,
        type: attribute.attributeTypeRef.ref?.name ?? attribute.attributeTypeRef.$refText,
        cardinality: cardinality(attribute.cardinality),
        stereotypes: [],
        isOrdered: attribute.isOrdered,
        isConst: attribute.isConst,
        isDerived: attribute.isDerived,
      })),
      ...(isDataType(declaration) && declaration.isEnum
        ? { literals: declaration.elements.map((element) => element.name) }
        : {}),
      ...(nature ? { natures: { natures: [nature.nature] } } : {}),
      ...(source ? { source } : {}),
    });
    return id;
  };
  const push = (edge: ViewEdge) => {
    if (!hidden.has(edge.id)) edges.push(edge);
  };
  for (const pkg of visible)
    for (const declaration of pkg.declarations)
      if (isClassDeclaration(declaration) || isDataType(declaration)) add(declaration);
  const relation = (declaration: ElementRelation, owner?: ClassDeclaration) => {
    const sourceNode = declaration.firstEnd?.ref ?? owner;
    const targetNode = declaration.secondEnd.ref;
    if (
      (!isClassDeclaration(sourceNode) && !isDataType(sourceNode)) ||
      (!isClassDeclaration(targetNode) && !isDataType(targetNode))
    )
      return;
    const source = add(sourceNode),
      target = add(targetNode);
    if (!source || !target) return;
    const id = ids.next(source, target, declaration.relationType, declaration.name);
    const origin = location(declaration);
    if (declaration.relationType === "instantiation") {
      push({ id, kind: "instantiation", source, target, source_: origin });
      return;
    }
    const edge: ViewRelation = {
      id,
      kind: "relation",
      source,
      target,
      name: declaration.name,
      stereotype: declaration.relationType,
      sourceEnd: relationEnd(declaration.firstEndMetaAttributes, declaration.firstCardinality),
      targetEnd: relationEnd(declaration.secondEndMetaAttributes, declaration.secondCardinality),
      source_: origin,
      ...(declaration.isComposition || declaration.isAggregation
        ? { whole: "source" as const }
        : declaration.isCompositionInverted || declaration.isAggregationInverted
          ? { whole: "target" as const }
          : {}),
      composition: declaration.isComposition || declaration.isCompositionInverted,
    };
    relations.set(declaration, edge);
    push(edge);
  };
  for (const pkg of visible)
    for (const declaration of pkg.declarations) {
      if (isClassDeclaration(declaration)) {
        const source = add(declaration);
        if (!source) continue;
        for (const parent of declaration.specializationEndurants) {
          const target = parent.ref && add(parent.ref);
          if (target)
            push({
              id: generalizationId(source, target),
              kind: "generalization",
              source,
              target,
              source_: location(declaration),
            });
        }
        const target = declaration.instanceOf?.ref && add(declaration.instanceOf.ref);
        if (target)
          push({
            id: instantiationId(source, target),
            kind: "instantiation",
            source,
            target,
            source_: location(declaration),
          });
        declaration.references.forEach((ref) => relation(ref, declaration));
      } else if (isElementRelation(declaration)) relation(declaration);
    }
  // Only confirmed reciprocal inverse declarations are coalesced by the renderer.
  for (const [declaration, edge] of relations) {
    const inverse = declaration.inverseEnd?.ref;
    const other = inverse && relations.get(inverse);
    if (
      other &&
      inverse?.inverseEnd?.ref === declaration &&
      edge.source === other.target &&
      edge.target === other.source
    )
      edge.inverseOf = other.id;
  }
  if (content.showGensets)
    for (const pkg of visible)
      for (const declaration of pkg.declarations)
        if (isGeneralizationSet(declaration)) {
          const generalNode = declaration.generalItem.ref;
          if (!isClassDeclaration(generalNode)) continue;
          const general = add(generalNode);
          if (!general) continue;
          const specifics = declaration.specificItems.flatMap((ref) =>
            isClassDeclaration(ref.ref) ? [add(ref.ref)].filter((id): id is string => !!id) : []
          );
          const id = gensetId(pkg.name, declaration.name);
          if (hidden.has(id)) continue;
          view.gensets.push({
            id,
            name: declaration.name,
            general,
            specifics,
            complete: declaration.complete,
            disjoint: declaration.disjoint,
            source: location(declaration),
          });
          for (const edge of edges)
            if (edge.kind === "generalization" && edge.target === general && specifics.includes(edge.source))
              edge.genset = id;
        }
  view.nodes = [...nodes.values()];
  view.groups = packages
    .map((pkg) => ({
      id: `package:${pkg.name}`,
      name: pkg.name,
      nodes: view.nodes.filter((node) => node.package === pkg.name).map((node) => node.id),
    }))
    .filter((group) => group.nodes.length);
  return view;
}
function location(node: AstNode): SourceLocation | undefined {
  const range = node.$cstNode?.range;
  if (!range) return undefined;
  return {
    uri: AstUtils.getDocument(node).uri.toString(),
    line: range.start.line,
    character: range.start.character,
    endLine: range.end.line,
    endCharacter: range.end.character,
  };
}
function cardinality(card?: Cardinality): string | undefined {
  return card
    ? card.upperBound === undefined
      ? `${card.lowerBound}`
      : `${card.lowerBound}..${card.upperBound}`
    : undefined;
}
function relationEnd(meta?: RelationMetaAttributes, card?: Cardinality): ViewRelationEnd {
  return {
    role: meta?.endName,
    cardinality: cardinality(card),
    isConst: meta?.endMetaAttributes.some((item) => item.isConst),
    subsets: meta?.endMetaAttributes.find((item) => item.subsetRelation)?.subsetRelation?.$refText,
    redefines: meta?.endMetaAttributes.find((item) => item.redefinesRelation)?.redefinesRelation?.$refText,
  };
}

function safeNature(declaration: ClassDeclaration) {
  try {
    return tontoNatureUtils.getTontoNature(declaration);
  } catch {
    return undefined;
  }
}
