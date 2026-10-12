// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * The picture, as SVG text.
 *
 * A string rather than a live DOM, for three reasons: the same function draws
 * the export and the screen, a test can read what it produced, and the webview
 * can set it once and then move single elements by touching their transforms
 * rather than by re-rendering the diagram on every pointer move.
 */

import type { EdgeRoute, ViewEdge, ViewModel, ViewNode, ViewRelation, ViewRelationEnd } from "../model/index.js";
import type { DisplayOptions, LayoutOptions } from "../model/index.js";
import { inversePairs } from "../model/inverses.js";
import type { Point, Rect, Side } from "./geometry.js";
import {
  alongPath,
  borderPoint,
  boundsOf,
  centerOf,
  distanceToPath,
  midpointOf,
  segmentHitsRect,
  segmentsProperlyCross,
  sideOf,
} from "./geometry.js";
import {
  fontMetrics,
  multiplicityLabel,
  NODE,
  nodeLabel,
  stereotypeLabel,
  textWidth,
  wrappedAttributeLines,
} from "./measure.js";
import type { FontMetrics } from "./measure.js";
import type { Positions } from "./place.js";
import type { TreeStem } from "./ports.js";
import { assignPorts, endKey } from "./ports.js";
import { curvedRoute, pathData, roundedRoute, routeEdge } from "./route.js";
import type { Theme } from "./theme.js";
import { lightTheme } from "./theme.js";

export interface RenderInput {
  view: ViewModel;
  positions: Positions;
  display: DisplayOptions;
  /** The rank direction whose facing sides generalizations must use. */
  direction?: LayoutOptions["direction"];
  /** Waypoints the modeller dragged, by edge id. */
  routes?: Record<string, EdgeRoute>;
  theme?: Theme;
  selection?: string[];
  padding?: number;
  /** Internal layout scoring uses direct guides so drawing style cannot move cards. */
  repeatedAssociationFans?: boolean;
}

export interface Rendered {
  svg: string;
  bounds: Rect;
  /** The path each edge was drawn along, so the canvas can hit-test it. */
  paths: Record<string, Point[]>;
  /** Editable guide polylines; curved paths are sampled separately above. */
  guides: Record<string, Point[]>;
  /** Lines or neighboring decorators that enter a generalization head. */
  headCollisions: number;
}

interface HeadMarker {
  owner: string;
  points: [Point, Point, Point];
}

interface HeadStroke {
  owner: string;
  points: Point[];
}

const GROUP_HEADER = 20;
const GROUP_PADDING = 18;

/** Whether the straight line between two boxes has anything else in the way. */
function isClear(positions: Record<string, Rect>, one: string, other: string, view: ViewModel): boolean {
  const from = positions[one];
  const to = positions[other];
  if (!from || !to) {
    return false;
  }
  const start = centerOf(from);
  const end = centerOf(to);
  return !view.nodes.some((node) => {
    const rect = node.id === one || node.id === other ? undefined : positions[node.id];
    return rect !== undefined && segmentHitsRect(start, end, rect, 6);
  });
}

/**
 * The mediation ends that meet a relator.
 *
 * A relator is a reified relationship: the mediations are what it relates by,
 * and the reader follows them through it, from one relatum to the other. It is
 * the nature that decides, not the stereotype -- a role played by a relator, an
 * employment under contract, is as much the relationship as the relator it
 * specializes.
 */
function mediationsThrough(
  view: ViewModel,
  positions: Record<string, Rect>,
  covered: ReadonlySet<string> = new Set()
): Set<string> {
  const relators = new Set(
    view.nodes
      .filter((node) => node.stereotype === "relator" || node.natures?.natures.includes("relators"))
      .map((node) => node.id)
  );
  const mediations = view.edges.filter(
    (edge) =>
      edge.kind === "relation" &&
      edge.stereotype === "mediation" &&
      edge.source !== edge.target &&
      !covered.has(edge.id)
  );

  // A relator that mediates one class twice -- a marriage and its two spouses
  // -- cannot be read through: both lines leave for the same place, and aiming
  // them both at the centre points them along each other. Those keep their
  // share of the border, which is what tells them apart.
  const twice = new Set<string>();
  const seen = new Set<string>();
  for (const edge of mediations) {
    for (const end of [edge.source, edge.target]) {
      if (!relators.has(end)) {
        continue;
      }
      const pair = endKey(end === edge.source ? edge.target : edge.source, end);
      if (seen.has(pair)) {
        twice.add(pair);
      }
      seen.add(pair);
    }
  }

  const through = new Set<string>();
  for (const edge of mediations) {
    for (const end of [edge.source, edge.target]) {
      const far = end === edge.source ? edge.target : edge.source;
      const pair = endKey(far, end);
      // A line that has to go round something is not read through the
      // relator whatever it is anchored on: it leaves for its detour long
      // before the reader can follow it across. Those keep their share of
      // the border, which is at least where the labels expect them.
      if (relators.has(end) && !twice.has(pair) && isClear(positions, end, far, view)) {
        through.add(endKey(edge.id, end));
      }
    }
  }
  return through;
}

/**
 * Which half of each inverse pair is drawn, and which half it speaks for.
 *
 * `Man.hasChild inverseOf Person.hasFather` is one association stated twice, and
 * drawing it twice puts two lines between the same pair of classes saying the
 * same thing in opposite directions -- the reader counts two relationships where
 * the model has one. So the pair is drawn as one line with both readings written
 * on it, and the other half is covered: not routed, not drawn, and not counted
 * as a line by the label placer.
 *
 * Which of the two keeps the line is decided by their ids, not by which was
 * written first. A saved route belongs to an id, and the line has to stay the
 * same line when the modeller moves a declaration from one file to another.
 *
 * The pair has to agree. `derive` marks both halves, so a relation whose
 * `inverseOf` is not returned is one of several claiming the same partner --
 * a model the validator rejects, and one where drawing fewer lines than there
 * are relations would hide the mistake.
 */
/**
 * The two halves of an inverse pair as the one relation they state.
 *
 * The ends are the same two ends written twice, so the line carries each of them
 * once -- but the two declarations need not spell the same one out equally.
 * `Person.hasEmployment` names the role `employments` where its inverse leaves
 * that end unnamed, and dropping the half that happens not to be drawn would
 * lose the role name off the picture.
 *
 * Merging is a spread because `endOf` leaves an unstated field out of the object
 * rather than setting it undefined: the drawn half wins wherever it says
 * anything, and the other fills the gaps.
 */
function mergedWith(edge: ViewRelation, partner: ViewRelation): ViewRelation {
  const merge = (one: ViewRelationEnd, other: ViewRelationEnd): ViewRelationEnd => ({ ...other, ...one });
  return {
    ...edge,
    sourceEnd: merge(edge.sourceEnd, partner.targetEnd),
    targetEnd: merge(edge.targetEnd, partner.sourceEnd),
    // The diamond is on an end, so it crosses over with the end it is on.
    ...(edge.whole || !partner.whole
      ? {}
      : { whole: partner.whole === "source" ? ("target" as const) : ("source" as const) }),
  };
}

