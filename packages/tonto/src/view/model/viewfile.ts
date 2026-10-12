// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * The arrangement, as a file.
 *
 * A diagram someone has laid out by hand is work, and work that lives only in a
 * webview's memory is lost at the next window reload. So positions, routes,
 * hidden elements and the options that produced the view are written beside the
 * model under `views/*.tontoview` -- plain JSON, small enough to read, diffable
 * enough to review, and one file per view so a large model can have several.
 *
 * Nothing here touches the file system: the extension reads and writes, this
 * decides what a file means once it is open.
 */

import type { ContentOptions, DisplayOptions, LayoutOptions } from "./options.js";
import {
  clampAssociationDistance,
  defaultContentOptions,
  defaultDisplayOptions,
  defaultLayoutOptions,
} from "./options.js";
import type { ViewModel } from "./model.js";

export const VIEW_FILE_VERSION = 1;

export interface Placement {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface EdgeRoute {
  /**
   * The whole editable guide, ends included, rather than only its bends.
   *
   * A route and the boxes it runs between are one arrangement: a stored bend
   * with a recomputed endpoint gives a diagonal leg from a border to a corner,
   * which is what happened when only the bends were kept. So a route is stored
   * complete and dropped, by whoever moves a box, the moment one of its ends
   * is somewhere else. Curved routing interpolates this guide; its adaptive
   * samples are drawing geometry and are deliberately not persisted.
   */
  points?: Point[];
  /** How far the label was moved from where it would sit on its own. */
  labelOffset?: Point;
}

export interface ViewConstraints {
  /** Stable element ids whose current placements automatic layout must retain. */
  pinned: string[];
  alignments: Array<{ axis: "x" | "y"; nodes: string[] }>;
  distributions: Array<{ axis: "x" | "y"; nodes: string[] }>;
}

export interface ViewFile {
  version: number;
  source?: string;
  legacyDirection?: "LR" | "RL" | "TB" | "BT";
  viewport?: { x: number; y: number; zoom: number };
  /** The package the view is centred on, when it follows one. */
  focus?: string;
  content: ContentOptions;
  display: DisplayOptions;
  layout: LayoutOptions;
  constraints: ViewConstraints;
  nodes: Record<string, Placement>;
  edges: Record<string, EdgeRoute>;
}

export function emptyViewFile(focus?: string): ViewFile {
  return {
    version: VIEW_FILE_VERSION,
    ...(focus ? { focus } : {}),
    content: { ...defaultContentOptions },
    display: { ...defaultDisplayOptions },
    layout: { ...defaultLayoutOptions },
    constraints: { pinned: [], alignments: [], distributions: [] },
    nodes: {},
    edges: {},
  };
}

/**
 * Reads a file that may have been written by an older version, or by hand, or
 * not at all.
 *
 * A view file is edited by people and survives upgrades, so every field is
 * treated as absent until it proves otherwise. What cannot be read is replaced
 * by the default rather than refused: losing a layout because one number was a
 * string is a bad trade.
 */
export function readViewFile(raw: unknown): ViewFile {
  const source = recordOf(raw);
  const nodes: Record<string, Placement> = Object.create(null);
  for (const [id, placement] of Object.entries(recordOf(source.nodes))) {
    const read = readPlacement(placement);
    if (read) {
      nodes[id] = read;
    }
  }
  const edges: Record<string, EdgeRoute> = Object.create(null);
  for (const [id, route] of Object.entries(recordOf(source.edges))) {
    const read = readRoute(route);
    if (read) {
      edges[id] = read;
    }
  }
  return {
    version: VIEW_FILE_VERSION,
    ...(oneOf(source.legacyDirection, ["LR", "RL", "TB", "BT"]) ? { legacyDirection: source.legacyDirection } : {}),
    ...(typeof source.source === "string" ? { source: source.source } : {}),
    ...(isPoint(source.viewport) &&
    typeof recordOf(source.viewport).zoom === "number" &&
    Number.isFinite(recordOf(source.viewport).zoom) &&
    Number(recordOf(source.viewport).zoom) > 0
      ? { viewport: source.viewport as ViewFile["viewport"] }
      : {}),
    ...(typeof source.focus === "string" ? { focus: source.focus } : {}),
    content: readContentOptions(source.content),
    display: readDisplayOptions(source.display),
    layout: readLayoutOptions(source.layout),
    constraints: readConstraints(source.constraints),
    nodes,
    edges,
  };
}

function readConstraints(value: unknown): ViewConstraints {
  const source = recordOf(value);
  const groups = (value: unknown, minimum: number) =>
    Array.isArray(value)
      ? value.flatMap((item) => {
          const group = recordOf(item);
          const nodes = stringArray(group.nodes);
          return oneOf(group.axis, ["x", "y"]) && nodes && nodes.length >= minimum ? [{ axis: group.axis, nodes }] : [];
        })
      : [];
  return {
    pinned: stringArray(source.pinned) ?? [],
    alignments: groups(source.alignments, 2),
    distributions: groups(source.distributions, 3),
  };
}

function readContentOptions(value: unknown): ContentOptions {
  const source = recordOf(value);
  const includedPackages = stringArray(source.includedPackages);
  const hidden = stringArray(source.hidden);
  return {
    scope: oneOf(source.scope, ["file", "workspace"]) ? source.scope : defaultContentOptions.scope,
    showExternalReferences: booleanOr(source.showExternalReferences, defaultContentOptions.showExternalReferences),
    showDatatypes: booleanOr(source.showDatatypes, defaultContentOptions.showDatatypes),
    showGensets: booleanOr(source.showGensets, defaultContentOptions.showGensets),
    ...(includedPackages ? { includedPackages } : {}),
    ...(hidden ? { hidden } : {}),
  };
}

function readDisplayOptions(value: unknown): DisplayOptions {
  const source = recordOf(value);
  return {
    taxonomyOnly: booleanOr(source.taxonomyOnly, defaultDisplayOptions.taxonomyOnly),
    routing: oneOf(source.routing, ["straight", "curved", "orthogonal"])
      ? source.routing
      : defaultDisplayOptions.routing,
    fontFamily: oneOf(source.fontFamily, ["sans", "condensed", "humanist", "geometric", "serif", "book", "monospace"])
      ? source.fontFamily
      : defaultDisplayOptions.fontFamily,
    fontSize: oneOf(source.fontSize, ["small", "medium", "large"]) ? source.fontSize : defaultDisplayOptions.fontSize,
    showAttributes: booleanOr(source.showAttributes, defaultDisplayOptions.showAttributes),
    showCardinalities: booleanOr(source.showCardinalities, defaultDisplayOptions.showCardinalities),
    showRelationNames: booleanOr(source.showRelationNames, defaultDisplayOptions.showRelationNames),
    showRelationStereotypes: booleanOr(source.showRelationStereotypes, defaultDisplayOptions.showRelationStereotypes),
    showEndDecorations: booleanOr(source.showEndDecorations, defaultDisplayOptions.showEndDecorations),
    showRoleNames: booleanOr(source.showRoleNames, defaultDisplayOptions.showRoleNames),
    showColors: booleanOr(source.showColors, defaultDisplayOptions.showColors),
    showLegend: booleanOr(source.showLegend, defaultDisplayOptions.showLegend),
    showPackageGroups: booleanOr(source.showPackageGroups, defaultDisplayOptions.showPackageGroups),
    qualifyNames: booleanOr(source.qualifyNames, defaultDisplayOptions.qualifyNames),
    showDocumentation: booleanOr(source.showDocumentation, defaultDisplayOptions.showDocumentation),
  };
}

function readLayoutOptions(value: unknown): LayoutOptions {
  const source = recordOf(value);
  return {
    direction: oneOf(source.direction, ["DOWN", "RIGHT"]) ? source.direction : defaultLayoutOptions.direction,
    associationDistance: clampAssociationDistance(
      nonNegativeNumberOr(source.associationDistance, defaultLayoutOptions.associationDistance)
    ),
    nodeSpacing: nonNegativeNumberOr(source.nodeSpacing, defaultLayoutOptions.nodeSpacing),
    rankSpacing: nonNegativeNumberOr(source.rankSpacing, defaultLayoutOptions.rankSpacing),
    maxRankSpan: nonNegativeNumberOr(source.maxRankSpan, defaultLayoutOptions.maxRankSpan),
    groupByPackage: booleanOr(source.groupByPackage, defaultLayoutOptions.groupByPackage),
  };
}

/**
 * What the file says about a model as it now reads.
 *
 * A rename leaves an entry naming an element that no longer exists. It is
 * reported rather than deleted: the modeller renamed a class, they did not ask
 * to lose where it sat, and a view that quietly forgot would be indistinguishable
 * from one that never knew.
 */
export interface Reconciled {
  placed: Record<string, Placement>;
  routed: Record<string, EdgeRoute>;
  /** Elements in the view with no saved position, for whatever places them. */
  unplaced: string[];
  /** Saved positions for elements the model no longer has. */
  orphans: string[];
}

export function reconcile(file: ViewFile, view: ViewModel): Reconciled {
  const ids = new Set(view.nodes.map((node) => node.id));
  const edgeIds = new Set(view.edges.map((edge) => edge.id));
  const placed: Record<string, Placement> = {};
  const orphans: string[] = [];
  for (const [id, placement] of Object.entries(file.nodes)) {
    if (ids.has(id)) {
      placed[id] = placement;
    } else {
      orphans.push(id);
    }
  }
  const routed: Record<string, EdgeRoute> = {};
  for (const [id, route] of Object.entries(file.edges)) {
    if (edgeIds.has(id)) {
      routed[id] = route;
    }
  }
  orphans.push(...Object.keys(file.edges).filter((id) => !edgeIds.has(id)));
  return {
    placed,
    routed,
    unplaced: view.nodes.filter((node) => !placed[node.id]).map((node) => node.id),
    orphans,
  };
}

function readPlacement(value: unknown): Placement | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number"
  ) {
    return undefined;
  }
  return {
    x: candidate.x,
    y: candidate.y,
    ...(typeof candidate.width === "number" && Number.isFinite(candidate.width) && candidate.width > 0
      ? { width: candidate.width }
      : {}),
    ...(typeof candidate.height === "number" && Number.isFinite(candidate.height) && candidate.height > 0
      ? { height: candidate.height }
      : {}),
  };
}

