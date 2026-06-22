import {
    Attribute,
    ClassDeclaration,
    ContextModule,
    DataType,
    ElementRelation,
    isClassDeclaration,
    isDataType,
    isElementRelation
} from "../language/generated/ast.js";
import { isAntiRigidStereotype, isRigidStereotype, isSemiRigidStereotype } from "../language/models/StereotypeUtils.js";
import { isNonSortalOntoCategory } from "../language/models/OntologicalCategory.js";
import { TontoNatureResult, tontoNatureUtils } from "../language/utils/tontoNatureUtils.js";
import {
    buildTontoDiagramWorkspaceContext,
    loadTontoDiagramWorkspace,
    resolveRequestedPackages,
    resolveTontoDiagramSourcePath
} from "./context.js";
import {
    TontoDiagramAttribute,
    TontoDiagramConnector,
    TontoDiagramEdge,
    TontoDiagramGraph,
    TontoDiagramIssue,
    TontoDiagramNode,
    TontoDiagramPaletteToken,
    TontoDiagramRigidity,
    TontoDiagramSpec
} from "./types.js";

const DEFAULT_NODE_WIDTH = 260;
const HEADER_HEIGHT = 58;
const ROW_HEIGHT = 24;
const NODE_PADDING = 24;

export async function buildTontoDiagramGraph(
    spec: TontoDiagramSpec,
    diagramPath: string
): Promise<TontoDiagramGraph> {
    const workspace = await loadTontoDiagramWorkspace(spec.source, diagramPath);
    const workspaceContext = buildTontoDiagramWorkspaceContext(
        workspace.models,
        workspace.sourcePath ?? workspace.projectRoot,
    );
    const graphIssues: TontoDiagramIssue[] = [];

    const requestedPackages = spec.imports.length > 0
        ? spec.imports
        : workspaceContext.packages.map((pkg) => pkg.name);
    const resolvedPackages = resolveRequestedPackages(workspace.models, requestedPackages);

    for (const missing of resolvedPackages.missing) {
        graphIssues.push({
            severity: "warning",
            message: `Imported package \`${missing}\` could not be resolved.`,
        });
    }

    const visiblePackageNames = new Set(resolvedPackages.packages.map((contextModule) => contextModule.name));

    const nodes = collectNodes(resolvedPackages.packages, spec.filter.datatypes);
    const edgeCollection = collectEdges(resolvedPackages.packages, visiblePackageNames, spec.filter.external);
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    for (const externalNode of edgeCollection.externalNodes) {
        if (!nodesById.has(externalNode.id)) {
            nodesById.set(externalNode.id, externalNode);
        }
    }

    const edges = edgeCollection.edges;
    nodes.splice(0, nodes.length, ...nodesById.values());

    if (spec.filter.include.length > 0 || spec.filter.relations.length > 0) {
        applyVisibilityFilter(nodes, edges, spec.filter.include, spec.filter.relations, graphIssues);
    }

    const layoutTargets = computeHierarchicalLayoutByPackage(nodes, edges);

    const savedLayouts = resolveSavedLayouts(spec, nodes);

    for (const node of nodes) {
        const savedLayout = savedLayouts.get(node.id);
        const fallbackLayout = layoutTargets.get(node.id);
        const position = savedLayout ?? fallbackLayout ?? { x: node.position.x, y: node.position.y };
        node.position = position;
    }

    return {
        title: spec.title,
        source: workspace.sourcePath,
        projectRoot: workspace.projectRoot,
        packages: [...visiblePackageNames].sort((left, right) => left.localeCompare(right)),
        imports: [...requestedPackages].sort((left, right) => left.localeCompare(right)),
        filter: spec.filter,
        presentation: spec.presentation,
        viewport: spec.viewport,
        nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
        edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
        workspace: workspaceContext,
        issues: graphIssues,
    };
}

export { resolveTontoDiagramSourcePath as resolveDiagramSourcePath };

