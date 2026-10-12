import type { TontoDiagramGraph, TontoDiagramSpec } from "../../diagram-spec/types.js";
import type { ViewModel } from "./model.js";
import { emptyViewFile, type ViewFile } from "./viewfile.js";
import { fullTone, lightTone, DATATYPE_COLOR, UNRESOLVED_COLOR } from "./palette.js";
/** Legacy identifiers remain unchanged, so positions in existing files retain identity. */
export function legacyGraphToSvgView(graph: TontoDiagramGraph): ViewModel {
  return {
    nodes: graph.nodes.map((node) => {
      const palette = node.appearance.palette === "modes" ? "intrinsic-modes" : node.appearance.palette;
      return {
        id: node.id,
        name: node.label,
        package: node.module,
        kind: node.isEnum ? ("enumeration" as const) : node.kind,
        stereotype: node.stereotype,
        color:
          node.kind === "datatype"
            ? DATATYPE_COLOR
            : ((node.appearance.accent === "sortal" ? fullTone[palette] : lightTone[palette]) ?? UNRESOLVED_COLOR),
        isExternal: node.appearance.external,
        attributes: node.attributes.map((attribute) => ({
          ...attribute,
          cardinality: attribute.cardinality?.replace(/[\[\]]/g, ""),
          stereotypes: [],
        })),
        ...(node.isEnum ? { literals: node.attributes.map((attribute) => attribute.name) } : {}),
        natures: { natures: [node.appearance.palette] },
      };
    }),
    edges: graph.edges.map((edge) =>
      edge.kind === "specialization"
        ? { id: edge.id, kind: "generalization" as const, source: edge.source, target: edge.target }
        : {
            id: edge.id,
            kind: "relation" as const,
            source: edge.source,
            target: edge.target,
            name: edge.label,
            stereotype: edge.stereotype,
            sourceEnd: { role: edge.sourceEnd, cardinality: edge.sourceCardinality?.replace(/[\[\]]/g, "") },
            targetEnd: { role: edge.targetEnd, cardinality: edge.targetCardinality?.replace(/[\[\]]/g, "") },
            ...(edge.connector === "composition" || edge.connector === "aggregation"
              ? { whole: "source" as const }
              : edge.connector === "composition-inverted" || edge.connector === "aggregation-inverted"
                ? { whole: "target" as const }
                : {}),
            composition: edge.connector?.startsWith("composition"),
          }
    ),
    groups: graph.packages.map((name) => ({
      id: `package:${name}`,
      name,
      nodes: graph.nodes.filter((node) => node.module === name).map((node) => node.id),
    })),
    gensets: [],
  };
}
/** Migration is additive; report legacy settings the JSON vocabulary cannot express. */
export function legacySpecToViewFile(
  spec: TontoDiagramSpec,
  graph: TontoDiagramGraph,
  source?: string
): { file: ViewFile; unmapped: string[] } {
  const file = emptyViewFile();
  file.source = source ?? spec.source;
  file.viewport = { ...spec.viewport };
  file.content.includedPackages = [...graph.packages];
  file.content.showExternalReferences = spec.filter.external;
  file.content.showDatatypes = spec.filter.datatypes;
  file.display.showAttributes = spec.presentation.attributes;
  file.display.showRelationStereotypes = spec.presentation.stereotypes;
  file.layout.direction =
    spec.presentation.direction === "LR" || spec.presentation.direction === "RL" ? "RIGHT" : "DOWN";
  // Preserved as an explicit compatibility field rather than silently reversing layout.
  file.legacyDirection = spec.presentation.direction;
  const ids = new Map(graph.nodes.map((node) => [node.id, node.id]));
  const names = new Map<string, string[]>();
  for (const node of graph.nodes) names.set(node.label, [...(names.get(node.label) ?? []), node.id]);
  // The currently visible diagram includes generated placements, which are user-visible work too.
  for (const node of graph.nodes) file.nodes[node.id] = { ...node.position };
  const unmapped: string[] = [];
  for (const saved of spec.nodes) {
    const id =
      ids.get(saved.target) ?? (names.get(saved.target)?.length === 1 ? names.get(saved.target)![0] : undefined);
    if (id) file.nodes[id] = { x: saved.x, y: saved.y };
    else {
      file.nodes[saved.target] = { x: saved.x, y: saved.y };
      unmapped.push(`Unresolved placement: ${saved.target}`);
    }
  }
  const visible = new Set(graph.nodes.map((node) => node.id));
  if (spec.filter.include.length || spec.filter.relations.length)
    unmapped.push(
      "Legacy name-based include/relation filters were resolved to the current graph; review visibility after source additions."
    );
  file.content.hidden = graph.workspace.elements
    .filter((element) => !visible.has(element.qualifiedName))
    .map((element) => element.qualifiedName);
  return { file, unmapped };
}

/** Convert only proven graph identities; unresolved saved work remains untouched. */
export function canonicalizeLegacyViewFile(file: ViewFile, graph: TontoDiagramGraph): ViewFile {
  const ids = new Map([
    ...graph.workspace.elements.map(
      (element) => [element.qualifiedName, `${element.packageName}::${element.name}`] as const
    ),
    ...graph.nodes.map((node) => [node.id, `${node.module}::${node.label}`] as const),
  ]);
  const remap = (id: string) => ids.get(id) ?? id;
  return {
    ...file,
    nodes: {
      ...Object.fromEntries(graph.nodes.map((node) => [remap(node.id), { ...node.position }])),
      ...Object.fromEntries(Object.entries(file.nodes).map(([id, placement]) => [remap(id), placement])),
    },
    edges: { ...file.edges },
    content: { ...file.content, hidden: file.content.hidden?.map(remap) },
    constraints: {
      pinned: file.constraints.pinned.map(remap),
      alignments: file.constraints.alignments.map((group) => ({ ...group, nodes: group.nodes.map(remap) })),
      distributions: file.constraints.distributions.map((group) => ({ ...group, nodes: group.nodes.map(remap) })),
    },
  };
}