export function render(input: RenderInput): Rendered {
  const { view, positions, display } = input;
  const font = fontMetrics(display);
  const theme = input.theme ?? lightTheme;
  const padding = input.padding ?? 16;
  const selected = new Set(input.selection ?? []);
  const rects = view.nodes.map((node) => positions[node.id]).filter((rect): rect is Rect => rect !== undefined);
  const groups = display.showPackageGroups ? groupBoxes(view, positions) : [];

  // Decided before ports are assigned, not only before routing: a tree's
  // member edges take no share of the border themselves -- the shared stem
  // does, in their place -- so the fan has to know which edges those are
  // before it runs, not skip them only once it comes time to draw.
  const trees = planTrees(view, positions);
  const stems = treeStems(trees.plans, positions);

  // Where each line meets each box, spread along the border so that two
  // associations between the same neighbours do not arrive as one line --
  // except at a relator, where a mediation is anchored on the ray out of the
  // centre so that the pair of them reads as one line passing through it.
  // An inverse pair is one line, decided before the ends are spread along the
  // borders: the half that is not drawn must not be given a share of a border
  // either, or the line that is drawn arrives beside the space kept for it.
  const inverses = inversePairs(view.edges);
  const drawn = view.edges.filter(
    (edge) => !inverses.covered.has(edge.id) && (!display.taxonomyOnly || edge.kind === "generalization")
  );
  const spreads = input.repeatedAssociationFans === false ? new Map() : relationSpreads(drawn);
  const portInput = drawn.filter((edge) => !trees.covered.has(edge.id));
  const loops = loopIndex(view);
  const through = mediationsThrough(view, positions, inverses.covered);

  // A ray is the honest anchor for an association: it meets the side where
  // the opposite class actually lies. On a dense graph, however, that local
  // improvement can occasionally add a global crossing. Route both stable
  // port candidates and keep the ray version unless its final paths introduce
  // an extra node intersection or crossing. This makes the anchor decision
  // part of final routing quality instead of blindly preferring either rule.
  const routeCandidate = (associationAnchors: "ray" | "even", reserveHeads: boolean) => {
    const assigned = assignPorts(
      portInput,
      positions,
      through,
      stems,
      associationAnchors,
      input.direction,
      reserveHeads
    );
    const crowdedHeads = crowdedGeneralizationHeads(portInput, stems, assigned, input.direction);
    const guides: Record<string, Point[]> = {};
    const squareApproaches = new Map<string, Point[]>();
    const approachGroups = new Map<string, string[]>();
    const fanCandidates = new Map<string, Point[][]>();
    const bends: Point[] = [];
    for (const edge of drawn) {
      if (trees.covered.has(edge.id)) {
        continue;
      }
      const source = positions[edge.source];
      const target = positions[edge.target];
      if (!source || !target) {
        continue;
      }
      const stored = input.routes?.[edge.id]?.points;
      const request = {
        avoid: bends,
        ...(stored ? { stored } : {}),
        ...(assigned.ends.get(edge.id) ? { ends: assigned.ends.get(edge.id)! } : {}),
        ...(loops.get(edge.id) ? { loop: loops.get(edge.id)! } : {}),
        style: display.routing,
        obstacles: rects,
      };
      const route = routeEdge(source, target, request);
      guides[edge.id] = route;
      const spread = spreads.get(edge.id);
      if (spread && !stored) {
        fanCandidates.set(
          edge.id,
          [16, 12, 8, 4].map((reach) => routeEdge(source, target, { ...request, spread: { ...spread, reach } }))
        );
      }
      if (crowdedHeads.has(edge.id) && !stored && display.routing === "straight") {
        squareApproaches.set(edge.id, withRankFacingHead(route, target, input.direction));
        approachGroups.set(edge.target, [...(approachGroups.get(edge.target) ?? []), edge.id]);
      }
      // Whatever this line bent around, the next one goes round elsewhere.
      bends.push(...(fanCandidates.get(edge.id)?.[0] ?? guides[edge.id]!).slice(1, -1));
    }
    // A square approach solves a decorator collision only if it does not
    // purchase that local fix with a new centre-line crossing elsewhere.
    // Try a whole fan together: adding its stubs one at a time can make the
    // first stub cross a neighbor that has not received its own stub yet.
    let drawable = drawableRoutes(guides, drawn, positions, rects, display.routing === "curved");
    let faults = routeFaults(drawable.paths, drawn, positions);
    for (const ids of relationSpreadGroups(drawn)) {
      const previous = new Map(
        ids.map((id) => [id, guides[id]!]).filter((entry): entry is [string, Point[]] => entry[1] !== undefined)
      );
      let accepted = false;
      for (let candidateIndex = 0; candidateIndex < 4; candidateIndex += 1) {
        for (const id of ids) {
          const candidate = fanCandidates.get(id)?.[candidateIndex];
          if (candidate) {
            guides[id] = candidate;
          }
        }
        const candidate = drawableRoutes(guides, drawn, positions, rects, display.routing === "curved");
        const candidateFaults = routeFaults(candidate.paths, drawn, positions);
        if (candidateFaults.intersections <= faults.intersections && candidateFaults.crossings <= faults.crossings) {
          drawable = candidate;
          faults = candidateFaults;
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        for (const [id, points] of previous) {
          guides[id] = points;
        }
      }
    }
    for (const ids of approachGroups.values()) {
      const previous = new Map(ids.map((id) => [id, guides[id]!]));
      for (const id of ids) {
        guides[id] = squareApproaches.get(id)!;
      }
      const candidate = drawableRoutes(guides, drawn, positions, rects, display.routing === "curved");
      const candidateFaults = routeFaults(candidate.paths, drawn, positions);
      if (candidateFaults.intersections <= faults.intersections && candidateFaults.crossings <= faults.crossings) {
        faults = candidateFaults;
        drawable = candidate;
      } else {
        for (const [id, points] of previous) {
          guides[id] = points;
        }
      }
    }
    return { assigned, guides, ...drawable, faults };
  };
  const preferredRay = routeCandidate("ray", true);
  const legacyRay = routeCandidate("ray", false);
  const ray = saferRoutes(legacyRay.faults, preferredRay.faults) ? legacyRay : preferredRay;
  const even = portInput.some((edge) => edge.kind !== "generalization")
    ? (() => {
        const preferred = routeCandidate("even", true);
        const legacy = routeCandidate("even", false);
        return saferRoutes(legacy.faults, preferred.faults) ? legacy : preferred;
      })()
    : ray;
  const routed = saferRoutes(even.faults, ray.faults) ? even : ray;
  const assigned = routed.assigned;
  const paths = routed.paths;
  const guides = routed.guides;
  const pathDataByEdge = routed.data;
  // A copy: the placer is told about the bar of each tree as it is drawn,
  // and `paths` is what the canvas hit-tests edges against.
  const placer = new LabelPlacer(
    rects,
    groups.map((group) => group.rect),
    { ...paths },
    font
  );
  const buses: BusLine[] = [];
  const treeHeads: HeadMarker[] = [];
  const treeHeadStrokes: HeadStroke[] = [];
  const treeMarkup = trees.plans
    .map((plan) =>
      drawTree(plan, positions, theme, placer, font, rects, buses, assigned.stems, treeHeads, treeHeadStrokes)
    )
    .join("");

  // Labels are drawn last, over the boxes. A line may pass behind a class --
  // that reads as a line -- but a cardinality hidden behind one has simply
  // gone missing, and the reader has no way to know it was there.
  let labelMarkup = "";
  // Every line that is drawn, with the labels it carries. An inverse pair is
  // drawn from what both halves say, so the half that keeps the line carries
  // the other's ends and its name.
  const lines = drawn
    .filter((edge) => !trees.covered.has(edge.id) && positions[edge.source] && positions[edge.target])
    .map((edge) => {
      const partner = edge.kind === "relation" ? inverses.partnerOf.get(edge.id) : undefined;
      return {
        edge: edge.kind === "relation" && partner ? mergedWith(edge, partner) : edge,
        partner,
        points: paths[edge.id]!,
        data: pathDataByEdge[edge.id],
        isSelected: selected.has(edge.id) || (partner !== undefined && selected.has(partner.id)),
      };
    });

  const edgeMarkup = lines.map((one) => drawEdge(one.edge, one.points, theme, one.isSelected, one.data)).join("");
  // Drawn from the line that is drawn: an inverse pair shows one line, and
  // a derivation either half states belongs to that one.
  const derivations = lines.flatMap((one) => {
    if (one.edge.kind !== "relation") {
      return [];
    }
    const suppliers = new Set([...(one.edge.derivedFrom ?? []), ...(one.partner?.derivedFrom ?? [])]);
    return [...suppliers].flatMap((supplier) => {
      const rect = positions[supplier];
      const line = rect ? derivationLine(one.points, rect, rects) : undefined;
      return line ? [{ relation: one.edge.id, supplier, line }] : [];
    });
  });
  const derivationMarkup = derivations.map((one) => drawDerivation(one.relation, one.supplier, one.line)).join("");
  const ordinaryHeads: HeadMarker[] = lines.flatMap((one) =>
    one.edge.kind === "generalization"
      ? [
          {
            owner: one.edge.id,
            points: trianglePoints(
              one.points[one.points.length - 1]!,
              one.points[one.points.length - 2] ?? one.points[0]!
            ),
          },
        ]
      : []
  );
  const headCollisions = countHeadCollisions(
    [...treeHeadStrokes, ...lines.map((one) => ({ owner: one.edge.id, points: one.points }))],
    [...treeHeads, ...ordinaryHeads]
  );

  /**
   * Labels are placed widest first, not in the order the lines are drawn.
   *
   * Each one takes the best place left, so what goes first gets the choice.
   * A long role name with two property strings after it needs a stretch of
   * clear space and has few to choose from; a `*` fits almost anywhere. Placed
   * in the order the model happens to declare its relations, the `*` took the
   * one clear stretch and `{addOnly} {redefines Entity.parts}` was left to
   * print itself across whatever was already there -- which on gUFO is what
   * struck `wasTerminatedIn` through.
   */
  for (const one of [...lines].sort((a, b) => labelWidth(b.edge, display) - labelWidth(a.edge, display))) {
    labelMarkup += drawEdgeLabels(one.edge, one.points, display, theme, placer, one.partner);
  }

  // Sized after everything is placed, and around what was placed. A label
  // that could not find room near its line ends up some way from it, and a
  // drawing sized to the boxes alone cropped it -- a relation's name half off
  // the left edge, in an export nobody could correct.
  const pathPoints = [...Object.values(paths).flat(), ...derivations.flatMap((one) => one.line)].map((point) => ({
    ...point,
    width: 0,
    height: 0,
  }));
  const bounds = boundsOf([...rects, ...groups.map((group) => group.rect), ...placer.boxes(), ...pathPoints]);
  const origin = { x: bounds.x - padding, y: bounds.y - padding };
  const width = Math.max(bounds.width + padding * 2, 1);
  const height = Math.max(bounds.height + padding * 2, 1);

  const nodeMarkup = view.nodes
    .map((node) => {
      const rect = positions[node.id];
      return rect ? drawNode(node, rect, display, theme, selected.has(node.id)) : "";
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${origin.x} ${origin.y} ${width} ${height}" width="${width}" height="${height}">
<style>
/* Everything that is text, before anything specialises it. The label layer sits
   above the boxes and outside every other group, so a rule that reached labels
   through their edge stopped reaching them the day they were lifted out of it --
   and an SVG with no font-family on a text element falls back to a 16px serif.
   Stated once at the top, no layer can lose it again. */
text {
    font-family: ${font.family};
    font-stretch: ${font.stretch};
    font-size: ${font.edge}px;
    fill: ${theme.text};
    font-variant-numeric: tabular-nums;
}

.tv-node rect { stroke: ${theme.line}; stroke-width: 1; }
.tv-node text { fill: ${theme.onFill}; }
.tv-name { font-weight: 600; font-size: ${font.name}px; letter-spacing: 0.005em; }
.tv-stereotype { font-size: ${font.stereotype}px; fill-opacity: 0.72; letter-spacing: 0.01em; }
.tv-attribute { font-size: ${font.attribute}px; }
.tv-edge path { fill: none; stroke: ${theme.line}; stroke-width: 1.2; }
.tv-end { fill: ${theme.muted}; }
.tv-edge-stereotype { font-size: ${font.edgeStereotype}px; fill-opacity: 0.78; letter-spacing: 0.01em; }
.tv-marker { fill: ${theme.surface}; stroke: ${theme.line}; stroke-width: 1.2; }
.tv-arrow { fill: none; stroke: ${theme.line}; stroke-width: 1.2; }
.tv-reading { fill: ${theme.text}; stroke: none; }
.tv-lock { fill: none; stroke: ${theme.muted}; stroke-width: 1.1; stroke-linecap: round; }
.tv-lock rect { fill: ${theme.background}; }
.tv-group rect { fill: none; stroke: ${theme.muted}; stroke-dasharray: 4 3; }
.tv-group text { font-size: ${font.stereotype}px; fill: ${theme.muted}; }
.tv-selected rect { stroke: ${theme.accent}; stroke-width: 2.5; }
.tv-selected path { stroke: ${theme.accent}; stroke-width: 2.2; }
.tv-unresolved rect { stroke-dasharray: 5 3; }
.tv-external rect { stroke-dasharray: 2 2; }
</style>
<rect x="${origin.x}" y="${origin.y}" width="${width}" height="${height}" fill="${theme.background}"/>
${groups.map((group) => drawGroup(group)).join("")}${edgeMarkup}${derivationMarkup}${treeMarkup}${nodeMarkup}<g class="tv-labels">${labelMarkup}</g></svg>`;

  return { svg, bounds: { x: origin.x, y: origin.y, width, height }, paths, guides, headCollisions };
}

/** Generalizations whose marker footprint, not only tip, reaches a neighbour. */
function crowdedGeneralizationHeads(
  edges: Array<{ id: string; source: string; target: string; kind?: string }>,
  stems: readonly TreeStem[],
  assigned: ReturnType<typeof assignPorts>,
  direction: LayoutOptions["direction"] | undefined
): Set<string> {
  if (!direction) {
    return new Set();
  }
  const byGeneral = new Map<string, Array<{ id: string; at: number; ordinary: boolean }>>();
  for (const edge of edges) {
    if (edge.kind !== "generalization") {
      continue;
    }
    const point = assigned.ends.get(edge.id)?.target;
    if (point) {
      byGeneral.set(edge.target, [
        ...(byGeneral.get(edge.target) ?? []),
        {
          id: edge.id,
          at: direction === "DOWN" ? point.x : point.y,
          ordinary: true,
        },
      ]);
    }
  }
  for (const stem of stems) {
    const point = assigned.stems.get(stem.id);
    if (point) {
      byGeneral.set(stem.node, [
        ...(byGeneral.get(stem.node) ?? []),
        {
          id: stem.id,
          at: direction === "DOWN" ? point.x : point.y,
          ordinary: false,
        },
      ]);
    }
  }
  const crowded = new Set<string>();
  for (const heads of byGeneral.values()) {
    // With up to four heads the decorator-aware fan normally gives each
    // triangle enough independent border. Five is where a 120px class can
    // no longer absorb diagonal marker bodies without a common approach
    // corridor (Animal has four ordinary heads plus one set tree).
    if (heads.length < 5) {
      continue;
    }
    const ordered = heads.sort((one, other) => one.at - other.at || one.id.localeCompare(other.id));
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index]!.at - ordered[index - 1]!.at >= 30) {
        continue;
      }
      if (ordered[index - 1]!.ordinary) {
        crowded.add(ordered[index - 1]!.id);
      }
      if (ordered[index]!.ordinary) {
        crowded.add(ordered[index]!.id);
      }
    }
  }
  return crowded;
}

/**
 * Gives a generalization triangle a short rank-normal approach.
 *
 * The port fan orders zero-width centre lines correctly, but the triangle is a
 * real 16-18px-wide object behind its tip. A diagonal line into the next tip
 * can therefore cut across that triangle without its centre line ever crossing
 * another centre line. The short square approach keeps all ink inside the
 * corridor the target port reserved. User-drawn routes remain exactly theirs.
 */
function withRankFacingHead(points: Point[], target: Rect, direction: LayoutOptions["direction"] | undefined): Point[] {
  if (!direction || points.length < 2) {
    return points;
  }
  const tip = points[points.length - 1]!;
  const before = points[points.length - 2]!;
  // A specific placed beside or above its general meets another side, and a
  // stub out of the rank-facing one would hook the line round the corner.
  if (
    (direction === "DOWN" && tip.y !== target.y + target.height) ||
    (direction === "RIGHT" && tip.x !== target.x + target.width)
  ) {
    return points;
  }
  const approach =
    direction === "DOWN"
      ? { x: tip.x, y: target.y + target.height + 18 }
      : { x: target.x + target.width + 18, y: tip.y };
  if ((direction === "DOWN" && before.x === tip.x) || (direction === "RIGHT" && before.y === tip.y)) {
    return points;
  }
  return [...points.slice(0, -1), approach, tip];
}

interface RouteFaults {
  intersections: number;
  crossings: number;
}

interface DrawableRoutes {
  paths: Record<string, Point[]>;
  data: Record<string, string>;
}

/**
 * Curves routed edges one at a time without spending the direct guide's safety.
 *
 * A Bézier can bow across a line even when both of their guides were clear.
 * Comparing each proposed curve with that edge's current contribution makes
 * the choice deterministic and guarantees that smoothing never adds a card
 * intersection or crossing to the completed route set.
 */
function drawableRoutes(
  guides: Record<string, Point[]>,
  edges: readonly ViewEdge[],
  positions: Positions,
  obstacles: readonly Rect[],
  curved: boolean
): DrawableRoutes {
  const paths = Object.fromEntries(Object.entries(guides).map(([id, points]) => [id, points]));
  const data = Object.fromEntries(Object.entries(guides).map(([id, points]) => [id, pathData(points)]));
  if (!curved) {
    return { paths, data };
  }
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  for (const edge of edges) {
    const guide = guides[edge.id];
    const source = positions[edge.source];
    const target = positions[edge.target];
    if (!guide || !source || !target) {
      continue;
    }
    const before = routeContribution(edge.id, paths[edge.id]!, paths, edgeById, positions);
    const candidates = [curvedRoute(guide, source, target, obstacles), roundedRoute(guide, source, target, obstacles)];
    for (const candidate of candidates) {
      const after = routeContribution(edge.id, candidate.points, paths, edgeById, positions);
      if (after.intersections <= before.intersections && after.crossings <= before.crossings) {
        paths[edge.id] = candidate.points;
        data[edge.id] = candidate.data;
        break;
      }
    }
  }
  return { paths, data };
}

/** The faults attributable to one route against every unchanged route. */
function routeContribution(
  id: string,
  points: Point[],
  paths: Record<string, Point[]>,
  edgeById: ReadonlyMap<string, ViewEdge>,
  positions: Positions
): RouteFaults {
  const edge = edgeById.get(id);
  let intersections = 0;
  for (const [node, rect] of Object.entries(positions)) {
    if (
      node !== edge?.source &&
      node !== edge?.target &&
      points.slice(1).some((to, index) => segmentHitsRect(points[index]!, to, rect, 2))
    ) {
      intersections += 1;
    }
  }
  let crossings = 0;
  for (const [otherId, other] of Object.entries(paths)) {
    if (otherId === id) {
      continue;
    }
    if (
      points
        .slice(1)
        .some((to, index) =>
          other
            .slice(1)
            .some((otherTo, otherIndex) => segmentsProperlyCross(points[index]!, to, other[otherIndex]!, otherTo))
        )
    ) {
      crossings += 1;
    }
  }
  return { intersections, crossings };
}

/** High-priority faults in paths after ports, spreading and detours are final. */
function routeFaults(paths: Record<string, Point[]>, edges: readonly ViewEdge[], positions: Positions): RouteFaults {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const routed = Object.entries(paths);
  let intersections = 0;
  for (const [id, points] of routed) {
    const edge = edgeById.get(id);
    for (const [node, rect] of Object.entries(positions)) {
      if (node === edge?.source || node === edge?.target) {
        continue;
      }
      if (points.slice(1).some((to, index) => segmentHitsRect(points[index]!, to, rect, 2))) {
        intersections += 1;
      }
    }
  }
  let crossings = 0;
  for (let one = 0; one < routed.length; one += 1) {
    for (let two = one + 1; two < routed.length; two += 1) {
      const first = routed[one]![1];
      const second = routed[two]![1];
      if (
        first
          .slice(1)
          .some((to, index) =>
            second
              .slice(1)
              .some((otherTo, otherIndex) => segmentsProperlyCross(first[index]!, to, second[otherIndex]!, otherTo))
          )
      ) {
        crossings += 1;
      }
    }
  }
  return { intersections, crossings };
}

/** Whether a candidate is strictly safer than the preferred ray-anchored one. */
function saferRoutes(candidate: RouteFaults, preferred: RouteFaults): boolean {
  return (
    candidate.intersections < preferred.intersections ||
    (candidate.intersections === preferred.intersections && candidate.crossings < preferred.crossings)
  );
}

/** Which of a class's loops each self-relation is, so no two are drawn alike. */
function loopIndex(view: ViewModel): Map<string, { index: number; count: number }> {
  const byNode = new Map<string, string[]>();
  for (const edge of view.edges) {
    if (edge.source === edge.target) {
      byNode.set(edge.source, [...(byNode.get(edge.source) ?? []), edge.id]);
    }
  }
  const loops = new Map<string, { index: number; count: number }>();
  for (const ids of byNode.values()) {
    // By id, which is the order the ports were given out in. The index sets
    // how far out a loop runs, so if the two disagree the loop with the
    // wider berth can start from the inner port and cross the other.
    [...ids]
      .sort((one, other) => one.localeCompare(other))
      .forEach((id, index) => loops.set(id, { index, count: ids.length }));
  }
  return loops;
}

/** Stable positions within each set of associations joining the same classes. */
export function relationSpreads(edges: readonly ViewEdge[]): Map<string, { index: number; count: number }> {
  const spreads = new Map<string, { index: number; count: number }>();
  for (const ids of relationSpreadGroups(edges)) {
    ids.forEach((id, index) => spreads.set(id, { index, count: ids.length }));
  }
  return spreads;
}

/** Association ids grouped by their unordered pair of classes. */
function relationSpreadGroups(edges: readonly ViewEdge[]): string[][] {
  const byPair = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "relation" || edge.source === edge.target) {
      continue;
    }
    const pair = JSON.stringify([edge.source, edge.target].sort());
    byPair.set(pair, [...(byPair.get(pair) ?? []), edge.id]);
  }
  return [...byPair.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => [...ids].sort((one, other) => one.localeCompare(other)));
}

/**
 * One card, on its own.
 *
 * Exported so a panel dragging a card's corner can repaint that card without
 * re-rendering the diagram around it: on a model the size of `boats` a full
 * render is tens of milliseconds, which is a resize the pointer outruns.
 */
export function drawNode(
  node: ViewNode,
  rect: Rect,
  display: DisplayOptions,
  theme: Theme,
  isSelected: boolean
): string {
  const font = fontMetrics(display);
  const stereotype = stereotypeLabel(node);
  const lines = wrappedAttributeLines(node, display, rect.width - font.cardPadding * 2);
  const fill = display.showColors && node.kind !== "unresolved" ? node.color : theme.surface;
  const classes = [
    "tv-node",
    node.kind === "unresolved" ? "tv-unresolved" : "",
    node.isExternal ? "tv-external" : "",
    isSelected ? "tv-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  let y = rect.y + NODE.headerGap;
  let text = "";
  if (stereotype) {
    y += font.stereotype;
    text += `<text class="tv-stereotype" x="${rect.x + rect.width / 2}" y="${y}" text-anchor="middle">${escape(stereotype)}</text>`;
    y += NODE.stereotypeHeight * font.scale - font.stereotype;
  }
  y += font.name;
  text += `<text class="tv-name" x="${rect.x + rect.width / 2}" y="${y}" text-anchor="middle">${escape(nodeLabel(node, display))}</text>`;
  y =
    rect.y + (stereotype ? NODE.stereotypeHeight * font.scale : 0) + NODE.nameHeight * font.scale + NODE.headerGap * 2;

  let compartment = "";
  if (lines.length > 0) {
    compartment += `<line x1="${rect.x}" y1="${y}" x2="${rect.x + rect.width}" y2="${y}" stroke="${theme.line}" stroke-width="1"/>`;
    let lineY = y + NODE.headerGap;
    for (const line of lines) {
      lineY += font.attribute;
      compartment += `<text class="tv-attribute" x="${rect.x + font.cardPadding}" y="${lineY}">${escape(line)}</text>`;
      lineY += NODE.lineHeight * font.scale - font.attribute;
    }
  }

  const title = node.documentation && display.showDocumentation ? `<title>${escape(node.documentation)}</title>` : "";
  return (
    `<g class="${classes}" data-node="${escape(node.id)}">` +
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="3" fill="${fill}"/>` +
    title +
    text +
    compartment +
    "</g>"
  );
}

function drawEdge(edge: ViewEdge, points: Point[], theme: Theme, isSelected: boolean, data = pathData(points)): string {
  const path = `<path d="${data}"${edge.kind === "instantiation" ? ' stroke-dasharray="6 4"' : ""}/>`;
  const classes = `tv-edge${isSelected ? " tv-selected" : ""}`;
  const decoration =
    edge.kind === "generalization"
      ? triangleAt(points[points.length - 1]!, points[points.length - 2] ?? points[0]!)
      : edge.kind === "instantiation"
        ? arrowAt(points[points.length - 1]!, points[points.length - 2] ?? points[0]!)
        : relationDecoration(edge, points, theme);
  return `<g class="${classes}" data-edge="${escape(edge.id)}">${path}${decoration}</g>`;
}

/**
 * Where a derivation runs: from the relation's line to the border of what it
 * is derived from.
 *
 * UML draws a derivation as a dependency whose client is the association
 * itself, so it leaves the line rather than either end -- from the middle if
 * the way from there is clear, else from the nearest place along the middle
 * of the line that is. A relation from a class to itself loops round the
 * corner of that class, and the straight way from the middle of the loop to
 * the relator ran through the very card the loop belongs to. Only when every
 * such place is blocked does the line leave the middle and bend round.
 */
export function derivationLine(relation: Point[], supplier: Rect, obstacles: readonly Rect[]): Point[] | undefined {
  if (relation.length < 2) {
    return undefined;
  }
  const inside = (point: Point) =>
    point.x > supplier.x &&
    point.x < supplier.x + supplier.width &&
    point.y > supplier.y &&
    point.y < supplier.y + supplier.height;
  const others = obstacles.filter(
    (rect) =>
      rect !== supplier &&
      (rect.x !== supplier.x ||
        rect.y !== supplier.y ||
        rect.width !== supplier.width ||
        rect.height !== supplier.height)
  );
  const length = pathLength(relation);
  for (const fraction of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
    const start = alongPath(relation, true, length * fraction);
    if (inside(start)) {
      continue;
    }
    const tip = borderPoint(supplier, start);
    if (!others.some((rect) => segmentHitsRect(start, tip, rect, 4))) {
      return [start, tip];
    }
  }
  const start = midpointOf(relation);
  if (inside(start)) {
    return undefined;
  }
  const client = { x: start.x, y: start.y, width: 0, height: 0 };
  return routeEdge(client, supplier, {
    ends: { source: start, target: borderPoint(supplier, start) },
    obstacles: [...others],
  });
}

/**
 * A UML dependency, dashed with an open arrowhead at the supplier: the same
 * mark an instantiation uses, since both say one thing depends on another.
 */
export function drawDerivation(relation: string, supplier: string, line: Point[]): string {
  const tip = line[line.length - 1]!;
  const from = line[line.length - 2] ?? line[0]!;
  return (
    `<g class="tv-edge tv-derivation" data-derivation="${escape(relation)}" data-supplier="${escape(supplier)}">` +
    `<path d="${pathData(line)}" stroke-dasharray="6 4"/>${arrowAt(tip, from)}</g>`
  );
}

/** How much room an edge's labels want, which is how hard they are to place. */
export function labelWidth(edge: ViewEdge, display: DisplayOptions): number {
  if (edge.kind !== "relation") {
    return 0;
  }
  const font = fontMetrics(display);
  const ends = [edge.sourceEnd, edge.targetEnd].map((end) => {
    const parts = [
      display.showRoleNames ? end.role : undefined,
      display.showEndDecorations && end.isAddOnly ? "{addOnly}" : undefined,
      display.showEndDecorations && end.subsets ? `{subsets ${end.subsets}}` : undefined,
      display.showEndDecorations && end.redefines ? `{redefines ${end.redefines}}` : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    return textWidth(parts, font.edge, false, font.kind);
  });
  const middle = Math.max(
    display.showRelationNames && edge.name ? textWidth(edge.name, font.edge, false, font.kind) : 0,
    display.showRelationStereotypes && edge.stereotype
      ? textWidth(`«${edge.stereotype}»`, font.edgeStereotype, false, font.kind)
      : 0
  );
  return Math.max(middle, ...ends);
}

function drawEdgeLabels(
  edge: ViewEdge,
  points: Point[],
  display: DisplayOptions,
  theme: Theme,
  placer: LabelPlacer,
  partner?: ViewRelation
): string {
  if (edge.kind === "relation") {
    return relationLabels(edge, points, display, theme, placer, partner);
  }
  if (edge.kind === "instantiation") {
    return centreLabel(points, [{ stereotype: "«instanceOf»" }], display, theme, placer, edge.id);
  }
  return "";
}

/**
 * Where a label can go.
 *
 * A label on the midpoint of its edge is right until the midpoint is inside a
 * class, or under the label of the edge running beside it -- and on a dense
 * model both happen constantly. So each label is offered a few positions along
 * its own line, in order of preference, and takes the first that is clear of the
 * boxes and of the labels already placed. Everything it has placed is remembered,
 * which is why one of these is made per drawing and not per edge.
 */
/**
 * What being far from home costs, per pixel, in the same units as an overlap.
 *
 * Charged by distance rather than by position in the candidate list. The list is
 * ordered by preference, but its steps are not equal: with the candidates
 * ordered so that a label slides along its line before stepping off it, the
 * seventh entry was a few pixels away and cost seven times the first. A label
 * could not afford to move aside and stayed where it was misread instead.
 */
const DISPLACEMENT = 5;

/**
 * What being entirely inside a class costs, over and above the area charge.
 *
 * Large enough that nothing else can outbid it. Being read against the wrong
 * line is the other thing a label can do wrong, and it is charged hundreds --
 * so on a dense drawing a label could buy its way out of that by hiding inside
 * a class, which is not a lesser fault but the worst one there is.
 */
const HIDDEN = 4000;

class LabelPlacer {
  private readonly taken: Rect[] = [];

  /**
   * @param nodes the class boxes, which a label must not cover
   * @param groups the package boxes, which it should rather not cross -- a
   *   dashed border under a multiplicity is untidy where a class name under
   *   one is unreadable, so they weigh less than a class and more than nothing
   * @param lines every routed edge, so a label can be kept nearer the line it
   *   belongs to than to any other. A multiplicity that sits closer to the
   *   neighbouring association than to its own is read against the wrong one,
   *   and nothing about the drawing says otherwise
   */
  constructor(
    private readonly nodes: Rect[],
    private readonly groups: Rect[] = [],
    private readonly lines: Record<string, Point[]> = {},
    private readonly font: FontMetrics = fontMetrics({ fontFamily: "sans", fontSize: "medium" })
  ) {}

  /**
   * The best of the candidates: what it would cover, plus what it costs to be
   * that far from where the label belongs.
   *
   * Both halves are needed. Taking the first candidate when all of them
   * collide is what left "«componenthood» has" printed across a class -- the
   * label had nowhere good to go, and nowhere good was read as "anywhere".
   * Taking the first *clear* one is what sent "«membership» includes" a
   * hundred and fifty pixels out into open space, still clear of everything
   * and no longer beside any line: emptiness was free, so the placer bought
   * as much of it as it liked. Candidates arrive in order of preference, so
   * position in the list is what being far from home costs.
   */
  place(candidates: Point[], text: string, owner?: string): Point {
    const home = candidates[0];
    let best: { at: Point; box: Rect; score: number } | undefined;
    for (const candidate of candidates) {
      const box = boxOf(candidate, text, this.font);
      const score = this.penaltyOf(box, owner) + displacementFrom(home, candidate);
      if (!best || score < best.score) {
        best = { at: candidate, box, score };
      }
      if (score === 0) {
        break;
      }
    }
    const fallback = best ?? {
      at: candidates[0] ?? { x: 0, y: 0 },
      box: boxOf(candidates[0] ?? { x: 0, y: 0 }, text, this.font),
      score: 0,
    };
    this.taken.push(fallback.box);
    return fallback.at;
  }

  /**
   * The best of the candidates for a block whose size is known outright -- a
   * label of more than one line, where the text alone does not say how tall it
   * is. Scored like `place`, and it claims what it takes.
   */
  placeBox(candidates: Point[], width: number, height: number, owner?: string): Point {
    const home = candidates[0];
    let best: { at: Point; box: Rect; score: number } | undefined;
    for (const candidate of candidates) {
      const box = { x: candidate.x - width / 2, y: candidate.y - height / 2, width, height };
      const score = this.penaltyOf(box, owner) + displacementFrom(home, candidate);
      if (!best || score < best.score) {
        best = { at: candidate, box, score };
      }
      if (score === 0) {
        break;
      }
    }
    const fallback = best ?? {
      at: candidates[0] ?? { x: 0, y: 0 },
      box: { x: 0, y: 0, width, height },
      score: 0,
    };
    this.taken.push(fallback.box);
    return fallback.at;
  }

  /** What this box would cover, without claiming it. */
  cost(box: Rect, owner?: string): number {
    return this.penaltyOf(box, owner);
  }

  /** The largest share of a label one class would cover: 1 is out of sight. */
  hidden(box: Rect | undefined): number {
    if (!box) {
      return 0;
    }
    const area = Math.max(1, box.width * box.height);
    let worst = 0;
    for (const rect of this.nodes) {
      worst = Math.max(worst, overlapArea(box, rect) / area);
    }
    return worst;
  }

  /**
   * A line the placer was not given when it was built.
   *
   * A generalization set's bar is decided as the tree is drawn, which is
   * after the routes and before any label. Told about it, the placer can keep
   * the set's own label on it and everybody else's off it.
   */
  carry(id: string, points: Point[]): void {
    this.lines[id] = points;
  }

  /** Claims a box, so whatever is placed next avoids it. */
  take(box: Rect): void {
    this.taken.push(box);
  }

  /** Gives a claimed box back, for one taken only to weigh a second choice. */
  undo(box: Rect): void {
    const at = this.taken.lastIndexOf(box);
    if (at >= 0) {
      this.taken.splice(at, 1);
    }
  }

  /** Everything placed so far, so the drawing can be sized to include it. */
  boxes(): Rect[] {
    return this.taken;
  }

  /**
   * How much of what is already drawn this label would cover.
   *
   * A class weighs most: a multiplicity over a class name costs the reader
   * both, where the same multiplicity a little further from its line costs
   * only a glance. Another label weighs less than a class and more than a
   * dashed package border. The numbers only have to be right against
   * DISPLACEMENT, which is what moving away costs -- set too low, a label
   * would rather sit on a box than take four steps, which is how they came to
   * be printed across SeniorStaff and EmploymentContract.
   */
  private penaltyOf(box: Rect, owner?: string): number {
    let penalty = 0;
    const area = Math.max(1, box.width * box.height);
    for (const rect of this.nodes) {
      const covered = overlapArea(box, rect);
      if (covered <= 0) {
        continue;
      }
      // Charged by how much of the label is gone as well as by how much
      // of the class it covers. A multiplicity half over a border is
      // still read; one wholly inside a class is not there at all, and
      // the reader has no way to know it ever was. Squared, so the second
      // of those costs far more than twice the first -- which is what
      // stopped `*` being printed through a class name rather than
      // beside the wrong line, a trade the flat area charge lost.
      const share = covered / area;
      penalty += covered * 6 + share * share * HIDDEN;
    }
    for (const rect of this.taken) {
      penalty += overlapArea(box, rect) * 2;
    }
    for (const rect of this.groups) {
      // Only the border matters: a package box is mostly empty, and a
      // label inside one is where labels belong.
      penalty += borderOverlap(box, rect) * 0.6;
    }
    if (owner) {
      penalty += this.misreading(box, owner);
    }
    return penalty;
  }

  /**
   * What it costs to sit nearer somebody else's line than one's own.
   *
   * The reader has nothing but distance to go on: a multiplicity is read
   * against whichever line it is closest to, and on a busy diagram that is
   * regularly not the line it belongs to. Charged by how much closer the wrong
   * line is, so a label that is merely near two lines pays little and one that
   * has plainly settled on the wrong line pays a great deal.
   */
  private misreading(box: Rect, owner: string): number {
    const own = this.lines[owner];
    if (!own) {
      return 0;
    }
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const mine = distanceToPath(centre, own);
    let nearest = Infinity;
    for (const [id, path] of Object.entries(this.lines)) {
      if (id !== owner) {
        nearest = Math.min(nearest, distanceToPath(centre, path));
      }
    }
    return nearest < mine ? 260 + (mine - nearest) * 14 : 0;
  }
}

/** How much of a box lies across another's outline rather than inside it. */
function borderOverlap(box: Rect, frame: Rect): number {
  const inside = overlapArea(box, {
    x: frame.x + 2,
    y: frame.y + 2,
    width: Math.max(frame.width - 4, 0),
    height: Math.max(frame.height - 4, 0),
  });
  return overlapArea(box, frame) - inside;
}

function displacementFrom(home: Point | undefined, candidate: Point): number {
  return home ? Math.hypot(candidate.x - home.x, candidate.y - home.y) * DISPLACEMENT : 0;
}

function overlapArea(one: Rect, other: Rect): number {
  const width = Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x);
  const height = Math.min(one.y + one.height, other.y + other.height) - Math.max(one.y, other.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function boxOf(anchor: Point, text: string, font: FontMetrics): Rect {
  const width = textWidth(text, font.edge, false, font.kind) + 6;
  return { x: anchor.x - width / 2, y: anchor.y - font.edge, width, height: font.edge + 4 };
}

/** The whole-part diamond, on the end the language says holds the whole. */
function relationDecoration(edge: ViewRelation, points: Point[], theme: Theme): string {
  if (!edge.whole) {
    return "";
  }
  const atSource = edge.whole === "source";
  const tip = atSource ? points[0]! : points[points.length - 1]!;
  const towards = atSource ? (points[1] ?? points[0]!) : (points[points.length - 2] ?? points[0]!);
  const diamond = diamondAt(tip, towards);
  return edge.composition
    ? diamond.replace('class="tv-marker"', `class="tv-marker" style="fill:${escape(theme.line)}"`)
    : diamond;
}

/**
 * What is written along an association, and for an inverse pair what is written
 * along the one line that stands for both.
 *
 * The line runs the way the drawn half is written, so that half reads forwards
 * and its inverse reads back along the same line. Each keeps its own reading
 * triangle, which is what makes one line carry two sentences without ambiguity:
 * `Man hasChild ▶ Person` and `◀ hasFather`.
 *
 * A stereotype stays over the name it belongs to, as UML sets it, and is written
 * once when both halves declare the same one. They often do not -- a material
 * relation is regularly the inverse of a mediation -- and saying `«material»`
 * over a line that is half a mediation would be the picture disagreeing with the
 * model.
 */
function relationLabels(
  edge: ViewRelation,
  points: Point[],
  display: DisplayOptions,
  theme: Theme,
  placer: LabelPlacer,
  partner?: ViewRelation
): string {
  const stereotypeOf = (one: ViewRelation): string | undefined =>
    display.showRelationStereotypes && one.stereotype ? `«${one.stereotype}»` : undefined;
  const nameOf = (one: ViewRelation): string | undefined =>
    display.showRelationNames && one.name ? one.name : undefined;

  const shared = partner !== undefined && edge.stereotype === partner.stereotype;
  const readings: Reading[] = [reading(stereotypeOf(edge), nameOf(edge), "forward")];
  if (partner) {
    readings.push(reading(shared ? undefined : stereotypeOf(partner), nameOf(partner), "backward"));
  }

  let markup = centreLabel(points, readings, display, theme, placer, edge.id);
  markup += endLabel(edge, points, true, display, theme, placer);
  markup += endLabel(edge, points, false, display, theme, placer);
  return markup;
}

/** A reading, with its triangle only where there is a name to point away from. */
function reading(stereotype: string | undefined, name: string | undefined, along: Reading["direction"]): Reading {
  return {
    ...(stereotype ? { stereotype } : {}),
    ...(name ? { name, direction: along } : {}),
  };
}

/**
 * What is written at one end of an association: the multiplicity, the role name
 * with whatever the end redefines, and the padlock if the end is not const.
 *
 * Placed as one group rather than as three labels that happen to be near each
 * other. Each found its own spot before, and where all three occurred together
 * they scattered -- a multiplicity tight against the box, a role name forty
 * pixels further along, a padlock across the line from both. None of them read
 * as belonging to the same end, and on a class with several associations
 * leaving it some of them read as belonging to the wrong one.
 *
 * So one distance from the end is chosen for the whole group, and the two sides
 * of the line are used as UML uses them: the multiplicity on one, the role name
 * on the other, level with each other. The padlock travels with the role name,
 * after it, where a property string like `{addOnly}` goes -- and alone on that
 * side when there is no role name to travel with, opposite the multiplicity
 * rather than adrift.
 *
 * `const` itself is never written. An end that cannot change is the ordinary
 * case here, and a decoration on the ordinary case is noise on every line; the
 * exception gets the mark instead.
 */
function endLabel(
  edge: ViewRelation,
  points: Point[],
  atSource: boolean,
  display: DisplayOptions,
  theme: Theme,
  placer: LabelPlacer
): string {
  const font = fontMetrics(display);
  const end = atSource ? edge.sourceEnd : edge.targetEnd;
  const multiplicity = display.showCardinalities ? multiplicityLabel(end.cardinality) : undefined;

  const role: string[] = [];
  if (display.showRoleNames && end.role) {
    role.push(end.role);
  }
  if (display.showEndDecorations) {
    if (end.isAddOnly) {
      role.push("{addOnly}");
    }
    if (end.subsets) {
      role.push(`{subsets ${end.subsets}}`);
    }
    if (end.redefines) {
      role.push(`{redefines ${end.redefines}}`);
    }
  }
  const roleText = role.join(" ");
  const lock = display.showEndDecorations && !end.isConst;
  if (!multiplicity && !roleText && !lock) {
    return "";
  }

  const forwards = atSource ? points : [...points].reverse();
  const total = pathLength(points);
  // Never past the middle of the line, since beyond that a multiplicity reads
  // as the other end's. Within that, far enough to get out from under a class
  // the line runs alongside: a mediation leaving the bottom of a relator runs
  // parallel to it for the whole of its first fifty pixels, and every place
  // the group could stand there was inside one class or another.
  const reach = Math.min(total * 0.45, 128);
  const multiplicityWidth = multiplicity ? textWidth(multiplicity, font.edge, false, font.kind) : 0;
  const textOnly = textWidth(roleText, font.edge, false, font.kind);
  const roleWidth = textOnly + (lock ? LOCK.width + LOCK.gap : 0);

  interface Candidate {
    at: number;
    side: number;
    multiplicity?: Placed;
    role?: Placed;
  }
  const candidates: Candidate[] = [];
  for (const distance of [13, 18, 24, 32, 42, 54, 70, 88, 108]) {
    const at = Math.min(distance, reach);
    for (const side of [1, -1]) {
      candidates.push({
        at,
        side,
        ...(multiplicity
          ? {
              multiplicity: placedAt(
                besideLine(forwards, at, multiplicityWidth, [side], font)[0]!,
                multiplicityWidth,
                font
              ),
            }
          : {}),
        ...(roleWidth > 0
          ? { role: placedAt(besideLine(forwards, at, roleWidth, [-side], font)[0]!, roleWidth, font) }
          : {}),
      });
    }
  }

  // Turning the group over has a price, since which side the multiplicity is
  // on says something and says less if it changes from line to line -- but
  // less of a price than being read against the wrong line, which is what the
  // other side is often the way out of.
  const awayFrom = (one: Candidate) => (one.at - 13) * DISPLACEMENT + (one.side === 1 ? 0 : 120);
  const cheapest = (of: (one: Candidate) => Rect | undefined) =>
    candidates.reduce(
      (best, one) => {
        const box = of(one);
        const cost = (box ? placer.cost(box, edge.id) : 0) + awayFrom(one);
        return !best || cost < best.cost ? { one, cost } : best;
      },
      undefined as { one: Candidate; cost: number } | undefined
    );

  // Scored as a pair: one distance and one flip for both of them.
  const together = candidates.reduce(
    (chosen, one) => {
      const cost =
        (one.multiplicity ? placer.cost(one.multiplicity.box, edge.id) : 0) +
        (one.role ? placer.cost(one.role.box, edge.id) : 0) +
        awayFrom(one);
      return !chosen || cost < chosen.cost ? { one, cost } : chosen;
    },
    undefined as { one: Candidate; cost: number } | undefined
  );
  if (!together) {
    return "";
  }

  let chosenMultiplicity = together.one.multiplicity;
  let chosenRole = together.one.role;
  // One distance and two sides for the pair, so that a multiplicity and the
  // role name opposite it read as belonging to the same end. Unless that
  // leaves one of them inside a class, where it is not read at all: being one
  // group is worth a great deal, and worth less than being on the drawing.
  if (placer.hidden(chosenMultiplicity?.box) > 0.5 || placer.hidden(chosenRole?.box) > 0.5) {
    chosenMultiplicity = cheapest((one) => one.multiplicity?.box)?.one.multiplicity;
    if (chosenMultiplicity) {
      // Claimed before the role is chosen, so the two do not both take it.
      placer.take(chosenMultiplicity.box);
    }
    chosenRole = cheapest((one) => one.role?.box)?.one.role;
    if (chosenMultiplicity) {
      placer.undo(chosenMultiplicity.box);
    }
  }

  let markup = "";
  if (chosenMultiplicity && multiplicity) {
    placer.take(chosenMultiplicity.box);
    markup += label(chosenMultiplicity.at.x, chosenMultiplicity.at.y, multiplicity, theme, "middle", "tv-end", edge.id);
  }
  if (chosenRole) {
    placer.take(chosenRole.box);
    const { at } = chosenRole;
    // The group is centred on `at`: the text takes the left of it and the
    // padlock follows, so a role name and its mark read in that order
    // however wide the name is.
    const left = at.x - roleWidth / 2;
    if (roleText) {
      markup += label(left + textOnly / 2, at.y, roleText, theme, "middle", "tv-end", edge.id);
    }
    if (lock) {
      markup += padlock({ x: left + textOnly + (roleText ? LOCK.gap : 0), y: at.y - LOCK.height + 3 }, theme, edge.id);
    }
  }
  return markup;
}

/** A label and the box it will occupy. */
interface Placed {
  at: Point;
  box: Rect;
}

function placedAt(at: Point, width: number, font: FontMetrics): Placed {
  return { at, box: { x: at.x - width / 2, y: at.y - font.edge, width, height: font.edge + 4 } };
}

const LOCK = { width: 11, height: 11, gap: 4 } as const;

/**
 * An open padlock: this end may change.
 *
 * Drawn rather than written, and drawn open, because it marks the exception. A
 * word would be read as part of the role name beside it; a small glyph after it
 * is read as a property of the end, which is where UML puts `{addOnly}` and the
 * rest.
 */
function padlock(at: Point, theme: Theme, owner: string): string {
  return (
    `<g class="tv-lock" data-for="${escape(owner)}" ` +
    `transform="translate(${round(at.x)}, ${round(at.y)})" aria-label="not const">` +
    `<title>this end may change (not const)</title>` +
    `<path d="M 1.4 4.6 V 2.9 a 2.5 2.5 0 0 1 5 0"/>` +
    `<rect x="2.8" y="4.6" width="6.8" height="5.4" rx="1.3" stroke="${theme.muted}"/>` +
    `</g>`
  );
}
/**
 * One sentence written along a line: a name, and over it the stereotype.
 *
 * Two lines rather than one, because they are not the same kind of thing: the
 * stereotype says what sort of relation this is and the name says what it is
 * called, and `«mediation» binds` run together reads as a four-word phrase. UML
 * sets the stereotype over the name for the same reason it sets it over a class
 * name. It is set smaller here too, so a line of a model does not begin with the
 * word «characterization» in the same size as everything else.
 */
interface Reading {
  stereotype?: string;
  name?: string;
  /** Which way along the line the name reads; `forward` is source to target. */
  direction?: "forward" | "backward";
}

/**
 * Everything written at the middle of one line, as one block.
 *
 * A line usually carries one reading. An inverse pair carries two, and they are
 * placed together rather than found a spot each: they belong to the same line,
 * and two blocks bidding separately for room near it end up on opposite sides
 * of it, reading as the labels of two different lines -- which is the thing
 * drawing the pair as one line was for.
 */
function centreLabel(
  points: Point[],
  readings: Reading[],
  display: DisplayOptions,
  theme: Theme,
  placer: LabelPlacer,
  owner?: string
): string {
  const font = fontMetrics(display);
  const line = { stereotype: 12 * font.scale, name: 14 * font.scale };
  // A margin over the estimate, since the triangle is placed off the end of
  // the text and a mark on the last letter is worse than a small gap. The
  // estimate is weighted per character, so the margin can be small -- and the
  // name is now on its own, without the guillemets the estimate overshoots on.
  const nameWidth = (one: Reading) => (one.name ? textWidth(one.name, font.edge, false, font.kind) * 1.02 : 0);
  const markerOf = (one: Reading) => (one.direction && one.name ? MARKER : 0);
  const lines = readings.filter((one) => one.stereotype !== undefined || one.name !== undefined);
  if (lines.length === 0) {
    return "";
  }

  const width = Math.max(
    ...lines.map((one) =>
      Math.max(
        nameWidth(one) + markerOf(one),
        one.stereotype ? textWidth(one.stereotype, font.edgeStereotype, false, font.kind) : 0
      )
    )
  );
  const height = lines.reduce(
    (total, one) => total + (one.stereotype ? line.stereotype : 0) + (one.name ? line.name : 0),
    0
  );

  // Outwards from the middle, and step-major: a label that cannot sit at the
  // middle of its line belongs a little further along it, not a label's width
  // out to the side.
  const length = pathLength(points);
  const fractions = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];
  const candidates = [0, 1, -1, 2, -2].flatMap((step) =>
    fractions.map((fraction) => besideLine(points, length * fraction, { width, height }, [step], font)[0]!)
  );
  const at = placer.placeBox(candidates, width, height, owner);

  let markup = "";
  let top = at.y - height / 2;
  for (const one of lines) {
    if (one.stereotype) {
      markup += label(
        at.x,
        top + line.stereotype - 2 * font.scale,
        one.stereotype,
        theme,
        "middle",
        "tv-edge-stereotype",
        owner
      );
      top += line.stereotype;
    }
    if (one.name) {
      // The name keeps the middle and the triangle sits just off the end
      // it points at, which is where a reader expects the arrow of
      // "A has B ▶" to be -- and of "◀ B is had by A" on the way back.
      const baseline = top + line.name - 3 * font.scale;
      const marker = markerOf(one);
      const back = one.direction === "backward" ? -1 : 1;
      const centre = at.x - (back * marker) / 2;
      markup += label(centre, baseline, one.name, theme, "middle", undefined, owner);
      if (marker > 0) {
        const along = directionNear(points, at);
        const tip = { x: centre + back * (nameWidth(one) / 2 + marker), y: baseline - 3.5 };
        markup += readingTriangle(tip, { x: along.x * back, y: along.y * back });
      }
      top += line.name;
    }
  }
  return markup;
}

const MARKER = 9;

/** The direction the line runs at the point nearest `at`, source to target. */
function directionNear(points: Point[], at: Point): Point {
  let best: { direction: Point; distance: number } | undefined;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const distance = Math.hypot(middle.x - at.x, middle.y - at.y);
    if (!best || distance < best.distance) {
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      best = { direction: { x: (to.x - from.x) / length, y: (to.y - from.y) / length }, distance };
    }
  }
  return best?.direction ?? { x: 1, y: 0 };
}

/** UML's filled reading-direction triangle, pointing the way the name is read. */
function readingTriangle(tip: Point, direction: Point): string {
  const back = { x: tip.x - direction.x * 7, y: tip.y - direction.y * 7 };
  const normal = { x: -direction.y, y: direction.x };
  return (
    `<polygon class="tv-reading" points="${round(tip.x)},${round(tip.y)} ` +
    `${round(back.x + normal.x * 3.4)},${round(back.y + normal.y * 3.4)} ` +
    `${round(back.x - normal.x * 3.4)},${round(back.y - normal.y * 3.4)}"/>`
  );
}

/**
 * Places beside the line at a point along it, stepped off along the line's own
 * perpendicular.
 *
 * Offsetting downwards is right for a horizontal edge and useless for a vertical
 * one, where it slides the label along the line it is trying to get off. On a
 * taxonomy -- where nearly every edge is vertical -- that was every label
 * landing on its own line or on the box below.
 */
function besideLine(
  points: Point[],
  at: number,
  size: number | { width: number; height: number },
  steps: number[],
  font: FontMetrics
): Point[] {
  const here = alongPath(points, true, at);
  const ahead = alongPath(points, true, at + 12);
  const dx = ahead.x - here.x;
  const dy = ahead.y - here.y;
  const length = Math.hypot(dx, dy) || 1;
  const vertical = Math.abs(dy) > Math.abs(dx);
  const width = typeof size === "number" ? size : size.width;
  const height = typeof size === "number" ? font.edge + 2 : size.height;
  // Off a vertical line by half the label's width plus a margin, off a
  // horizontal one by half its height: what it takes to clear it either way.
  const reach = vertical ? width / 2 + 9 : height / 2 + 7;
  let normal = { x: -(dy / length), y: dx / length };
  // Turned so that side 1 is always up or to the right, whichever way the
  // line runs. Without this the multiplicity sits above one line and below
  // the next, and which side a label is on stops meaning anything.
  if (normal.y > 0 || (normal.y === 0 && normal.x < 0)) {
    normal = { x: -normal.x, y: -normal.y };
  }
  return steps.map((step) => ({
    x: here.x + normal.x * reach * step,
    y: here.y + normal.y * reach * step + (vertical ? 4 : 0),
  }));
}

function pathLength(points: Point[]): number {
  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index]!;
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

/**
 * Text with a halo of the paper colour, so a label that lands on a line is still
 * readable. `paint-order` draws the stroke first and the fill over it, which is
 * the one way to outline text without doubling the markup.
 */
function label(
  x: number,
  y: number,
  text: string,
  theme: Theme,
  anchor: "middle" | "start",
  className?: string,
  owner?: string
): string {
  return (
    `<text${className ? ` class="${className}"` : ""}${owner ? ` data-for="${escape(owner)}"` : ""} ` +
    `x="${round(x)}" y="${round(y)}" ` +
    `text-anchor="${anchor}" paint-order="stroke" stroke="${theme.background}" stroke-width="3" ` +
    `stroke-linejoin="round">${escape(text)}</text>`
  );
}

/**
 * The shared triangle and bus of an explicit generalization set.
 *
 * Ordinary specializations always keep their own lines and triangles. Sharing
 * those lines merely because several classes specialize the same parent invents
 * a set that the model never declared.
 */
interface BusLine {
  /** Which axis the bus runs across: true for a horizontal bus (a vertical tree), false for a vertical one. */
  vertical: boolean;
  /** The bus's depth along the tree's primary axis -- a y for a vertical tree, an x for a horizontal one. */
  at: number;
  from: number;
  to: number;
}

/**
 * Which side of the general a tree reads from, and the arithmetic for that
 * side -- shared by the stem `assignPorts` reserves and the tree actually
 * drawn there, since the two must agree on where the triangle goes.
 */
function treeSide(general: Rect, children: readonly Rect[]): Side {
  const votes: Record<Side, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const child of children) {
    votes[sideOf(general, centerOf(child))] += 1;
  }
  return votes.top + votes.bottom >= votes.left + votes.right
    ? votes.bottom >= votes.top
      ? "bottom"
      : "top"
    : votes.right >= votes.left
      ? "right"
      : "left";
}

/**
 * The geometry of one side, as the direction a tree grows in rather than a
 * name: the axis the triangle points along (primary) and the one its bus
 * spans (cross), and back again into the `{x, y}` a path is actually drawn
 * with. A vertical tree -- general above, subtypes below or above it -- and a
 * horizontal one -- subtypes to one side -- read the same from here on.
 */
interface TreeAxis {
  vertical: boolean;
  direction: 1 | -1;
  /** A point's coordinate along the primary axis. */
  primary(point: Point): number;
  /** A box's far edge along the primary axis. */
  primaryEnd(rect: Rect): number;
  /** A box's near edge along the primary axis -- the same field as `primary`, spelled for a box. */
  primaryStart(rect: Rect): number;
  /** A box's centre along the cross axis. */
  cross(rect: Rect): number;
  /** A point's coordinate along the cross axis. */
  crossOfPoint(point: Point): number;
  crossStart(rect: Rect): number;
  crossEnd(rect: Rect): number;
  point(primary: number, cross: number): Point;
}

function treeAxis(side: Side): TreeAxis {
  const vertical = side === "top" || side === "bottom";
  const direction = side === "bottom" || side === "right" ? 1 : -1;
  return vertical
    ? {
        vertical,
        direction,
        primary: (point) => point.y,
        primaryEnd: (rect) => rect.y + rect.height,
        primaryStart: (rect) => rect.y,
        cross: (rect) => centerOf(rect).x,
        crossOfPoint: (point) => point.x,
        crossStart: (rect) => rect.x,
        crossEnd: (rect) => rect.x + rect.width,
        point: (primary, cross) => ({ x: cross, y: primary }),
      }
    : {
        vertical,
        direction,
        primary: (point) => point.x,
        primaryEnd: (rect) => rect.x + rect.width,
        primaryStart: (rect) => rect.x,
        cross: (rect) => centerOf(rect).y,
        crossOfPoint: (point) => point.y,
        crossStart: (rect) => rect.y,
        crossEnd: (rect) => rect.y + rect.height,
        point: (primary, cross) => ({ x: primary, y: cross }),
      };
}

/**
 * The subtypes that are actually between the general and the bus -- a
 * subtype dragged onto the general's own side of the tree, or level with it,
 * has no say in how deep the bus runs, since it is not between the general
 * and anything there. Falls back to every subtype where none of them is, so
 * a gap still gets measured rather than divided by zero.
 */
function onTreeSide(general: Rect, children: readonly Rect[], axis: TreeAxis): readonly Rect[] {
  const onSide = children.filter((rect) =>
    axis.direction > 0
      ? axis.primaryStart(rect) >= axis.primaryEnd(general)
      : axis.primaryEnd(rect) <= axis.primaryStart(general)
  );
  return onSide.length > 0 ? onSide : children;
}

/** The key `assignPorts` was given the tree's stem under, and this looks it back up by. */
function treeStemId(plan: TreePlan): string {
  return `tree:${plan.marker ?? plan.general}`;
}

/**
 * Where each generalization tree reaches towards, so `assignPorts` can give
 * its shared stem a fan slot on the general's border beside whatever
 * associations leave from the same side -- instead of the tree choosing a
 * place of its own that knows nothing about them.
 */
function treeStems(plans: TreePlan[], positions: Positions): TreeStem[] {
  const stems: TreeStem[] = [];
  for (const plan of plans) {
    const general = positions[plan.general];
    const children = plan.children.map((id) => positions[id]).filter((rect): rect is Rect => rect !== undefined);
    if (!general || children.length < 2) {
      continue;
    }
    const axis = treeAxis(treeSide(general, children));
    const reach = onTreeSide(general, children, axis);
    stems.push({
      id: treeStemId(plan),
      node: plan.general,
      towards: axis.point(
        axis.direction > 0
          ? Math.min(...reach.map((rect) => axis.primaryStart(rect)))
          : Math.max(...reach.map((rect) => axis.primaryEnd(rect))),
        reach.reduce((sum, rect) => sum + axis.cross(rect), 0) / reach.length
      ),
    });
  }
  return stems;
}

function drawTree(
  plan: TreePlan,
  positions: Positions,
  theme: Theme,
  placer: LabelPlacer,
  font: FontMetrics,
  obstacles: Rect[] = [],
  buses: BusLine[] = [],
  stems: ReadonlyMap<string, Point> = new Map(),
  heads: HeadMarker[] = [],
  headStrokes: HeadStroke[] = []
): string {
  const general = positions[plan.general];
  const children = plan.children
    .map((id) => ({ id, rect: positions[id] }))
    .filter((entry): entry is { id: string; rect: Rect } => entry.rect !== undefined);
  if (!general || children.length < 2) {
    return "";
  }

  // Which side of the general the bus sits on -- a majority vote, not a
  // unanimous one: a subtype dragged level with its general, or past it, no
  // longer says which side the *tree* belongs on, but its siblings still do,
  // and a set does not lose its bar because one member is having its rank
  // rearranged. Reads a horizontal arrangement as readily as the vertical one
  // a taxonomy usually is, so a set whose subtypes were dragged beside their
  // general anchors there instead of forcing a bus over the top or bottom of
  // a box none of them are near.
  const side = treeSide(
    general,
    children.map((entry) => entry.rect)
  );
  const axis = treeAxis(side);
  const direction = axis.direction;

  // Each of a parent's trees gets its own place along the border, from the
  // same fan `assignPorts` spread the associations along -- reserved there by
  // a stem standing in for the whole tree, so the triangle does not land on
  // a line one of its own siblings already claimed. Only a tree `assignPorts`
  // was never told about -- none should exist -- falls back to dividing the
  // border evenly by lane.
  const stem = stems.get(treeStemId(plan));
  const crossSize = axis.crossEnd(general) - axis.crossStart(general);
  const span = Math.max(crossSize - 28, 0);
  const crossAt = stem
    ? Math.round(axis.crossOfPoint(stem))
    : Math.round(
        axis.crossStart(general) + (crossSize - span) / 2 + (span * (plan.lane.index + 1)) / (plan.lane.count + 1)
      );
  const apex = axis.point(direction > 0 ? axis.primaryEnd(general) : axis.primaryStart(general), crossAt);
  const base = axis.point(axis.primary(apex) + 14 * direction, crossAt);
  // The gap the bus has room to sit in, measured only against the subtypes
  // that are actually on the tree's own side -- a subtype dragged onto the
  // wrong side of the general has no say in how deep the bus runs, since it
  // is not between the general and anything there.
  const onSide = onTreeSide(
    general,
    children.map((entry) => entry.rect),
    axis
  );
  const nearest =
    direction > 0
      ? Math.min(...onSide.map((rect) => axis.primaryStart(rect)))
      : Math.max(...onSide.map((rect) => axis.primaryEnd(rect)));
  const bus = busDepth(plan, axis, base, nearest, children, obstacles, buses);

  const crossLow = Math.min(...children.map((entry) => axis.cross(entry.rect)), axis.crossOfPoint(base));
  const crossHigh = Math.max(...children.map((entry) => axis.cross(entry.rect)), axis.crossOfPoint(base));
  buses.push({ vertical: axis.vertical, at: bus, from: crossLow, to: crossHigh });

  let markup = `<g class="tv-edge tv-tree"${plan.marker ? ` data-genset="${escape(plan.marker)}"` : ""}>`;
  // The triangle's two base corners sit either side of `base` along the
  // cross axis -- the same nine pixels a vertical tree always used, now
  // measured across whichever axis the bus actually runs on.
  const cornerLeft = axis.point(axis.primary(base), crossAt - 9);
  const cornerRight = axis.point(axis.primary(base), crossAt + 9);
  heads.push({ owner: plan.marker ?? plan.general, points: [apex, cornerLeft, cornerRight] });
  markup +=
    `<polygon class="tv-marker" points="${round(apex.x)},${round(apex.y)} ` +
    `${round(cornerLeft.x)},${round(cornerLeft.y)} ${round(cornerRight.x)},${round(cornerRight.y)}"/>`;
  const busStart = axis.point(bus, crossAt);
  headStrokes.push({ owner: plan.marker ?? plan.general, points: [base, busStart] });
  markup += `<path d="M ${round(base.x)} ${round(base.y)} L ${round(busStart.x)} ${round(busStart.y)}"/>`;
  const left = crossLow;
  const right = crossHigh;
  const busLeft = axis.point(bus, left);
  const busRight = axis.point(bus, right);
  markup += `<path d="M ${round(busLeft.x)} ${round(busLeft.y)} L ${round(busRight.x)} ${round(busRight.y)}"/>`;
  for (const entry of children) {
    markup += `<path d="${legPath(entry.rect, bus, obstacles, axis)}"/>`;
  }

  if (plan.label) {
    const label = plan.label;
    const width = textWidth(label, font.edge, false, font.kind);
    // The label belongs to the bar, so it is written on the bar: centred
    // along it, on the side the parent is. Beside the stem is where it went
    // before, which on a parent that has a subtype outside the set is on
    // top of that subtype's line -- `PersonAgePhases {disjoint, complete}`
    // printed across the generalization to `Employee`, a class the set does
    // not hold. A label is read against whatever line is nearest it, so the
    // bar is registered as a line and the label pays for leaving it.
    placer.carry(plan.marker ?? plan.general, [axis.point(bus, left), axis.point(bus, right)]);
    const middle = (left + right) / 2;
    // Clear of the bar either way: six one way puts the text wholly on the
    // near side of it, sixteen the other puts it wholly on the far one.
    const above = bus - 6;
    const below = bus + 16;
    const near = direction > 0 ? above : below;
    const far = direction > 0 ? below : above;
    const baseCross = axis.crossOfPoint(base);
    const at = placer.place(
      [
        axis.point(near, middle),
        axis.point(far, middle),
        axis.point(near, baseCross + width / 2 + 14),
        axis.point(near, baseCross - width / 2 - 14),
      ],
      label,
      plan.marker ?? plan.general
    );
    markup +=
      `<text x="${round(at.x)}" y="${round(at.y)}" fill="${theme.muted}" text-anchor="middle" ` +
      `paint-order="stroke" stroke="${theme.background}" stroke-width="3" stroke-linejoin="round">` +
      `${escape(label)}</text>`;
  }
  return markup + "</g>";
}

interface TreePlan {
  general: string;
  children: string[];
  edges: string[];
  label?: string;
  marker?: string;
  /** Which of this parent's trees this is, and how many it has. */
  lane: { index: number; count: number };
}

/**
 * Which specializations are drawn as trees, decided before anything is routed.
 *
 * The edges a tree takes over are not routed at all, and must not be: a line
 * nobody draws still counts as one to the label placer, which would then keep
 * multiplicities away from lines that are not there.
 */
function planTrees(view: ViewModel, positions: Positions): { plans: TreePlan[]; covered: Set<string> } {
  const plans: TreePlan[] = [];
  const covered = new Set<string>();

  for (const genset of view.gensets) {
    if (!genset.general || !canDrawTree(genset.general, genset.specifics, positions)) {
      continue;
    }
    const constraints = [genset.disjoint ? "disjoint" : "", genset.complete ? "complete" : ""].filter(Boolean);
    plans.push({
      general: genset.general,
      children: genset.specifics,
      edges: view.edges
        .filter((edge) => edge.kind === "generalization" && edge.genset === genset.id)
        .map((edge) => edge.id),
      label: constraints.length > 0 ? `${genset.name} {${constraints.join(", ")}}` : genset.name,
      marker: genset.id,
      lane: { index: 0, count: 1 },
    });
  }
  for (const plan of plans) {
    for (const id of plan.edges) {
      covered.add(id);
    }
  }

  // A class may be the general of several declared sets. Each set needs its
  // own lane so their triangles and buses do not lie on top of one another.
  const byGeneral = new Map<string, TreePlan[]>();
  for (const plan of plans) {
    byGeneral.set(plan.general, [...(byGeneral.get(plan.general) ?? []), plan]);
  }
  for (const family of byGeneral.values()) {
    family.forEach((plan, index) => {
      plan.lane = { index, count: family.length };
    });
  }

  return { plans, covered };
}

/**
 * Which edge of a subtype's box the bus actually reaches it from.
 *
 * Every leg in a tree faces the same way while the drag that put it there
 * agreed with the rest -- but one dragged past the bus, onto its general's own
 * side of it, faces the opposite edge. A leg that kept aiming at the far one
 * regardless would run through the box on its way to the border it used to
 * meet, which is worse than the tree it was drawn to save.
 */
function legEdge(child: Rect, bus: number, axis: TreeAxis): number {
  const near = axis.primaryStart(child);
  const far = axis.primaryEnd(child);
  if (bus <= near) {
    return near;
  }
  if (bus >= far) {
    return far;
  }
  return Math.abs(bus - near) <= Math.abs(bus - far) ? near : far;
}

/**
 * A leg from the bus down to one subtype, round anything in the way.
 *
 * A subtype further from the parent than its siblings has a long leg, and on a
 * dense diagram there is often a class standing in it. Straight through is the
 * one thing it must not do -- a line that disappears behind a class it has
 * nothing to do with is read as ending there -- so it steps aside, comes down
 * beside the obstacle and turns back in just above the subtype.
 */
function legPath(child: Rect, bus: number, obstacles: Rect[], axis: TreeAxis): string {
  const centre = axis.cross(child);
  const edge = legEdge(child, bus, axis);
  const direction = edge >= bus ? 1 : -1;
  const from = axis.point(bus, centre);
  const to = axis.point(edge, centre);
  const blocking = obstacles.filter((rect) => rect !== child && segmentHitsRect(from, to, rect, 2));
  if (blocking.length === 0) {
    return `M ${round(from.x)} ${round(from.y)} L ${round(to.x)} ${round(to.y)}`;
  }

  const turn = edge - direction * 22;
  for (const rect of blocking) {
    for (const aside of [axis.crossStart(rect) - 20, axis.crossEnd(rect) + 20]) {
      const viaBus = axis.point(bus, aside);
      const viaTurn = axis.point(turn, aside);
      const backIn = axis.point(turn, centre);
      const clear = !obstacles.some(
        (other) =>
          other !== child &&
          (segmentHitsRect(from, viaBus, other, 2) ||
            segmentHitsRect(viaBus, viaTurn, other, 2) ||
            segmentHitsRect(viaTurn, backIn, other, 2))
      );
      if (clear) {
        return (
          `M ${round(from.x)} ${round(from.y)} L ${round(viaBus.x)} ${round(viaBus.y)} ` +
          `L ${round(viaTurn.x)} ${round(viaTurn.y)} L ${round(backIn.x)} ${round(backIn.y)} ` +
          `L ${round(to.x)} ${round(to.y)}`
        );
      }
    }
  }
  return `M ${round(from.x)} ${round(from.y)} L ${round(to.x)} ${round(to.y)}`;
}

/**
 * How deep to run the bus.
 *
 * Halfway between the parent and its nearest subtype is the usual place, but a
 * bus is a long horizontal line and there is often a class sitting on it, or on
 * the leg of a subtype further away. So a few depths in the gap are tried and
 * the one that crosses fewest boxes wins, the middle breaking ties -- and where
 * a parent has more than one tree they start from different depths, so two
 * buses do not lie on top of each other.
 */
function busDepth(
  plan: TreePlan,
  axis: TreeAxis,
  base: Point,
  nearest: number,
  children: Array<{ rect: Rect }>,
  obstacles: Rect[],
  buses: BusLine[]
): number {
  const direction = axis.direction;
  const basePrimary = axis.primary(base);
  const gap = Math.abs(nearest - basePrimary);
  const innerStart = Math.min(basePrimary, nearest) + 7;
  const innerEnd = Math.max(basePrimary, nearest) - 7;
  if (innerStart > innerEnd) {
    return Math.round((basePrimary + nearest) / 2);
  }
  const lane = plan.lane.count > 1 ? (plan.lane.index - (plan.lane.count - 1) / 2) * 20 : 0;
  // A lane is a preference inside the available gap, never permission to
  // leave it. With four sets on one general and a shallow rank gap, the outer
  // offsets used to put one bus behind the triangle and another beyond the
  // subtype row. Clamping before scoring retains as much lane separation as
  // the gap can hold without growing stems out of the tree at either end.
  const candidates = [
    ...new Set(
      [0.5, 0.35, 0.65, 0.25, 0.75, 0.85]
        .map((fraction) => Math.round(basePrimary + direction * (gap * fraction + lane)))
        .map((depth) => Math.max(innerStart, Math.min(innerEnd, depth)))
    ),
  ];
  if (candidates.length === 0) {
    return Math.round((basePrimary + nearest) / 2);
  }

  const left = Math.min(...children.map((entry) => axis.cross(entry.rect)), axis.crossOfPoint(base));
  const right = Math.max(...children.map((entry) => axis.cross(entry.rect)), axis.crossOfPoint(base));
  let best = { depth: candidates[0]!, crossings: Infinity };
  for (const depth of candidates) {
    // Another tree's bus at the same depth is worth as much as a class in
    // the way: several parents at one rank all put their bus halfway to the
    // next, and four of them lay on top of one another for hundreds of
    // pixels, reading as one long line with legs going everywhere. Only a
    // bus on the same axis competes for it -- a vertical tree's depth is a
    // y, and has nothing to say about a horizontal one's x.
    let crossings =
      buses.filter(
        (other) =>
          other.vertical === axis.vertical && Math.abs(other.at - depth) < 12 && other.from < right && left < other.to
      ).length * 2;
    for (const rect of obstacles) {
      if (segmentHitsRect(axis.point(depth, left), axis.point(depth, right), rect, 2)) {
        crossings += 1;
      }
      for (const entry of children) {
        const centre = axis.cross(entry.rect);
        const edge = legEdge(entry.rect, depth, axis);
        if (rect !== entry.rect && segmentHitsRect(axis.point(depth, centre), axis.point(edge, centre), rect, 2)) {
          crossings += 1;
        }
      }
    }
    if (crossings < best.crossings) {
      best = { depth, crossings };
    }
    if (crossings === 0) {
      break;
    }
  }
  return best.depth;
}

/**
 * A tree needs a general and at least two subtypes to share -- and nothing
 * about where any of them currently sit.
 *
 * It used to ask for every subtype strictly on one side of the general, which
 * read a drag that put one of them level with it, or past it, as the set
 * coming apart: the whole shared triangle and the `{disjoint, complete}` it
 * carries disappeared over what is, to whoever dropped it there, one member
 * having its rank rearranged. `drawTree` now decides the bus's side by a
 * majority of the subtypes rather than all of them, and routes each leg to
 * whichever edge of its box actually faces the bus, so there is no longer a
 * geometry this can get wrong -- only one it draws a longer leg for.
 */
function canDrawTree(generalId: string, childIds: string[], positions: Positions): boolean {
  const general = positions[generalId];
  const children = childIds.map((id) => positions[id]).filter((rect): rect is Rect => rect !== undefined);
  return general !== undefined && children.length >= 2;
}

/**
 * A box round each package, where one can honestly be drawn.
 *
 * The box is the bounding rectangle of the package's classes, which is only the
 * package if nothing else has landed inside it. Laid out as one graph -- which
 * is what ignoring the packages means -- classes interleave, and a box drawn
 * round the ones belonging to `Person` enclosed `University`, `Department` and
 * `Staff` as well. A box that says a class is in a package it is not in is
 * worse than no box: the reader believes it.
 */
export function groupBoxes(view: ViewModel, positions: Positions): Array<{ id: string; name: string; rect: Rect }> {
  return view.groups
    .map((group) => {
      const members = new Set(group.nodes);
      const rects = group.nodes.map((id) => positions[id]).filter((rect): rect is Rect => rect !== undefined);
      if (rects.length === 0) {
        return undefined;
      }
      const bounds = boundsOf(rects);
      const rect = {
        x: bounds.x - GROUP_PADDING,
        y: bounds.y - GROUP_PADDING - GROUP_HEADER,
        width: bounds.width + GROUP_PADDING * 2,
        height: bounds.height + GROUP_PADDING * 2 + GROUP_HEADER,
      };
      const encloses = view.nodes.some((node) => {
        const other = positions[node.id];
        return !members.has(node.id) && other !== undefined && overlapArea(other, rect) > 0;
      });
      return encloses ? undefined : { id: group.id, name: group.name, rect };
    })
    .filter((group): group is { id: string; name: string; rect: Rect } => group !== undefined);
}

function drawGroup(group: { id: string; name: string; rect: Rect }): string {
  const { rect } = group;
  return (
    `<g class="tv-group" data-group="${escape(group.id)}">` +
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="4"/>` +
    `<text x="${rect.x + 8}" y="${rect.y + 14}">${escape(group.name)}</text></g>`
  );
}

/** A hollow triangle at `tip`, pointing away from `from`: UML's generalization. */
function triangleAt(tip: Point, from: Point): string {
  const [apex, left, right] = trianglePoints(tip, from);
  return (
    `<polygon class="tv-marker" points="${round(apex.x)},${round(apex.y)} ` +
    `${round(left.x)},${round(left.y)} ${round(right.x)},${round(right.y)}"/>`
  );
}

export function trianglePoints(tip: Point, from: Point): [Point, Point, Point] {
  const { unit, normal } = direction(tip, from);
  const base = { x: tip.x + unit.x * 14, y: tip.y + unit.y * 14 };
  return [
    tip,
    { x: base.x + normal.x * 8, y: base.y + normal.y * 8 },
    { x: base.x - normal.x * 8, y: base.y - normal.y * 8 },
  ];
}

/** Visual collisions at a triangle, which zero-width line crossing misses. */
function countHeadCollisions(strokes: HeadStroke[], markers: HeadMarker[]): number {
  const collisions = new Set<string>();
  const pair = (one: string, other: string) => (one < other ? `${one}\u0000${other}` : `${other}\u0000${one}`);
  for (const stroke of strokes) {
    for (const marker of markers) {
      if (stroke.owner !== marker.owner && pathCrossesPolygon(stroke.points, marker.points)) {
        collisions.add(pair(stroke.owner, marker.owner));
      }
    }
  }
  for (let one = 0; one < markers.length; one += 1) {
    for (let two = one + 1; two < markers.length; two += 1) {
      const first = markers[one]!;
      const second = markers[two]!;
      if (first.owner !== second.owner && polygonsOverlap(first.points, second.points)) {
        collisions.add(pair(first.owner, second.owner));
      }
    }
  }
  return collisions.size;
}

function pathCrossesPolygon(path: Point[], polygon: readonly Point[]): boolean {
  for (let index = 0; index + 1 < path.length; index += 1) {
    const from = path[index]!;
    const to = path[index + 1]!;
    if (insideTriangle(from, polygon) || insideTriangle(to, polygon)) {
      return true;
    }
    for (let side = 0; side < polygon.length; side += 1) {
      if (segmentsProperlyCross(from, to, polygon[side]!, polygon[(side + 1) % polygon.length]!)) {
        return true;
      }
    }
  }
  return false;
}

function polygonsOverlap(one: readonly Point[], other: readonly Point[]): boolean {
  return (
    one.some((point) => insideTriangle(point, other)) ||
    other.some((point) => insideTriangle(point, one)) ||
    one.some((from, index) =>
      other.some((otherFrom, otherIndex) =>
        segmentsProperlyCross(from, one[(index + 1) % one.length]!, otherFrom, other[(otherIndex + 1) % other.length]!)
      )
    )
  );
}

/** Strict interior: neighboring decorators may touch at a point without colliding. */
function insideTriangle(point: Point, triangle: readonly Point[]): boolean {
  const side = (from: Point, to: Point) => (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
  const signs = triangle.map((from, index) => side(from, triangle[(index + 1) % triangle.length]!));
  return signs.every((value) => value > 0) || signs.every((value) => value < 0);
}

/** A hollow diamond at `tip`: the whole end of a parthood. */
function diamondAt(tip: Point, from: Point): string {
  const { unit, normal } = direction(tip, from);
  const middle = { x: tip.x + unit.x * 8, y: tip.y + unit.y * 8 };
  const back = { x: tip.x + unit.x * 16, y: tip.y + unit.y * 16 };
  return (
    `<polygon class="tv-marker" points="${round(tip.x)},${round(tip.y)} ` +
    `${round(middle.x + normal.x * 6)},${round(middle.y + normal.y * 6)} ` +
    `${round(back.x)},${round(back.y)} ` +
    `${round(middle.x - normal.x * 6)},${round(middle.y - normal.y * 6)}"/>`
  );
}

/** An open arrowhead: instantiation, which is a dependency and not a taxonomy. */
function arrowAt(tip: Point, from: Point): string {
  const { unit, normal } = direction(tip, from);
  const base = { x: tip.x + unit.x * 11, y: tip.y + unit.y * 11 };
  return (
    `<path class="tv-arrow" d="M ${round(base.x + normal.x * 6)} ${round(base.y + normal.y * 6)} ` +
    `L ${round(tip.x)} ${round(tip.y)} ` +
    `L ${round(base.x - normal.x * 6)} ${round(base.y - normal.y * 6)}"/>`
  );
}

function direction(tip: Point, from: Point): { unit: Point; normal: Point } {
  const dx = from.x - tip.x;
  const dy = from.y - tip.y;
  const length = Math.hypot(dx, dy) || 1;
  const unit = { x: dx / length, y: dy / length };
  return { unit, normal: { x: -unit.y, y: unit.x } };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