function collectNodes(contextModules: ContextModule[], includeDatatypes: boolean): TontoDiagramNode[] {
    const nodes = new Map<string, TontoDiagramNode>();

    for (const contextModule of contextModules) {
        for (const declaration of contextModule.declarations) {
            if (isClassDeclaration(declaration)) {
                const node = createClassNode(declaration, false);
                nodes.set(node.id, node);
            } else if (includeDatatypes && isDataType(declaration)) {
                const node = createDatatypeNode(declaration, false);
                nodes.set(node.id, node);
            }
        }
    }

    return [...nodes.values()];
}

function collectEdges(
    contextModules: ContextModule[],
    visiblePackageNames: Set<string>,
    includeExternal: boolean
): { edges: TontoDiagramEdge[]; externalNodes: TontoDiagramNode[] } {
    const edges: TontoDiagramEdge[] = [];
    const externalNodes = new Map<string, TontoDiagramNode>();

    for (const contextModule of contextModules) {
        for (const declaration of contextModule.declarations) {
            if (isClassDeclaration(declaration)) {
                for (const relation of declaration.references) {
                    const edge = createRelationEdge(relation, declaration, visiblePackageNames, includeExternal);
                    if (edge) {
                        edges.push(edge.edge);
                        for (const externalNode of edge.externalNodes) {
                            externalNodes.set(externalNode.id, externalNode);
                        }
                    }
                }

                for (const specialization of declaration.specializationEndurants) {
                    const target = specialization.ref;
                    if (!target) {
                        continue;
                    }

                    const targetPackageName = target.$container.name;
                    const isExternal = !visiblePackageNames.has(targetPackageName);
                    if (isExternal && !includeExternal) {
                        continue;
                    }

                    if (isExternal) {
                        externalNodes.set(getNodeId(targetPackageName, target.name), createClassNode(target, true));
                    }

                    edges.push({
                        id: `${getNodeId(declaration.$container.name, declaration.name)}::specializes::${getNodeId(targetPackageName, target.name)}`,
                        kind: "specialization",
                        source: getNodeId(declaration.$container.name, declaration.name),
                        target: getNodeId(targetPackageName, target.name),
                    });
                }
            } else if (isElementRelation(declaration)) {
                const edge = createRelationEdge(declaration, undefined, visiblePackageNames, includeExternal);
                if (edge) {
                    edges.push(edge.edge);
                    for (const externalNode of edge.externalNodes) {
                        externalNodes.set(externalNode.id, externalNode);
                    }
                }
            }
        }
    }

    return {
        edges: dedupeEdges(edges),
        externalNodes: [...externalNodes.values()].filter((node) => node.appearance.external),
    };
}

function createRelationEdge(
    relation: ElementRelation,
    owningDeclaration: ClassDeclaration | undefined,
    visiblePackageNames: Set<string>,
    includeExternal: boolean
): { edge: TontoDiagramEdge; externalNodes: TontoDiagramNode[] } | undefined {
    const sourceElement = relation.firstEnd?.ref ?? owningDeclaration;
    const targetElement = relation.secondEnd.ref;

    if (!sourceElement || !targetElement) {
        return undefined;
    }

    if ((!isClassDeclaration(sourceElement) && !isDataType(sourceElement)) || (!isClassDeclaration(targetElement) && !isDataType(targetElement))) {
        return undefined;
    }

    const sourcePackageName = sourceElement.$container.name;
    const targetPackageName = targetElement.$container.name;
    const sourceVisible = visiblePackageNames.has(sourcePackageName);
    const targetVisible = visiblePackageNames.has(targetPackageName);
    const isExternal = !sourceVisible || !targetVisible;
    if (isExternal && !includeExternal) {
        return undefined;
    }

    const edgeId = `${getNodeId(sourcePackageName, sourceElement.name)}::${relation.name ?? relation.relationType ?? "unnamed"}::${getNodeId(targetPackageName, targetElement.name)}`;
    const edge: TontoDiagramEdge = {
        id: edgeId,
        kind: "relation",
        source: getNodeId(sourcePackageName, sourceElement.name),
        target: getNodeId(targetPackageName, targetElement.name),
        label: relation.name,
        stereotype: relation.relationType,
        connector: getConnector(relation),
        sourceCardinality: formatCardinality(relation.firstCardinality),
        targetCardinality: formatCardinality(relation.secondCardinality),
        sourceEnd: relation.firstEndMetaAttributes?.endName,
        targetEnd: relation.secondEndMetaAttributes?.endName,
    };

    const externalNodes: TontoDiagramNode[] = [];

    if (!sourceVisible) {
        externalNodes.push(
            isClassDeclaration(sourceElement)
                ? createClassNode(sourceElement, true)
                : createDatatypeNode(sourceElement, true)
        );
    }

    if (!targetVisible) {
        externalNodes.push(
            isClassDeclaration(targetElement)
                ? createClassNode(targetElement, true)
                : createDatatypeNode(targetElement, true)
        );
    }

    return { edge, externalNodes };
}

