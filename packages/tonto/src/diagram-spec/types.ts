export type TontoDiagramDirection = "LR" | "RL" | "TB" | "BT";

export type TontoDiagramSeverity = "error" | "warning";

export type TontoDiagramFilter = {
    include: string[];
    relations: string[];
    external: boolean;
    datatypes: boolean;
};

export type TontoDiagramPresentation = {
    direction: TontoDiagramDirection;
    stereotypes: boolean;
    attributes: boolean;
};

export type TontoDiagramLayout = {
    target: string;
    x: number;
    y: number;
};

/**
 * Per-relation entry in the .tontodiagram source. Mirrors `node <name>`. The
 * block body is reserved for future per-edge layout (waypoints, label
 * position) — for now declaring an entry simply records that the relation is
 * part of the diagram authoring trail.
 */
export type TontoDiagramRelationLayout = {
    target: string;
};

export type TontoDiagramViewport = {
    x: number;
    y: number;
    zoom: number;
};

export type TontoDiagramSpec = {
    title: string;
    source?: string;
    imports: string[];
    filter: TontoDiagramFilter;
    presentation: TontoDiagramPresentation;
    nodes: TontoDiagramLayout[];
    relations: TontoDiagramRelationLayout[];
    viewport: TontoDiagramViewport;
};

export type TontoDiagramIssue = {
    message: string;
    severity: TontoDiagramSeverity;
    line?: number;
};

export type TontoDiagramParseResult = {
    spec?: TontoDiagramSpec;
    issues: TontoDiagramIssue[];
};

export type TontoDiagramNodeKind = "class" | "datatype";

export type TontoDiagramRigidity = "rigid" | "anti-rigid" | "semi-rigid" | "unknown";

export type TontoDiagramPaletteToken =
    | "objects"
    | "functional-complexes"
    | "collectives"
    | "quantities"
    | "relators"
    | "qualities"
    | "modes"
    | "events"
    | "situations"
    | "types"
    | "abstract-individuals"
    | "none";

export type TontoDiagramNodeAppearance = {
    palette: TontoDiagramPaletteToken;
    rigidity: TontoDiagramRigidity;
    accent: "sortal" | "non-sortal" | "neutral";
    external: boolean;
};

export type TontoDiagramAttribute = {
    name: string;
    type: string;
    cardinality?: string;
};

export type TontoDiagramNode = {
    id: string;
    specifier: string;
    label: string;
    module: string;
    stereotype?: string;
    kind: TontoDiagramNodeKind;
    appearance: TontoDiagramNodeAppearance;
    attributes: TontoDiagramAttribute[];
    isEnum: boolean;
    position: {
        x: number;
        y: number;
    };
    size: {
        width: number;
        height: number;
    };
};

export type TontoDiagramConnector =
    | "association"
    | "aggregation"
    | "aggregation-inverted"
    | "composition"
    | "composition-inverted";

export type TontoDiagramEdgeKind = "relation" | "specialization";

export type TontoDiagramEdge = {
    id: string;
    kind: TontoDiagramEdgeKind;
    source: string;
    target: string;
    label?: string;
    stereotype?: string;
    connector?: TontoDiagramConnector;
    sourceCardinality?: string;
    targetCardinality?: string;
    sourceEnd?: string;
    targetEnd?: string;
};

export type TontoDiagramGraph = {
    title: string;
    source?: string;
    projectRoot: string;
    packages: string[];
    imports: string[];
    filter: TontoDiagramFilter;
    presentation: TontoDiagramPresentation;
    viewport: TontoDiagramViewport;
    nodes: TontoDiagramNode[];
    edges: TontoDiagramEdge[];
    workspace: TontoDiagramWorkspaceContext;
    issues: TontoDiagramIssue[];
};

export type TontoDiagramPackageContext = {
    name: string;
    sourcePath: string;
};

export type TontoDiagramElementContext = {
    name: string;
    qualifiedName: string;
    packageName: string;
    kind: TontoDiagramNodeKind;
};

export type TontoDiagramRelationContext = {
    id: string;
    name?: string;
    packageName: string;
    source: string;
    target: string;
    stereotype?: string;
};

export type TontoDiagramWorkspaceContext = {
    sourcePath: string;
    packages: TontoDiagramPackageContext[];
    elements: TontoDiagramElementContext[];
    relations: TontoDiagramRelationContext[];
};