function readRoute(value: unknown): EdgeRoute | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const points = Array.isArray(candidate.points) ? candidate.points.filter(isPoint) : undefined;
  const labelOffset = isPoint(candidate.labelOffset) ? candidate.labelOffset : undefined;
  // Two points make a line; anything less is not a route.
  if ((points?.length ?? 0) < 2 && !labelOffset) {
    return undefined;
  }
  return {
    ...(points && points.length >= 2 ? { points } : {}),
    ...(labelOffset ? { labelOffset } : {}),
  };
}

function isPoint(value: unknown): value is Point {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Point).x === "number" &&
    typeof (value as Point).y === "number" &&
    Number.isFinite((value as Point).x) &&
    Number.isFinite((value as Point).y)
  );
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function nonNegativeNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : undefined;
}

function oneOf<const T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

/** Parse without losing malformed JSON behind defaults. */
export function parseViewFile(text: string): ViewFile {
  const raw: unknown = JSON.parse(text);
  const record = recordOf(raw);
  if (record.version !== undefined && record.version !== VIEW_FILE_VERSION)
    throw new Error("Unsupported Tonto view version.");
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new Error("Tonto view must be a JSON object.");
  return readViewFile(raw);
}
export function serializeViewFile(file: ViewFile): string {
  return JSON.stringify(readViewFile(file), null, 2) + "\n";
}