function createClassNode(classDeclaration: ClassDeclaration, external: boolean): TontoDiagramNode {
    const stereotype = classDeclaration.classElementType.ontologicalCategory;
    const nature = tontoNatureUtils.getTontoNature(classDeclaration);
    const attributes = classDeclaration.attributes.map(formatAttribute);
    const size = computeNodeSize(classDeclaration.name, attributes);

    return {
        id: getNodeId(classDeclaration.$container.name, classDeclaration.name),
        specifier: getNodeSpecifier(classDeclaration.$container.name, classDeclaration.name, external),
        label: classDeclaration.name,
        module: classDeclaration.$container.name,
        stereotype,
        kind: "class",
        appearance: {
            palette: normalizePaletteToken(nature),
            rigidity: getRigidity(stereotype),
            accent: isNonSortalOntoCategory(stereotype) ? "non-sortal" : "sortal",
            external,
        },
        attributes,
        isEnum: false,
        position: { x: 0, y: 0 },
        size,
    };
}

function createDatatypeNode(datatype: DataType, external: boolean): TontoDiagramNode {
    const attributes = datatype.isEnum
        ? datatype.elements.map((element) => ({
            name: element.name,
            type: "enum",
        }))
        : datatype.attributes.map(formatAttribute);
    const size = computeNodeSize(datatype.name, attributes);

    return {
        id: getNodeId(datatype.$container.name, datatype.name),
        specifier: getNodeSpecifier(datatype.$container.name, datatype.name, external),
        label: datatype.name,
        module: datatype.$container.name,
        stereotype: datatype.isEnum ? "enum" : "datatype",
        kind: "datatype",
        appearance: {
            palette: "none",
            rigidity: "unknown",
            accent: "neutral",
            external,
        },
        attributes,
        isEnum: datatype.isEnum,
        position: { x: 0, y: 0 },
        size,
    };
}

function formatAttribute(attribute: Attribute): TontoDiagramAttribute {
    return {
        name: attribute.name,
        type: attribute.attributeTypeRef.ref?.name ?? attribute.attributeTypeRef.$refText ?? "Unknown",
        cardinality: formatCardinality(attribute.cardinality),
    };
}

function computeNodeSize(label: string, attributes: TontoDiagramAttribute[]): TontoDiagramNode["size"] {
    const widestAttribute = attributes.reduce((current, attribute) => {
        const attributeLabel = attribute.cardinality
            ? `${attribute.name}: ${attribute.type} ${attribute.cardinality}`
            : `${attribute.name}: ${attribute.type}`;
        return Math.max(current, attributeLabel.length);
    }, label.length);

    const width = Math.max(DEFAULT_NODE_WIDTH, widestAttribute * 8 + NODE_PADDING * 2);
    const height = HEADER_HEIGHT + Math.max(attributes.length, 1) * ROW_HEIGHT + NODE_PADDING;

    return {
        width,
        height,
    };
}

function normalizePaletteToken(nature: TontoNatureResult): TontoDiagramPaletteToken {
    return nature.nature;
}

function getRigidity(stereotype: string): TontoDiagramRigidity {
    if (isRigidStereotype(stereotype)) {
        return "rigid";
    }
    if (isAntiRigidStereotype(stereotype)) {
        return "anti-rigid";
    }
    if (isSemiRigidStereotype(stereotype)) {
        return "semi-rigid";
    }
    return "unknown";
}

function getConnector(relation: ElementRelation): TontoDiagramConnector {
    if (relation.isComposition) {
        return "composition";
    }
    if (relation.isCompositionInverted) {
        return "composition-inverted";
    }
    if (relation.isAggregation) {
        return "aggregation";
    }
    if (relation.isAggregationInverted) {
        return "aggregation-inverted";
    }
    return "association";
}

function formatCardinality(cardinality: Attribute["cardinality"] | ElementRelation["firstCardinality"]): string | undefined {
    if (!cardinality) {
        return undefined;
    }

    if (cardinality.upperBound === undefined) {
        return `[${cardinality.lowerBound}]`;
    }

    return `[${cardinality.lowerBound}..${cardinality.upperBound}]`;
}

function getNodeId(moduleName: string, elementName: string): string {
    return `${moduleName}.${elementName}`;
}

function getNodeSpecifier(moduleName: string, elementName: string, external: boolean): string {
    if (external) {
        return `${moduleName}.${elementName}`;
    }
    return elementName;
}

function dedupeEdges(edges: TontoDiagramEdge[]): TontoDiagramEdge[] {
    const seen = new Map<string, TontoDiagramEdge>();

    for (const edge of edges) {
        seen.set(edge.id, edge);
    }

    return [...seen.values()];
}

function applyVisibilityFilter(
    nodes: TontoDiagramNode[],
    edges: TontoDiagramEdge[],
    include: string[],
    relationFilters: string[],
    issues: TontoDiagramIssue[]
): void {
    const nodeFilterSet = new Set(include);
    const relationFilterSet = new Set(relationFilters);
    const includedNodeIds = new Set<string>();
    const includedEdgeIds = new Set<string>();

    for (const node of nodes) {
        if (matchesNodeFilter(node, nodeFilterSet)) {
            includedNodeIds.add(node.id);
        }
    }

    for (const edge of edges) {
        const edgeMatches = matchesEdgeFilter(edge, nodeFilterSet) || matchesEdgeFilter(edge, relationFilterSet);
        if (edgeMatches) {
            includedEdgeIds.add(edge.id);
            includedNodeIds.add(edge.source);
            includedNodeIds.add(edge.target);
        }
    }

    if (includedNodeIds.size === 0 && includedEdgeIds.size === 0) {
        issues.push({
            severity: "warning",
            message: "Diagram filters did not match any visible element.",
        });
        return;
    }

    for (const edge of edges) {
        if (includedNodeIds.has(edge.source) && includedNodeIds.has(edge.target)) {
            includedEdgeIds.add(edge.id);
        }
    }

    const filteredNodes = nodes.filter((node) => includedNodeIds.has(node.id));
    const filteredEdges = edges.filter((edge) => includedEdgeIds.has(edge.id));

    nodes.splice(0, nodes.length, ...filteredNodes);
    edges.splice(0, edges.length, ...filteredEdges);

    for (const includeEntry of nodeFilterSet) {
        const matched = filteredNodes.some((node) => matchesNodeFilter(node, new Set([includeEntry])))
            || filteredEdges.some((edge) => matchesEdgeFilter(edge, new Set([includeEntry])));
        if (!matched) {
            issues.push({
                severity: "warning",
                message: `Include entry \`${includeEntry}\` did not resolve to a visible element.`,
            });
        }
    }

    for (const relationEntry of relationFilterSet) {
        const matched = filteredEdges.some((edge) => matchesEdgeFilter(edge, new Set([relationEntry])));
        if (!matched) {
            issues.push({
                severity: "warning",
                message: `Relation entry \`${relationEntry}\` did not resolve to a visible relation.`,
            });
        }
    }
}

function matchesNodeFilter(node: TontoDiagramNode, filters: Set<string>): boolean {
    return filters.has(node.label) || filters.has(node.id) || filters.has(node.specifier);
}

function matchesEdgeFilter(edge: TontoDiagramEdge, filters: Set<string>): boolean {
    const candidates = new Set<string>([
        edge.id,
        edge.kind === "specialization" ? "specializes" : "",
        edge.label ?? "",
        edge.stereotype ?? "",
        `${edge.source}->${edge.target}`,
    ]);

    return [...candidates].some((candidate) => candidate.length > 0 && filters.has(candidate));
}

function resolveSavedLayouts(spec: TontoDiagramSpec, nodes: TontoDiagramNode[]): Map<string, { x: number; y: number }> {
    const layouts = new Map<string, { x: number; y: number }>();
    const lookup = new Map<string, string>();

    for (const node of nodes) {
        lookup.set(node.id, node.id);
        lookup.set(node.label, node.id);
        lookup.set(node.specifier, node.id);
    }

    for (const layout of spec.nodes) {
        const resolvedId = lookup.get(layout.target);
        if (!resolvedId) {
            continue;
        }
        layouts.set(resolvedId, { x: layout.x, y: layout.y });
    }

    return layouts;
}

function computeHierarchicalLayoutByPackage(
    nodes: TontoDiagramNode[],
    edges: TontoDiagramEdge[]
): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    if (nodes.length === 0) {
        return positions;
    }

    const PACKAGE_GAP = 120;
    const LAYER_GAP = 90;
    const NODE_GAP = 60;

    const byPackage = new Map<string, TontoDiagramNode[]>();
    for (const node of nodes) {
        const list = byPackage.get(node.module);
        if (list) {
            list.push(node);
        } else {
            byPackage.set(node.module, [node]);
        }
    }

    let xCursor = 0;
    const sortedPackages = [...byPackage.entries()].sort((left, right) => left[0].localeCompare(right[0]));

    for (const [, packageNodes] of sortedPackages) {
        const nodeIds = new Set(packageNodes.map((node) => node.id));
        const specEdges = edges.filter(
            (edge) => edge.kind === "specialization"
                && nodeIds.has(edge.source)
                && nodeIds.has(edge.target),
        );

        const incoming = new Map<string, number>(packageNodes.map((node) => [node.id, 0]));
        const outgoing = new Map<string, string[]>();
        for (const edge of specEdges) {
            incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
            outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
        }

        const layerByNode = new Map<string, number>(packageNodes.map((node) => [node.id, 0]));
        const queue = packageNodes
            .filter((node) => (incoming.get(node.id) ?? 0) === 0)
            .map((node) => node.id);

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) {
                continue;
            }
            const currentLayer = layerByNode.get(current) ?? 0;
            for (const target of outgoing.get(current) ?? []) {
                layerByNode.set(target, Math.max(layerByNode.get(target) ?? 0, currentLayer + 1));
                incoming.set(target, (incoming.get(target) ?? 0) - 1);
                if (incoming.get(target) === 0) {
                    queue.push(target);
                }
            }
        }

        const byLayer = new Map<number, TontoDiagramNode[]>();
        for (const node of packageNodes) {
            const layer = layerByNode.get(node.id) ?? 0;
            const layerNodes = byLayer.get(layer);
            if (layerNodes) {
                layerNodes.push(node);
            } else {
                byLayer.set(layer, [node]);
            }
        }

        const orderedLayers = [...byLayer.entries()].sort((left, right) => left[0] - right[0]);
        for (const [, layerNodes] of orderedLayers) {
            layerNodes.sort((left, right) => left.label.localeCompare(right.label));
        }

        const packageWidth = Math.max(
            0,
            ...orderedLayers.map(([, layerNodes]) =>
                layerNodes.reduce((sum, node) => sum + node.size.width, 0) + Math.max(0, layerNodes.length - 1) * NODE_GAP,
            ),
        );

        let y = 0;
        for (const [, layerNodes] of orderedLayers) {
            const layerWidth = layerNodes.reduce((sum, node) => sum + node.size.width, 0)
                + Math.max(0, layerNodes.length - 1) * NODE_GAP;
            const layerHeight = Math.max(...layerNodes.map((node) => node.size.height));
            let x = xCursor + (packageWidth - layerWidth) / 2;
            for (const node of layerNodes) {
                positions.set(node.id, { x, y });
                x += node.size.width + NODE_GAP;
            }
            y += layerHeight + LAYER_GAP;
        }

        xCursor += packageWidth + PACKAGE_GAP;
    }

    return positions;
}
