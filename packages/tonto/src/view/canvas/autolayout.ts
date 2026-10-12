// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * Automatic layout, when it is asked for.
 *
 * ELK's layered algorithm is used because a class diagram is read by its
 * taxonomy: supertypes above subtypes, one rank per level. Three things are done
 * to it here, all of them because a UFO model is not the graph a layered
 * algorithm expects.
 *
 * Generalizations are handed over reversed. A layered algorithm puts the source
 * of an edge above its target, and the edge in the view model runs specific →
 * general, which is how the language writes it and the opposite of how the
 * picture reads.
 *
 * ELK first sees the whole graph, because associations carry useful information
 * about which classes belong near one another and in which order. Its direction
 * priority only affects cycle breaking, though; it cannot stop associations
 * from inventing hierarchy levels. After that pass, each independent taxonomy
 * is therefore put back into ranks computed only from generalizations, around
 * the location and cross-rank order ELK chose for it.
 *
 * Several packages become compound nodes when they are drawn as boxes, so each
 * package's classes stay together instead of scattering and leaving the box
 * drawn around half the diagram. One package stays flat, which lets ELK pack
 * its disconnected components instead of stretching them into a row.
 *
 * Disconnected components are compacted after those semantic repairs. Keeping
 * a component rigid preserves its internal reading while recovering the space
 * the independent repairs otherwise leave between unrelated pieces.
 */

import * as elkModule from "elkjs/lib/elk.bundled.js";
import type { LayoutOptions, ViewConstraints, ViewModel } from "../model/index.js";
import { clampAssociationDistance, defaultDisplayOptions, defaultLayoutOptions, inversePairs } from "../model/index.js";
import type { Point, Rect, Size } from "./geometry.js";
import { borderPoint, boundsOf, centerOf, overlaps, segmentHitsRect, segmentsProperlyCross } from "./geometry.js";
import type { Positions } from "./place.js";
import { assignPorts } from "./ports.js";
import type { RoutingStyle } from "./route.js";
import { routeEdge } from "./route.js";
import { FONT, textWidth } from "./measure.js";
import { groupBoxes, labelWidth, render } from "./render.js";

const GROUP_PADDING = 18;
const GROUP_HEADER = 20;
const PARTIAL_GAP = 24;
const PARTIAL_STEP = 40;
const TARGET_ASPECT_RATIO = 1.6;
const TAXONOMY_CORRIDOR = 12;
const PREFERRED_SIDE_STEPS = 12;
const MAX_CROSS_AXIS_NODES = 32;

/**
 * ELK ships one bundle for CommonJS and for the browser, so the constructor
 * arrives as a module namespace in one environment and as the function itself in
 * the other. Read once, here, rather than at every call site.
 */
interface ElkLayouter {
  layout(graph: ElkNode): Promise<ElkNode>;
}

const Elk =
  (elkModule as unknown as { default?: new () => ElkLayouter }).default ??
  (elkModule as unknown as new () => ElkLayouter);

interface ElkPoint {
  x: number;
  y: number;
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  layoutOptions?: Record<string, string>;
  sections?: Array<{ startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }>;
}

interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string>;
}

export interface AutoLayoutRequest extends Partial<LayoutOptions> {
  /** Lay out only these nodes, leaving the rest where they are. */
  only?: string[];
  /**
   * How edges will be drawn. Only an orthogonal drawing keeps ELK's routes:
   * a straight line is recomputed from the two boxes every time one moves,
   * which is what keeps it looking right after a drag.
   */
  routing?: RoutingStyle;
  /** Arrange inheritance without letting hidden associations influence it. */
  taxonomyOnly?: boolean;
  /** Keep package members inside compound package nodes, not merely nearby. */
  packageContainers?: boolean;
  /** User-owned constraints retained by an explicit Arrange. */
  constraints?: ViewConstraints;
}

export interface AutoLayoutResult {
  positions: Positions;
  /**
   * The polyline ELK routed each edge along, ends included.
   *
   * Kept for an orthogonal drawing, because a layered layout routes around the
   * boxes it has just placed and re-deriving that from the positions alone
   * puts lines back through them. They are part of the arrangement from here
   * on: whoever moves a box drops the routes of the edges that touch it.
   */
  routes: Record<string, Point[]>;
}

/** What the layered initializer is told. */
function optionsFor(settings: LayoutOptions, routing: RoutingStyle): Record<string, string> {
  const edgeRouting = routing === "orthogonal" ? "ORTHOGONAL" : "POLYLINE";
  return {
    "elk.algorithm": "layered",
    "elk.direction": settings.direction,
    "elk.edgeRouting": edgeRouting,
    "elk.spacing.nodeNode": String(settings.nodeSpacing),
    "elk.spacing.edgeNode": String(Math.round(settings.nodeSpacing * 0.5)),
    "elk.spacing.edgeEdge": "12",
    "elk.layered.spacing.nodeNodeBetweenLayers": String(settings.rankSpacing),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.round(settings.rankSpacing * 0.4)),
    // Straight taxonomy legs, at the cost of a wider drawing: a
    // supertype sitting over the middle of its subtypes is the thing
    // the reader is looking for.
    "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    "elk.layered.thoroughness": "20",
    // Nothing here bounds the width, and it is worth saying so rather than
    // appearing to. Layered layout ignores `elk.aspectRatio` without a
    // wrapping policy; broad taxonomies need an explicit stable folding
    // policy rather than another engine selector.
  };
}

interface ComponentBox {
  ids: string[];
  bounds: Rect;
}

interface PackedBox {
  component: ComponentBox;
  x: number;
  y: number;
}

/** Weak components of the visible graph, including an unjoined node as one. */
function weakComponents(view: ViewModel, subject: ReadonlySet<string>, excluded: ReadonlySet<string>): string[][] {
  const ids = [...subject].filter((id) => !excluded.has(id)).sort();
  const neighbours = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const edge of view.edges) {
    if (!neighbours.has(edge.source) || !neighbours.has(edge.target)) {
      continue;
    }
    neighbours.get(edge.source)!.add(edge.target);
    neighbours.get(edge.target)!.add(edge.source);
  }

  const unseen = new Set(ids);
  const components: string[][] = [];
  for (const first of ids) {
    if (!unseen.delete(first)) {
      continue;
    }
    const component: string[] = [];
    const visit = [first];
    while (visit.length > 0) {
      const id = visit.pop()!;
      component.push(id);
      for (const neighbour of [...(neighbours.get(id) ?? [])].sort().reverse()) {
        if (unseen.delete(neighbour)) {
          visit.push(neighbour);
        }
      }
    }
    components.push(component.sort());
  }
  return components;
}

/** Places rectangles into the lowest available rectangular gap. */
function gapPack(
  components: ComponentBox[],
  targetWidth: number,
  gap: number
): {
  boxes: PackedBox[];
  width: number;
  height: number;
} {
  const boxes: PackedBox[] = [];
  for (const component of components) {
    const xs = new Set([0]);
    const ys = new Set([0]);
    for (const box of boxes) {
      xs.add(box.x);
      xs.add(box.x + box.component.bounds.width + gap);
      ys.add(box.y);
      ys.add(box.y + box.component.bounds.height + gap);
    }

    let chosen: { x: number; y: number } | undefined;
    for (const y of [...ys].sort((one, other) => one - other)) {
      for (const x of [...xs].sort((one, other) => one - other)) {
        if (x + component.bounds.width > targetWidth) {
          continue;
        }
        const clear = boxes.every(
          (box) =>
            x + component.bounds.width + gap <= box.x ||
            box.x + box.component.bounds.width + gap <= x ||
            y + component.bounds.height + gap <= box.y ||
            box.y + box.component.bounds.height + gap <= y
        );
        if (clear) {
          chosen = { x, y };
          break;
        }
      }
      if (chosen) {
        break;
      }
    }
    // targetWidth is never narrower than the widest component, and the
    // bottom of every placed box is always a clear fallback.
    chosen ??= {
      x: 0,
      y: Math.max(0, ...boxes.map((box) => box.y + box.component.bounds.height + gap)),
    };
    boxes.push({ component, ...chosen });
  }
  return {
    boxes,
    width: Math.max(...boxes.map((box) => box.x + box.component.bounds.width)),
    height: Math.max(...boxes.map((box) => box.y + box.component.bounds.height)),
  };
}

/**
 * Every stable order while there are few enough to search, else the established
 * tall-first order. Packing width alone cannot recover from an unlucky order:
 * with three differently shaped components, the one that fits beside the tall
 * component may sit third and be forced below the wide one in
 * between. Seven components keep the complete search below 5,040 orders.
 */
function componentOrders(components: ComponentBox[]): ComponentBox[][] {
  if (components.length > 7) {
    return [components];
  }
  const orders: ComponentBox[][] = [];
  const visit = (prefix: ComponentBox[], remaining: ComponentBox[]): void => {
    if (remaining.length === 0) {
      orders.push(prefix);
      return;
    }
    for (let index = 0; index < remaining.length; index += 1) {
      visit([...prefix, remaining[index]!], [...remaining.slice(0, index), ...remaining.slice(index + 1)]);
    }
  };
  visit([], components);
  return orders;
}

/** The screen-sized square needed to contain bounds at the target aspect. */
function packingScore(width: number, height: number): number {
  return Math.max(width / TARGET_ASPECT_RATIO, height);
}

/**
 * Recovers space between unrelated pieces after semantic adjustment.
 *
 * Every weak component moves rigidly, so taxonomy ranks, mediation placement
 * and whole-part order survive. Both component order and packing width are
 * searched. Small components can occupy a rectangular gap beside a tall one
 * instead of a shelf inheriting the tall component's height. Equal candidates
 * retain stable id order.
 */
function packComponents(
  view: ViewModel,
  positions: Positions,
  subject: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
  settings: LayoutOptions
): boolean {
  const components = weakComponents(view, subject, excluded)
    .filter((ids) => ids.every((id) => positions[id] !== undefined))
    .map((ids) => ({ ids, bounds: boundsOf(ids.map((id) => positions[id]!)) }));
  if (components.length < 2) {
    return false;
  }

  // Tall pieces first make shelves useful; ids settle every tie and make the
  // answer independent of ELK's component enumeration.
  components.sort(
    (one, other) =>
      other.bounds.height - one.bounds.height ||
      other.bounds.width - one.bounds.width ||
      one.ids[0]!.localeCompare(other.ids[0]!)
  );
  const gap = Math.max(settings.nodeSpacing, 40);
  const maxWidth = Math.max(...components.map((component) => component.bounds.width));
  const allInOneRow =
    components.reduce((sum, component) => sum + component.bounds.width, 0) + gap * (components.length - 1);
  const paddedArea = components.reduce(
    (sum, component) => sum + (component.bounds.width + gap) * (component.bounds.height + gap),
    0
  );
  const idealWidth = Math.sqrt(paddedArea * TARGET_ASPECT_RATIO);
  const candidates = new Set<number>([maxWidth, allInOneRow, idealWidth]);
  for (let step = 1; step <= 24; step += 1) {
    candidates.add(maxWidth + ((allInOneRow - maxWidth) * step) / 24);
  }

  let best: ReturnType<typeof gapPack> | undefined;
  for (const order of componentOrders(components)) {
    for (const candidate of [...candidates].sort((one, other) => one - other)) {
      const packed = gapPack(order, candidate, gap);
      if (
        !best ||
        packingScore(packed.width, packed.height) < packingScore(best.width, best.height) ||
        (packingScore(packed.width, packed.height) === packingScore(best.width, best.height) &&
          packed.width * packed.height < best.width * best.height)
      ) {
        best = packed;
      }
    }
  }
  if (!best) {
    return false;
  }

  const currentBounds = boundsOf(components.flatMap((component) => component.ids.map((id) => positions[id]!)));
  if (packingScore(best.width, best.height) >= packingScore(currentBounds.width, currentBounds.height)) {
    return false;
  }
  for (const box of best.boxes) {
    const dx = currentBounds.x + box.x - box.component.bounds.x;
    const dy = currentBounds.y + box.y - box.component.bounds.y;
    for (const id of box.component.ids) {
      const rect = positions[id]!;
      positions[id] = { ...rect, x: Math.round(rect.x + dx), y: Math.round(rect.y + dy) };
    }
  }
  return true;
}

/**
 * Keeps unconnected datatypes and enumerations after the model ELK arranged.
 *
 * ELK's LAST constraint puts one inside the last layer of its connected
 * component. In a flat graph it is still a component of its own, so component
 * packing can put it above the taxonomy; a compound package happened to hide
 * that distinction. Move the appendix as one piece after every other node,
 * retaining the compact shape ELK chose for several entries.
 */
function placeAppendixAfter(
  positions: Positions,
  appendix: ReadonlySet<string>,
  subject: ReadonlySet<string>,
  settings: LayoutOptions
): void {
  const ids = [...appendix].filter((id) => subject.has(id) && positions[id] !== undefined);
  const body = [...subject]
    .filter((id) => !appendix.has(id) && positions[id] !== undefined)
    .map((id) => positions[id]!);
  if (ids.length === 0 || body.length === 0) {
    return;
  }

  const appendixBounds = boundsOf(ids.map((id) => positions[id]!));
  const bodyBounds = boundsOf(body);
  const translation =
    settings.direction === "DOWN"
      ? {
          x: bodyBounds.x + bodyBounds.width / 2 - (appendixBounds.x + appendixBounds.width / 2),
          y: bodyBounds.y + bodyBounds.height + settings.rankSpacing - appendixBounds.y,
        }
      : {
          x: bodyBounds.x + bodyBounds.width + settings.rankSpacing - appendixBounds.x,
          y: bodyBounds.y + bodyBounds.height / 2 - (appendixBounds.y + appendixBounds.height / 2),
        };
  for (const id of ids) {
    const rect = positions[id]!;
    positions[id] = {
      ...rect,
      x: Math.round(rect.x + translation.x),
      y: Math.round(rect.y + translation.y),
    };
  }
}

/** Grid step, in pixels, of the search for a free seat inside the model. */
const SEAT_STEP = 8;
/** Clear space kept between a seated card and a line or label near it. */
const SEAT_LINE_CLEARANCE = 20;
const SEAT_LABEL_CLEARANCE = 10;

/**
 * Seats unconnected datatypes and enumerations in the model's own whitespace.
 *
 * `placeAppendixAfter` alone put them in a new rank past the whole model. On
 * `genealogy` that added a strip 200px deep for two cards while the corner
 * under the filiation taxonomy stood empty: the canvas grew for cards that
 * need no particular place, only one that is out of the way. They are still
 * kept out of the way -- nearest the far end of the rank axis, clear of every
 * card, line, label and generalization set -- and only a card that fits
 * nowhere inside the model's bounds is left for the appendix row.
 *
 * Orthogonal routes are ELK's own, saved with the layout, and are not the
 * lines this pass could render and avoid, so that style keeps the appendix.
 * So do other classifiers with no inheritance in a taxonomy-only view: that
 * appendix is a list of what the taxonomy leaves out, and reads as one.
 */
function seatAppendixInWhitespace(
  view: ViewModel,
  positions: Positions,
  appendix: ReadonlySet<string>,
  subject: ReadonlySet<string>,
  settings: LayoutOptions,
  routing: RoutingStyle,
  /** Whether package boxes will be drawn around a flat layout. */
  packageBoxesDrawn: boolean
): Set<string> {
  const seated = new Set<string>();
  const waiting = view.nodes
    .filter(
      (node) =>
        appendix.has(node.id) &&
        subject.has(node.id) &&
        positions[node.id] !== undefined &&
        (node.kind === "datatype" || node.kind === "enumeration")
    )
    .map((node) => node.id);
  if (waiting.length === 0 || routing === "orthogonal") {
    return seated;
  }
  const pending = new Set(waiting);
  const body = view.nodes.filter((node) => !pending.has(node.id) && positions[node.id] !== undefined);
  if (body.length === 0) {
    return seated;
  }
  const bounds = boundsOf(body.map((node) => positions[node.id]!));

  // The lines are those of the drawing as it will be, in both styles the
  // panel can switch between without arranging again.
  const bodyView: ViewModel = { ...view, nodes: body };
  const segments: Array<[Point, Point]> = [];
  const blocked: Rect[] = [];
  const inflate = (rect: Rect, margin: number): Rect => ({
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  });
  for (const style of new Set<RoutingStyle>(["straight", routing])) {
    const output = renderForLayoutScore(bodyView, positions, settings.direction, style);
    for (const points of Object.values(output.paths)) {
      for (let index = 1; index < points.length; index += 1) {
        segments.push([points[index - 1]!, points[index]!]);
      }
    }
    blocked.push(...renderedLabelBoxes(output.svg).map((label) => inflate(label, SEAT_LABEL_CLEARANCE)));
  }
  const cardClearance = Math.max(24, Math.round(settings.nodeSpacing * 0.6));
  blocked.push(...body.map((node) => inflate(positions[node.id]!, cardClearance)));
  // A set's bus and stems are drawn by the tree, not reported as paths; the
  // span from its general to its specifics is the ground they cover.
  for (const genset of view.gensets) {
    const members = [genset.general, ...genset.specifics].flatMap((id) =>
      id && !pending.has(id) && positions[id] ? [positions[id]!] : []
    );
    if (members.length > 1) {
      blocked.push(inflate(boundsOf(members), SEAT_LINE_CLEARANCE));
    }
  }

  // A card seated among another package's members would read as belonging
  // to it, and one seated away from its own would stretch that box across
  // the diagram. Only the boxes the renderer will actually draw have a say:
  // a package interleaved with others is given no box, and so no bounds.
  const drawnBoxes = packageBoxesDrawn ? groupBoxes(view, positions) : [];
  const groupOf = new Map(view.groups.flatMap((group) => group.nodes.map((id) => [id, group.id] as const)));

  const down = settings.direction === "DOWN";
  for (const id of waiting) {
    const rect = positions[id]!;
    let area = bounds;
    const group = groupOf.get(id);
    const members =
      view.groups
        .find((one) => one.id === group)
        ?.nodes.filter((member) => !pending.has(member) && positions[member] !== undefined) ?? [];
    // A package holding only datatypes has nothing to seat them among: it
    // is a box of its own, and moved, it would only take its padding
    // somewhere else -- whether or not the planning-width cards let it be
    // drawn yet.
    if (packageBoxesDrawn && group !== undefined && members.length === 0) {
      continue;
    }
    if (drawnBoxes.some((box) => box.id === group)) {
      // Inside the box its other members already need, so that box does
      // not grow to reach it.
      area = boundsOf(members.map((member) => positions[member]!));
    }
    const others = drawnBoxes.filter((box) => box.id !== group).map((box) => box.rect);
    const last = [...seated].map((other) => centerOf(positions[other]!)).at(-1);
    let best: { x: number; y: number; depth: number; distance: number } | undefined;
    for (let y = area.y; y + rect.height <= area.y + area.height; y += SEAT_STEP) {
      for (let x = area.x; x + rect.width <= area.x + area.width; x += SEAT_STEP) {
        const seat = { x, y, width: rect.width, height: rect.height };
        if (
          blocked.some((other) => overlaps(seat, other)) ||
          others.some((other) => overlaps(seat, other)) ||
          segments.some(([from, to]) => segmentHitsRect(from, to, seat, SEAT_LINE_CLEARANCE))
        ) {
          continue;
        }
        // How far short of the model's far end the seat stops, first:
        // that is what keeps reference material after what it serves.
        // Then beside the card seated before it, so a model's
        // datatypes stay together, or else nearest a corner.
        const depth = Math.floor(
          (down ? area.y + area.height - (y + rect.height) : area.x + area.width - (x + rect.width)) / SEAT_STEP
        );
        const centre = centerOf(seat);
        const distance = last
          ? Math.hypot(centre.x - last.x, centre.y - last.y)
          : down
            ? Math.min(x - area.x, area.x + area.width - x - rect.width)
            : Math.min(y - area.y, area.y + area.height - y - rect.height);
        if (!best || depth < best.depth || (depth === best.depth && distance < best.distance)) {
          best = { x, y, depth, distance };
        }
      }
    }
    if (best) {
      positions[id] = { ...rect, x: Math.round(best.x), y: Math.round(best.y) };
      blocked.push(inflate(positions[id]!, cardClearance));
      seated.add(id);
    }
  }
  return seated;
}

/**
 * Keeps an arranged selection where it was, and out of everything that was not
 * selected. ELK cannot do that by itself when it is handed only the selection:
 * an unselected box does not exist in its graph, so the most natural answer is
 * often the exact coordinates that box already occupies.
 */
function placePartialLayout(
  view: ViewModel,
  positions: Positions,
  current: Positions,
  subject: ReadonlySet<string>
): void {
  const ids = [...subject].filter((id) => positions[id] !== undefined);
  const laid = ids.map((id) => positions[id]!);
  const fixed = Object.entries(current)
    .filter(([id]) => !subject.has(id))
    .map(([, rect]) => rect);
  if (laid.length === 0 || fixed.length === 0) {
    return;
  }

  const laidBounds = boundsOf(laid);
  const previous = ids.map((id) => current[id]).filter((rect): rect is Rect => rect !== undefined);
  const previousBounds = previous.length > 0 ? boundsOf(previous) : laidBounds;
  const anchor = { x: previousBounds.x - laidBounds.x, y: previousBounds.y - laidBounds.y };
  const fits = (dx: number, dy: number) =>
    laid.every((rect) => {
      const moved = { ...rect, x: rect.x + dx, y: rect.y + dy };
      return !fixed.some((obstacle) => overlaps(moved, obstacle, PARTIAL_GAP));
    });

  const firstFitAround = (origin: Point, rings: number): Point | undefined => {
    for (let ring = 0; ring < rings; ring += 1) {
      const offsets = ring === 0 ? [{ x: 0, y: 0 }] : partialRing(ring);
      for (const offset of offsets) {
        const candidate = {
          x: Math.round(origin.x + offset.x * PARTIAL_STEP),
          y: Math.round(origin.y + offset.y * PARTIAL_STEP),
        };
        if (fits(candidate.x, candidate.y)) {
          return candidate;
        }
      }
    }
    return undefined;
  };

  const covered = inversePairs(view.edges).covered;
  const boundary = view.edges.flatMap((edge) => {
    if (covered.has(edge.id) || subject.has(edge.source) === subject.has(edge.target)) {
      return [];
    }
    const selected = subject.has(edge.source) ? edge.source : edge.target;
    const neighbour = selected === edge.source ? edge.target : edge.source;
    const selectedRect = positions[selected];
    const fixedRect = current[neighbour];
    return selectedRect && fixedRect ? [{ selectedRect, fixedRect }] : [];
  });

  let translation: Point | undefined;
  if (boundary.length > 0) {
    // The least-squares translation puts each boundary endpoint over its
    // fixed neighbour. Nearby grid candidates then find the closest legal
    // side of those obstacles. Keeping the selection rigid means this
    // preference cannot damage ranks or its internal arrangement.
    const halo = boundary.reduce(
      (sum, pair) => ({
        x: sum.x + centerOf(pair.fixedRect).x - centerOf(pair.selectedRect).x,
        y: sum.y + centerOf(pair.fixedRect).y - centerOf(pair.selectedRect).y,
      }),
      { x: 0, y: 0 }
    );
    const haloAnchor = { x: halo.x / boundary.length, y: halo.y / boundary.length };
    const candidates: Point[] = [];
    const seen = new Set<string>();
    for (const origin of [haloAnchor, anchor]) {
      for (let ring = 0; ring < 24; ring += 1) {
        const offsets = ring === 0 ? [{ x: 0, y: 0 }] : partialRing(ring);
        for (const offset of offsets) {
          const candidate = {
            x: Math.round(origin.x + offset.x * PARTIAL_STEP),
            y: Math.round(origin.y + offset.y * PARTIAL_STEP),
          };
          const key = `${candidate.x},${candidate.y}`;
          if (!seen.has(key) && fits(candidate.x, candidate.y)) {
            seen.add(key);
            candidates.push(candidate);
          }
        }
      }
    }
    const score = (candidate: Point): number => {
      const edgeLength = boundary.reduce((sum, pair) => {
        const selected = centerOf(pair.selectedRect);
        const fixedNeighbour = centerOf(pair.fixedRect);
        return (
          sum + Math.hypot(selected.x + candidate.x - fixedNeighbour.x, selected.y + candidate.y - fixedNeighbour.y)
        );
      }, 0);
      const displacement = Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y);
      return edgeLength + displacement * boundary.length * 0.2;
    };
    translation = candidates.reduce<Point | undefined>((best, candidate) => {
      if (!best || score(candidate) < score(best)) {
        return candidate;
      }
      return best;
    }, undefined);
  } else {
    translation = firstFitAround(anchor, 80);
  }
  if (!translation) {
    const fixedBounds = boundsOf(fixed);
    translation = {
      x: anchor.x,
      y: fixedBounds.y + fixedBounds.height + PARTIAL_GAP - laidBounds.y,
    };
  }
  for (const id of ids) {
    const rect = positions[id]!;
    positions[id] = {
      ...rect,
      x: Math.round(rect.x + translation.x),
      y: Math.round(rect.y + translation.y),
    };
  }
}

function partialRing(ring: number): Point[] {
  const offsets: Point[] = [];
  for (let step = -ring; step <= ring; step += 1) {
    offsets.push({ x: step, y: ring }, { x: ring, y: step }, { x: step, y: -ring }, { x: -ring, y: step });
  }
  return offsets;
}

/** Applies saved exact constraints without moving pins or breaking taxonomy ranks. */
export function applyLayoutConstraints(
  positions: Positions,
  constraints: ViewConstraints,
  options: {
    movable?: ReadonlySet<string>;
    ranked?: ReadonlySet<string>;
    direction?: LayoutOptions["direction"];
  } = {}
): void {
  const movable = options.movable ?? new Set(Object.keys(positions));
  const pinned = new Set(constraints.pinned);
  const primary = options.direction === "RIGHT" ? "x" : "y";
  const canMove = (id: string, axis: "x" | "y") =>
    movable.has(id) && !pinned.has(id) && !(options.ranked?.has(id) && axis === primary);
  const centreAt = (rect: Rect, axis: "x" | "y") => rect[axis] + (axis === "x" ? rect.width : rect.height) / 2;
  const placeCentre = (rect: Rect, axis: "x" | "y", centre: number): Rect => ({
    ...rect,
    [axis]: Math.round(centre - (axis === "x" ? rect.width : rect.height) / 2),
  });
  const accept = (candidate: Positions, changed: ReadonlySet<string>): boolean => {
    for (const id of changed) {
      const rect = candidate[id];
      if (!rect) {
        continue;
      }
      for (const [otherId, other] of Object.entries(candidate)) {
        if (id !== otherId && overlaps(rect, other)) {
          return false;
        }
      }
    }
    for (const id of changed) {
      positions[id] = candidate[id]!;
    }
    return true;
  };

  for (const constraint of constraints.alignments) {
    const ids = constraint.nodes.filter((id) => positions[id] !== undefined);
    if (ids.length < 2) {
      continue;
    }
    const fixed = ids.filter((id) => !canMove(id, constraint.axis));
    const targetIds = fixed.length > 0 ? fixed : ids;
    const target = targetIds.reduce((sum, id) => sum + centreAt(positions[id]!, constraint.axis), 0) / targetIds.length;
    const candidate = { ...positions };
    const changed = new Set<string>();
    for (const id of ids.filter((id) => canMove(id, constraint.axis))) {
      candidate[id] = placeCentre(positions[id]!, constraint.axis, target);
      changed.add(id);
    }
    accept(candidate, changed);
  }

  for (const constraint of constraints.distributions) {
    const ids = constraint.nodes
      .filter((id) => positions[id] !== undefined)
      .sort(
        (one, other) =>
          centreAt(positions[one]!, constraint.axis) - centreAt(positions[other]!, constraint.axis) ||
          one.localeCompare(other)
      );
    if (ids.length < 3) {
      continue;
    }
    const low = centreAt(positions[ids[0]!]!, constraint.axis);
    const high = centreAt(positions[ids.at(-1)!]!, constraint.axis);
    const step = (high - low) / (ids.length - 1);
    const candidate = { ...positions };
    const changed = new Set<string>();
    let possible = true;
    for (const [index, id] of ids.entries()) {
      const target = low + step * index;
      if (!canMove(id, constraint.axis)) {
        possible &&= Math.abs(centreAt(positions[id]!, constraint.axis) - target) <= 1;
        continue;
      }
      candidate[id] = placeCentre(positions[id]!, constraint.axis, target);
      changed.add(id);
    }
    if (possible) {
      accept(candidate, changed);
    }
  }
}

/**
 * Moves each relator towards the middle of what it mediates, where there is room.
 *
 * The layering can only put it in a rank between its relata; how far along that
 * rank it sits is decided by everything else in the drawing, and a relator that
 * is between its relata vertically and a screen away horizontally is not between
 * them in any sense a reader cares about. So each one is offered the middle, and
 * takes as much of the way there as is free -- never overlapping anything, and
 * never moving unless the move is an improvement.
 */
function settleRelators(
  view: ViewModel,
  positions: Positions,
  only: ReadonlySet<string>,
  rankDirection?: LayoutOptions["direction"],
  ranked?: ReadonlySet<string>
): void {
  const relators = view.nodes.filter((node) => node.stereotype === "relator" && only.has(node.id));
  if (relators.length === 0) {
    return;
  }

  for (const relator of relators) {
    const rect = positions[relator.id];
    if (!rect) {
      continue;
    }
    const relata = [
      ...new Set(
        view.edges
          .filter(
            (edge) =>
              edge.kind === "relation" &&
              edge.stereotype === "mediation" &&
              (edge.source === relator.id || edge.target === relator.id)
          )
          .map((edge) => (edge.source === relator.id ? edge.target : edge.source))
          .filter((id) => id !== relator.id)
      ),
    ]
      .map((id) => positions[id])
      .filter((one): one is Rect => one !== undefined);
    if (relata.length < 2) {
      continue;
    }

    const middle = {
      x: relata.reduce((sum, one) => sum + one.x + one.width / 2, 0) / relata.length - rect.width / 2,
      y: relata.reduce((sum, one) => sum + one.y + one.height / 2, 0) / relata.length - rect.height / 2,
    };
    const others = Object.entries(positions)
      .filter(([id]) => id !== relator.id)
      .map(([, one]) => one);
    for (const share of [1, 0.8, 0.6, 0.4, 0.2]) {
      const locked = ranked?.has(relator.id) ?? false;
      const candidate = {
        x: locked && rankDirection === "RIGHT" ? rect.x : Math.round(rect.x + (middle.x - rect.x) * share),
        y: locked && rankDirection === "DOWN" ? rect.y : Math.round(rect.y + (middle.y - rect.y) * share),
        width: rect.width,
        height: rect.height,
      };
      if (!others.some((one) => overlaps(candidate, one, 24))) {
        positions[relator.id] = candidate;
        break;
      }
    }
  }
}

interface Corridor {
  source: string;
  target: string;
  from: Point;
  to: Point;
}

interface CrossAxisScore {
  intersections: number;
  crossings: number;
  semanticCost: number;
  maximumLength: number;
  totalLength: number;
  span: number;
}

/** The direct inheritance lanes established by semantic re-ranking. */
function taxonomyCorridors(view: ViewModel, positions: Positions, ranked: ReadonlySet<string>): Corridor[] {
  return view.edges.flatMap((edge) => {
    if (edge.kind !== "generalization" || !ranked.has(edge.source) || !ranked.has(edge.target)) {
      return [];
    }
    const source = positions[edge.source];
    const target = positions[edge.target];
    return source && target
      ? [
          {
            source: edge.source,
            target: edge.target,
            from: borderPoint(source, centerOf(target)),
            to: borderPoint(target, centerOf(source)),
          },
        ]
      : [];
  });
}

/** Lexicographic form of the quality priorities in the layout plan. */
function betterCrossAxisScore(one: CrossAxisScore, other: CrossAxisScore): boolean {
  return (
    one.intersections < other.intersections ||
    (one.intersections === other.intersections &&
      (one.crossings < other.crossings ||
        (one.crossings === other.crossings &&
          (one.maximumLength < other.maximumLength ||
            (one.maximumLength === other.maximumLength &&
              (one.totalLength < other.totalLength ||
                (one.totalLength === other.totalLength &&
                  (one.semanticCost < other.semanticCost ||
                    (one.semanticCost === other.semanticCost && one.span < other.span)))))))))
  );
}

/** Relative pull exerted by the relationships named in the layout contract. */
function semanticEdgeWeight(edge: ViewModel["edges"][number]): number {
  if (edge.kind === "generalization") {
    return 8;
  }
  if (edge.kind === "instantiation" || (edge.kind === "relation" && edge.stereotype === "instantiation")) {
    return 3;
  }
  if (edge.kind !== "relation") {
    return 1;
  }
  if (edge.stereotype === "mediation") {
    return 5;
  }
  if (edge.whole || edge.stereotype === "constitution") {
    return 4;
  }
  if (edge.stereotype === "characterization") {
    return 2;
  }
  return 1;
}

function semanticGeometryCost(
  view: ViewModel,
  positions: Positions,
  ids: ReadonlySet<string>,
  settings: LayoutOptions
): number {
  const edges = view.edges.filter(
    (edge) =>
      ids.has(edge.source) &&
      ids.has(edge.target) &&
      positions[edge.source] !== undefined &&
      positions[edge.target] !== undefined
  );
  let cost = edges.reduce(
    (total, edge) =>
      total +
      Math.hypot(
        centerOf(positions[edge.source]!).x - centerOf(positions[edge.target]!).x,
        centerOf(positions[edge.source]!).y - centerOf(positions[edge.target]!).y
      ) *
        semanticEdgeWeight(edge),
    0
  );
  for (const edge of edges) {
    if (edge.kind === "instantiation" || (edge.kind === "relation" && edge.stereotype === "instantiation")) {
      const type = positions[edge.target]!;
      const base = positions[edge.source]!;
      const violation = type.x + type.width + settings.nodeSpacing - base.x;
      if (violation > 0) {
        cost += 500 + violation * 4;
      }
    }
    if (edge.kind !== "relation") {
      continue;
    }
    const whole =
      edge.whole === "source"
        ? edge.source
        : edge.whole === "target"
          ? edge.target
          : edge.stereotype === "constitution"
            ? edge.source
            : undefined;
    if (!whole) {
      continue;
    }
    const part = whole === edge.source ? edge.target : edge.source;
    const wholeCentre = centerOf(positions[whole]!);
    const partCentre = centerOf(positions[part]!);
    if (wholeCentre.x >= partCentre.x && wholeCentre.y >= partCentre.y) {
      cost += 800;
    }
  }
  for (const node of view.nodes.filter((node) => node.stereotype === "relator" && ids.has(node.id))) {
    const relator = positions[node.id];
    const relata = [
      ...new Set(
        edges
          .filter(
            (edge) =>
              edge.kind === "relation" &&
              edge.stereotype === "mediation" &&
              (edge.source === node.id || edge.target === node.id)
          )
          .map((edge) => (edge.source === node.id ? edge.target : edge.source))
      ),
    ]
      .map((id) => positions[id])
      .filter((rect): rect is Rect => rect !== undefined);
    if (!relator || relata.length < 2) {
      continue;
    }
    const at = centerOf(relator);
    const left = Math.min(...relata.map((rect) => centerOf(rect).x));
    const right = Math.max(...relata.map((rect) => centerOf(rect).x));
    const top = Math.min(...relata.map((rect) => centerOf(rect).y));
    const bottom = Math.max(...relata.map((rect) => centerOf(rect).y));
    cost += (Math.max(0, left - at.x, at.x - right) + Math.max(0, top - at.y, at.y - bottom)) * 5;
  }
  if (settings.groupByPackage) {
    const packageOf = new Map(view.nodes.map((node) => [node.id, node.package]));
    const primary = settings.direction === "DOWN" ? "y" : "x";
    const cross = settings.direction === "DOWN" ? "x" : "y";
    for (const at of new Set([...ids].map((id) => positions[id]?.[primary]).filter((one) => one !== undefined))) {
      const packages = [...ids]
        .filter((id) => positions[id]?.[primary] === at)
        .sort((one, other) => positions[one]![cross] - positions[other]![cross])
        .map((id) => packageOf.get(id));
      const runs = packages.filter((pkg, index) => index === 0 || pkg !== packages[index - 1]).length;
      cost += (runs - new Set(packages).size) * 300;
    }
  }
  return Math.round(cost);
}

/** Whether an edge says its target is a higher-order type of its source. */
function isInstantiation(edge: ViewModel["edges"][number]): boolean {
  return edge.kind === "instantiation" || (edge.kind === "relation" && edge.stereotype === "instantiation");
}

/**
 * Prefers a higher-order type to the left of the classifiers it classifies.
 *
 * A type may have a taxonomy of its own (`CarModel` specializes `CarType`), so
 * moving only the named target would break that taxonomy. Generalization-
 * connected type families therefore move rigidly. If the left-hand corridor
 * is occupied, the preference yields instead of overlapping another class.
 */
function orientInstantiationTypes(
  view: ViewModel,
  positions: Positions,
  subject: ReadonlySet<string>,
  settings: LayoutOptions,
  finalGeometry = false
): void {
  const instantiations = view.edges.filter(
    (edge) =>
      isInstantiation(edge) &&
      edge.source !== edge.target &&
      subject.has(edge.source) &&
      subject.has(edge.target) &&
      positions[edge.source] !== undefined &&
      positions[edge.target] !== undefined
  );
  if (instantiations.length === 0) {
    return;
  }

  const taxonomy = new Map<string, Set<string>>();
  for (const edge of view.edges) {
    if (edge.kind !== "generalization" || !subject.has(edge.source) || !subject.has(edge.target)) {
      continue;
    }
    taxonomy.set(edge.source, new Set([...(taxonomy.get(edge.source) ?? []), edge.target]));
    taxonomy.set(edge.target, new Set([...(taxonomy.get(edge.target) ?? []), edge.source]));
  }
  const familyOf = (seed: string): string[] => {
    const family: string[] = [];
    const visited = new Set<string>();
    const visit = [seed];
    while (visit.length > 0) {
      const id = visit.pop()!;
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      family.push(id);
      visit.push(...(taxonomy.get(id) ?? []));
    }
    return family.sort();
  };

  const groups = new Map<string, { ids: string[]; edges: typeof instantiations }>();
  for (const edge of instantiations) {
    const ids = familyOf(edge.target);
    if (ids.includes(edge.source)) {
      continue;
    }
    const key = ids[0]!;
    const group = groups.get(key) ?? { ids, edges: [] };
    group.edges.push(edge);
    groups.set(key, group);
  }

  const gap = Math.max(settings.nodeSpacing, 40);
  for (const group of [...groups.values()].sort((one, other) => one.ids[0]!.localeCompare(other.ids[0]!))) {
    const required = Math.min(
      ...group.edges.map((edge) => {
        const type = positions[edge.target]!;
        const base = positions[edge.source]!;
        return base.x - gap - type.width - type.x;
      })
    );
    if (required >= 0) {
      continue;
    }
    const members = new Set(group.ids);
    const obstacles = Object.entries(positions)
      .filter(([id]) => !members.has(id))
      .map(([, rect]) => rect);
    if (!finalGeometry) {
      for (let step = 0; step <= PREFERRED_SIDE_STEPS; step += 1) {
        const dx = Math.round(required - step * PARTIAL_STEP);
        const moved = group.ids.map((id) => ({ ...positions[id]!, x: positions[id]!.x + dx }));
        if (moved.every((rect) => !obstacles.some((obstacle) => overlaps(rect, obstacle, 24)))) {
          group.ids.forEach((id, index) => (positions[id] = moved[index]!));
          break;
        }
      }
      continue;
    }
    const ids = Object.keys(positions);
    const all = new Set(ids);
    const edgeIds = new Set(
      view.edges.filter((edge) => all.has(edge.source) && all.has(edge.target)).map((edge) => edge.id)
    );
    const beforeSafety =
      ids.length <= MAX_CROSS_AXIS_NODES
        ? renderedSafety(view, positions, ids, edgeIds, settings.direction)
        : undefined;
    const beforeCost = semanticGeometryCost(view, positions, all, settings);
    const beforeBounds = boundsOf(ids.map((id) => positions[id]!));
    const beforeFootprint = Math.max(beforeBounds.width / TARGET_ASPECT_RATIO, beforeBounds.height);
    const aligned = Math.round(
      group.edges.reduce(
        (sum, edge) => sum + centerOf(positions[edge.source]!).y - centerOf(positions[edge.target]!).y,
        0
      ) / group.edges.length
    );
    const verticalShifts = new Set([0, aligned]);
    for (let step = 1; step <= 4; step += 1) {
      verticalShifts.add(aligned - step * PARTIAL_STEP);
      verticalShifts.add(aligned + step * PARTIAL_STEP);
    }
    const candidates: Array<{
      positions: Positions;
      safety?: RenderedSafety;
      maximumLength: number;
      totalLength: number;
      cost: number;
      footprint: number;
    }> = [];
    for (const dy of verticalShifts) {
      for (let step = 0; step <= PREFERRED_SIDE_STEPS; step += 1) {
        const dx = Math.round(required - step * PARTIAL_STEP);
        const moved = group.ids.map((id) => ({
          ...positions[id]!,
          x: positions[id]!.x + dx,
          y: positions[id]!.y + dy,
        }));
        if (moved.some((rect) => obstacles.some((obstacle) => overlaps(rect, obstacle, 24)))) {
          continue;
        }
        const proposal = { ...positions };
        group.ids.forEach((id, index) => (proposal[id] = moved[index]!));
        const safety = beforeSafety ? renderedSafety(view, proposal, ids, edgeIds, settings.direction) : undefined;
        if (
          safety &&
          beforeSafety &&
          (safety.intersections > beforeSafety.intersections ||
            safety.crossings > beforeSafety.crossings ||
            safety.labelOcclusions > beforeSafety.labelOcclusions + 1)
        ) {
          continue;
        }
        const cost = semanticGeometryCost(view, proposal, all, settings);
        const bounds = boundsOf(ids.map((id) => proposal[id]!));
        const footprint = Math.max(bounds.width / TARGET_ASPECT_RATIO, bounds.height);
        if (cost < beforeCost || footprint < beforeFootprint) {
          const lengths = view.edges.flatMap((edge) => {
            const source = proposal[edge.source];
            const target = proposal[edge.target];
            return source && target
              ? [Math.hypot(centerOf(source).x - centerOf(target).x, centerOf(source).y - centerOf(target).y)]
              : [];
          });
          candidates.push({
            positions: proposal,
            safety,
            maximumLength: Math.max(0, ...lengths),
            totalLength: lengths.reduce((sum, length) => sum + length, 0),
            cost,
            footprint,
          });
        }
      }
    }
    const best = candidates.sort(
      (one, other) =>
        (one.safety?.intersections ?? 0) - (other.safety?.intersections ?? 0) ||
        (one.safety?.crossings ?? 0) - (other.safety?.crossings ?? 0) ||
        (one.safety?.labelOcclusions ?? 0) - (other.safety?.labelOcclusions ?? 0) ||
        one.maximumLength - other.maximumLength ||
        one.totalLength - other.totalLength ||
        one.cost - other.cost ||
        one.footprint - other.footprint
    )[0];
    if (best) {
      for (const id of group.ids) {
        positions[id] = best.positions[id]!;
      }
    }
  }
}

/** Keeps a semantic proposal only when the completed drawing remains safer. */
function guardedSemanticCandidate(
  view: ViewModel,
  positions: Positions,
  settings: LayoutOptions,
  mutate: () => void
): boolean {
  const ids = Object.keys(positions);
  if (ids.length > MAX_CROSS_AXIS_NODES) {
    mutate();
    return true;
  }
  const members = new Set(ids);
  const edgeIds = new Set(
    view.edges.filter((edge) => members.has(edge.source) && members.has(edge.target)).map((edge) => edge.id)
  );
  const beforePositions = Object.fromEntries(ids.map((id) => [id, { ...positions[id]! }]));
  const before = renderedSafety(view, positions, ids, edgeIds, settings.direction);
  const beforeCost = semanticGeometryCost(view, positions, members, settings);
  const beforeBounds = boundsOf(ids.map((id) => positions[id]!));
  const beforeFootprint = Math.max(beforeBounds.width / TARGET_ASPECT_RATIO, beforeBounds.height);
  mutate();
  const overlapsNode = ids.some((id, index) =>
    ids.slice(index + 1).some((other) => overlaps(positions[id]!, positions[other]!))
  );
  const after = renderedSafety(view, positions, ids, edgeIds, settings.direction);
  const afterCost = semanticGeometryCost(view, positions, members, settings);
  const afterBounds = boundsOf(ids.map((id) => positions[id]!));
  const afterFootprint = Math.max(afterBounds.width / TARGET_ASPECT_RATIO, afterBounds.height);
  const safe =
    !overlapsNode &&
    after.intersections <= before.intersections &&
    after.crossings <= before.crossings &&
    // One label may trade for a materially shorter or more semantic
    // candidate; larger regressions remain categorically rejected.
    after.labelOcclusions <= before.labelOcclusions + 1;
  const improves =
    after.intersections < before.intersections ||
    after.crossings < before.crossings ||
    after.labelOcclusions < before.labelOcclusions ||
    afterCost < beforeCost ||
    afterFootprint < beforeFootprint;
  if (safe && improves) {
    return true;
  }
  for (const id of ids) {
    positions[id] = beforePositions[id]!;
  }
  return false;
}

function overlapArea(one: Rect, other: Rect): number {
  return (
    Math.max(0, Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x)) *
    Math.max(0, Math.min(one.y + one.height, other.y + other.height) - Math.max(one.y, other.y))
  );
}

/** Width requested by a relation, including layout-only fixtures with bare ends. */
function layoutLabelWidth(edge: ViewModel["edges"][number]): number {
  return edge.kind === "relation"
    ? labelWidth(
        {
          ...edge,
          sourceEnd: edge.sourceEnd ?? { isConst: false, isAddOnly: false },
          targetEnd: edge.targetEnd ?? { isConst: false, isAddOnly: false },
        },
        defaultDisplayOptions
      )
    : 0;
}

/** A rendering safe for skeletal relations in layout-only unit fixtures. */
function renderForLayoutScore(
  view: ViewModel,
  positions: Positions,
  direction: LayoutOptions["direction"],
  routing: RoutingStyle = "straight"
) {
  // A few layout unit tests intentionally use skeletal relation ends. They
  // carry enough information for layout but not for label rendering, so fill
  // only the two flags the renderer expects before asking it to score labels.
  const drawable: ViewModel = {
    ...view,
    edges: view.edges.map((edge) =>
      edge.kind === "relation"
        ? {
            ...edge,
            sourceEnd: edge.sourceEnd ?? { isConst: false, isAddOnly: false },
            targetEnd: edge.targetEnd ?? { isConst: false, isAddOnly: false },
          }
        : edge
    ),
  };
  return render({
    view: drawable,
    positions,
    direction,
    // The fan is a final drawing distinction with its own crossing guard;
    // it must not make the optimizer move whole clusters to accommodate a
    // line-style choice that leaves the association's endpoints unchanged.
    repeatedAssociationFans: false,
    display: { ...defaultDisplayOptions, routing, showPackageGroups: false },
  });
}

/** The boxes of a rendering's edge labels, measured as the benchmark harness does. */
function renderedLabelBoxes(svg: string): Array<Rect & { owner: string | undefined }> {
  const layer = /<g class="tv-labels">([\s\S]*?)<\/svg>/.exec(svg)?.[1] ?? "";
  return [...layer.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)].flatMap((match) => {
    const attributes = match[1]!;
    const text = match[2]!;
    const x = Number(/ x="([-\d.]+)"/.exec(attributes)?.[1]);
    const y = Number(/ y="([-\d.]+)"/.exec(attributes)?.[1]);
    if (!text.trim() || !isFinite(x) || !isFinite(y)) {
      return [];
    }
    const size = /tv-edge-stereotype/.test(attributes) ? FONT.edgeStereotype : FONT.edge;
    const width = textWidth(text, size) + 6;
    const anchor = /text-anchor="(\w+)"/.exec(attributes)?.[1] ?? "start";
    const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
    const owner = /data-for="([^"]+)"/.exec(attributes)?.[1];
    return [{ x: left, y: y - size, width, height: size + 4, owner }];
  });
}

/** Label collisions in the same form used by the benchmark harness. */
function renderedLabelOcclusions(svg: string, positions: Positions): number {
  const labels = renderedLabelBoxes(svg);
  const nodes = Object.values(positions);
  let occlusions = labels.filter((label) => nodes.some((node) => overlapArea(label, node) > 0)).length;
  for (let one = 0; one < labels.length; one += 1) {
    occlusions += labels
      .slice(one + 1)
      .filter((other) => labels[one]!.owner !== other.owner && overlapArea(labels[one]!, other) > 0).length;
  }
  return occlusions;
}

interface RenderedSafety {
  intersections: number;
  crossings: number;
  labelOcclusions: number;
}

/** The high-priority faults of the actual port-spread, tree-aware rendering. */
function renderedSafety(
  view: ViewModel,
  positions: Positions,
  ids: string[],
  edgeIds: ReadonlySet<string>,
  direction: LayoutOptions["direction"]
): RenderedSafety {
  const output = renderForLayoutScore(view, positions, direction);
  const edgeById = new Map(view.edges.map((edge) => [edge.id, edge]));
  const paths = Object.entries(output.paths).filter(([id]) => edgeIds.has(id));
  let intersections = 0;
  for (const [id, points] of paths) {
    const edge = edgeById.get(id);
    for (const nodeId of ids) {
      if (nodeId === edge?.source || nodeId === edge?.target) {
        continue;
      }
      const rect = positions[nodeId];
      if (rect && points.slice(1).some((to, index) => segmentHitsRect(points[index]!, to, rect, 2))) {
        intersections += 1;
      }
    }
  }
  let crossings = 0;
  for (let one = 0; one < paths.length; one += 1) {
    for (let two = one + 1; two < paths.length; two += 1) {
      const first = paths[one]![1];
      const second = paths[two]![1];
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
  return {
    intersections,
    crossings,
    labelOcclusions: renderedLabelOcclusions(output.svg, positions),
  };
}

/**
 * Improves the order across taxonomy ranks without changing their rank axis.
 *
 * ELK supplies a useful initial order, but `enforceTaxonomyRanks` and the later
 * semantic repairs move its neighbours after that order was chosen. This
 * bounded local search tries the full-graph barycentric order, every adjacent
 * exchange, and cross-axis translations of complete visual bands, retaining a
 * candidate only when the shared quality score improves. Four passes let a
 * change in one rank inform the next one without turning arrangement into an
 * unbounded optimization job.
 */
function optimizeRankCrossAxis(
  view: ViewModel,
  positions: Positions,
  subject: ReadonlySet<string>,
  ranked: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
  settings: LayoutOptions,
  compactCoordinates: boolean,
  protectedEdges: ReadonlySet<string>
): void {
  // This first slice deliberately excludes large models. Re-rendering every
  // promising candidate is the correctness gate for ports, trees and labels;
  // on a large ontology that is seconds of work and no longer interactive.
  // The incremental scorer planned next can lift the bound without changing
  // the optimizer's contract.
  if ([...subject].filter((id) => !excluded.has(id)).length > MAX_CROSS_AXIS_NODES) {
    return;
  }
  const primary = settings.direction === "DOWN" ? ("y" as const) : ("x" as const);
  const cross = settings.direction === "DOWN" ? ("x" as const) : ("y" as const);
  const crossSize = settings.direction === "DOWN" ? ("width" as const) : ("height" as const);
  const covered = inversePairs(view.edges).covered;
  const visibleEdges = view.edges.filter(
    (edge) => !covered.has(edge.id) && subject.has(edge.source) && subject.has(edge.target)
  );
  const protectedNodes = new Set(
    visibleEdges.filter((edge) => protectedEdges.has(edge.id)).flatMap((edge) => [edge.source, edge.target])
  );
  const byPair = new Map<string, typeof visibleEdges>();
  for (const edge of visibleEdges.filter((edge) => edge.kind === "relation")) {
    const key = [edge.source, edge.target].sort().join("\0");
    byPair.set(key, [...(byPair.get(key) ?? []), edge]);
  }
  for (const pair of byPair.values()) {
    if (pair.length > 1) {
      protectedNodes.add(pair[0]!.source);
      protectedNodes.add(pair[0]!.target);
    }
  }
  const incident = new Map<string, typeof visibleEdges>();
  const packageOf = new Map(view.nodes.map((node) => [node.id, node.package]));
  for (const edge of visibleEdges) {
    incident.set(edge.source, [...(incident.get(edge.source) ?? []), edge]);
    incident.set(edge.target, [...(incident.get(edge.target) ?? []), edge]);
  }

  for (const ids of weakComponents(view, subject, excluded)) {
    const members = new Set(ids);
    const edges = visibleEdges.filter((edge) => members.has(edge.source) && members.has(edge.target));
    const rows = new Map<number, string[]>();
    for (const id of ids) {
      const rect = positions[id];
      if (!ranked.has(id) || !rect) {
        continue;
      }
      rows.set(rect[primary], [...(rows.get(rect[primary]) ?? []), id]);
    }
    const rankedRows = [...rows.entries()].filter(([, row]) => row.length > 1).sort(([one], [other]) => one - other);
    if (!ids.some((id) => ranked.has(id)) || edges.length === 0) {
      continue;
    }

    const score = (candidate: Positions): CrossAxisScore => {
      // Port spreading, generalization trees and obstacle detours all
      // change the lines the reader actually sees. Score those rendered
      // routes rather than centre-to-centre approximations, which can
      // call a swap an improvement while adding crossings at the box
      // borders. Tree buses are scored through their member edges here;
      // the final benchmark remains the authority for the rendered tree.
      // Keep the optimizer's historical zero-width port geometry. The
      // renderer evaluates decorator-aware and legacy fans against the
      // completed paths, where a wider head reservation cannot silently
      // add a centre-line crossing.
      const ports = assignPorts(edges, candidate, new Set(), [], "ray", settings.direction, false).ends;
      const obstacles = ids.map((id) => candidate[id]).filter((rect): rect is Rect => rect !== undefined);
      const bends: Point[] = [];
      const paths: Array<[string, Point[]]> = [];
      for (const edge of edges) {
        const source = candidate[edge.source];
        const target = candidate[edge.target];
        if (!source || !target) {
          continue;
        }
        const points = routeEdge(source, target, {
          ...(ports.get(edge.id) ? { ends: ports.get(edge.id)! } : {}),
          style: "straight",
          obstacles,
          avoid: bends,
        });
        paths.push([edge.id, points]);
        bends.push(...points.slice(1, -1));
      }
      const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
      const pathLength = (points: Point[]): number =>
        points
          .slice(1)
          .reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);
      let intersections = 0;
      for (const [id, points] of paths) {
        const edge = edgeById.get(id);
        for (const id of ids) {
          if (id === edge?.source || id === edge?.target) {
            continue;
          }
          const rect = candidate[id];
          if (rect && points.slice(1).some((to, index) => segmentHitsRect(points[index]!, to, rect, 2))) {
            intersections += 1;
          }
        }
      }
      let crossings = 0;
      for (let one = 0; one < paths.length; one += 1) {
        for (let two = one + 1; two < paths.length; two += 1) {
          const first = paths[one]![1];
          const second = paths[two]![1];
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
      const lengths = paths.map(([, points]) => pathLength(points));
      const bounds = boundsOf(ids.map((id) => candidate[id]).filter((rect): rect is Rect => rect !== undefined));
      return {
        intersections,
        crossings,
        semanticCost: semanticGeometryCost(view, candidate, members, settings),
        maximumLength: Math.round(Math.max(0, ...lengths)),
        totalLength: Math.round(lengths.reduce((sum, length) => sum + length, 0)),
        span: Math.round(bounds[crossSize]),
      };
    };

    const rowCandidate = (order: string[]): Positions => {
      const original = boundsOf(order.map((id) => positions[id]!));
      const length =
        order.reduce((sum, id) => sum + positions[id]![crossSize], 0) + settings.nodeSpacing * (order.length - 1);
      let along = original[cross] + (original[crossSize] - length) / 2;
      const candidate = { ...positions };
      for (const id of order) {
        candidate[id] = { ...positions[id]!, [cross]: Math.round(along) };
        along += positions[id]![crossSize] + settings.nodeSpacing;
      }
      return candidate;
    };
    const clear = (candidate: Positions, row: ReadonlySet<string>): boolean =>
      [...row].every((id) => {
        const rect = candidate[id]!;
        return Object.entries(candidate).every(
          ([otherId, other]) =>
            row.has(otherId) || !subject.has(otherId) || !overlaps(rect, other, Math.min(settings.nodeSpacing / 3, 20))
        );
      });
    const acceptCandidates = (candidates: Positions[], movable: ReadonlySet<string>): boolean => {
      let bestScore = score(positions);
      const edgeIds = new Set(edges.map((edge) => edge.id));
      let bestSafety = renderedSafety(view, positions, ids, edgeIds, settings.direction);
      const labelCeiling = bestSafety.labelOcclusions;
      let best: Positions | undefined;
      for (const candidate of candidates) {
        if (!clear(candidate, movable)) {
          continue;
        }
        const candidateScore = score(candidate);
        if (!betterCrossAxisScore(candidateScore, bestScore)) {
          continue;
        }
        const candidateSafety = renderedSafety(view, candidate, ids, edgeIds, settings.direction);
        if (
          candidateSafety.intersections <= bestSafety.intersections &&
          candidateSafety.crossings <= bestSafety.crossings &&
          candidateSafety.labelOcclusions <= labelCeiling
        ) {
          best = candidate;
          bestScore = candidateScore;
          bestSafety = candidateSafety;
        }
      }
      if (!best) {
        return false;
      }
      for (const id of movable) {
        positions[id] = best[id]!;
      }
      return true;
    };
    const acceptBest = (orders: string[][], row: ReadonlySet<string>): boolean =>
      acceptCandidates(orders.map(rowCandidate), row);

    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      for (const [, rowIds] of rankedRows) {
        const current = [...rowIds].sort(
          (one, other) => positions[one]![cross] - positions[other]![cross] || one.localeCompare(other)
        );
        const barycentre = (id: string): number => {
          let total = 0;
          let weight = 0;
          for (const edge of incident.get(id) ?? []) {
            const neighbour = edge.source === id ? edge.target : edge.source;
            const rect = positions[neighbour];
            if (!rect || members.has(neighbour) === false) {
              continue;
            }
            const edgeWeight = edge.kind === "generalization" ? 3 : 1;
            total += (rect[cross] + rect[crossSize] / 2) * edgeWeight;
            weight += edgeWeight;
          }
          const rect = positions[id]!;
          return weight > 0 ? total / weight : rect[cross] + rect[crossSize] / 2;
        };
        const barycentric = [...current].sort(
          (one, other) => barycentre(one) - barycentre(other) || current.indexOf(one) - current.indexOf(other)
        );
        const packageOrder = new Map<string | undefined, number>();
        for (const id of current) {
          const pkg = packageOf.get(id);
          if (!packageOrder.has(pkg)) {
            packageOrder.set(pkg, packageOrder.size);
          }
        }
        const packageGrouped = [...current].sort(
          (one, other) =>
            (packageOrder.get(packageOf.get(one)) ?? 0) - (packageOrder.get(packageOf.get(other)) ?? 0) ||
            current.indexOf(one) - current.indexOf(other)
        );
        const orders = settings.groupByPackage ? [current, barycentric, packageGrouped] : [current, barycentric];
        for (const base of [current, barycentric]) {
          for (let index = 0; index + 1 < base.length; index += 1) {
            const swapped = [...base];
            [swapped[index], swapped[index + 1]] = [swapped[index + 1]!, swapped[index]!];
            orders.push(swapped);
          }
        }
        const distinctOrders = [...new Map(orders.map((order) => [order.join("\0"), order])).values()];
        changed = acceptBest(distinctOrders, new Set(rowIds)) || changed;
      }
      if (!changed) {
        break;
      }
    }

    if (!compactCoordinates) {
      continue;
    }

    // Once rank order is stable, translate complete horizontal/vertical
    // bands towards the weighted middle of the neighbours outside them.
    // A band moves rigidly: its order, spacing and primary coordinate are
    // unchanged, including the fan and paired-relation shapes established
    // by the semantic passes before this optimizer.
    const bands = new Map<number, string[]>();
    for (const id of ids) {
      const rect = positions[id];
      if (rect) {
        bands.set(rect[primary], [...(bands.get(rect[primary]) ?? []), id]);
      }
    }
    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      for (const [, bandIds] of [...bands].sort(([one], [other]) => one - other)) {
        if (bandIds.some((id) => protectedNodes.has(id))) {
          continue;
        }
        const band = new Set(bandIds);
        let target = 0;
        let weight = 0;
        for (const id of bandIds) {
          for (const edge of incident.get(id) ?? []) {
            const neighbour = edge.source === id ? edge.target : edge.source;
            if (band.has(neighbour) || !members.has(neighbour)) {
              continue;
            }
            const rect = positions[neighbour];
            if (!rect) {
              continue;
            }
            const edgeWeight = edge.kind === "generalization" ? 3 : 1;
            target += (rect[cross] + rect[crossSize] / 2) * edgeWeight;
            weight += edgeWeight;
          }
        }
        if (weight === 0) {
          continue;
        }
        const bandBounds = boundsOf(bandIds.map((id) => positions[id]!));
        const middle = bandBounds[cross] + bandBounds[crossSize] / 2;
        const fullShift = target / weight - middle;
        const shifts = [
          ...new Set([1, 0.75, 0.5, 0.25].map((share) => Math.round(fullShift * share)).filter((shift) => shift !== 0)),
        ];
        const candidates = shifts.map((shift) => {
          const candidate = { ...positions };
          for (const id of bandIds) {
            candidate[id] = { ...positions[id]!, [cross]: positions[id]![cross] + shift };
          }
          return candidate;
        });
        changed = acceptCandidates(candidates, band) || changed;
      }
      if (!changed) {
        break;
      }
    }

    // A labelled relation whose boxes nearly touch has no corridor: every
    // midpoint and end-label candidate is still inside one endpoint or the
    // other. Give a low-degree, unranked endpoint just enough distance for
    // that block, and retain the move only when the final renderer reports
    // fewer real label collisions without sacrificing a crossing or an
    // inheritance lane. This is deliberately after compaction, which is
    // the pass that can close a previously adequate corridor.
    const edgeIds = new Set(edges.map((edge) => edge.id));
    const corridors = taxonomyCorridors(view, positions, ranked);
    const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
    for (let pass = 0; pass < 2; pass += 1) {
      let changed = false;
      for (const edge of [...edges]
        .filter((edge) => edge.kind === "relation" && edge.source !== edge.target)
        .sort((one, other) => layoutLabelWidth(other) - layoutLabelWidth(one) || one.id.localeCompare(other.id))) {
        if (edge.kind !== "relation") {
          continue;
        }
        const source = positions[edge.source];
        const targetRect = positions[edge.target];
        if (!source || !targetRect) {
          continue;
        }
        const centreDemand = layoutLabelWidth(edge);
        const hasEndDemand = [edge.sourceEnd, edge.targetEnd].some(
          (end) => !end || end.cardinality || end.role || end.isAddOnly || end.subsets || end.redefines || !end.isConst
        );
        const required = Math.max(96, centreDemand + 40, hasEndDemand ? 128 : 0);
        const from = borderPoint(source, centerOf(targetRect));
        const to = borderPoint(targetRect, centerOf(source));
        const available = Math.hypot(to.x - from.x, to.y - from.y);
        if (available >= required) {
          continue;
        }
        const movable = [edge.source, edge.target]
          .filter(
            (id) =>
              !protectedNodes.has(id) &&
              nodeById.get(id)?.stereotype !== "relator" &&
              (incident.get(id)?.length ?? 0) <= (ranked.has(id) ? 4 : 2)
          )
          .sort(
            (one, other) =>
              (incident.get(one)?.length ?? 0) - (incident.get(other)?.length ?? 0) || one.localeCompare(other)
          );
        if (movable.length === 0) {
          continue;
        }
        const before = renderedSafety(view, positions, ids, edgeIds, settings.direction);
        let best: { positions: Positions; safety: RenderedSafety; distance: number; id: string } | undefined;
        for (const id of movable) {
          const rect = positions[id]!;
          const fixed = positions[id === edge.source ? edge.target : edge.source]!;
          const rectCentre = centerOf(rect);
          const fixedCentre = centerOf(fixed);
          const dx = rectCentre.x - fixedCentre.x;
          const dy = rectCentre.y - fixedCentre.y;
          const length = Math.hypot(dx, dy) || 1;
          const distance = Math.min(required - available, 180);
          const directions = ranked.has(id)
            ? settings.direction === "DOWN"
              ? [
                  { x: Math.sign(dx) || 1, y: 0 },
                  { x: -(Math.sign(dx) || 1), y: 0 },
                ]
              : [
                  { x: 0, y: Math.sign(dy) || 1 },
                  { x: 0, y: -(Math.sign(dy) || 1) },
                ]
            : [
                { x: dx / length, y: dy / length },
                { x: Math.sign(dx) || 1, y: 0 },
                { x: -(Math.sign(dx) || 1), y: 0 },
                { x: 0, y: Math.sign(dy) || 1 },
                { x: 0, y: -(Math.sign(dy) || 1) },
              ];
          for (const direction of directions) {
            for (const share of [1, 1.25, 1.5]) {
              const shift = distance * share;
              const candidate = { ...positions };
              candidate[id] = {
                ...rect,
                x: Math.round(rect.x + direction.x * shift),
                y: Math.round(rect.y + direction.y * shift),
              };
              const moved = candidate[id]!;
              if (
                !clear(candidate, new Set([id])) ||
                corridors.some(
                  (corridor) =>
                    corridor.source !== id &&
                    corridor.target !== id &&
                    segmentHitsRect(corridor.from, corridor.to, moved, TAXONOMY_CORRIDOR)
                )
              ) {
                continue;
              }
              const safety = renderedSafety(view, candidate, ids, edgeIds, settings.direction);
              if (
                safety.intersections > before.intersections ||
                safety.crossings > before.crossings ||
                safety.labelOcclusions >= before.labelOcclusions
              ) {
                continue;
              }
              if (
                !best ||
                safety.labelOcclusions < best.safety.labelOcclusions ||
                (safety.labelOcclusions === best.safety.labelOcclusions && shift < best.distance)
              ) {
                best = { positions: candidate, safety, distance: shift, id };
              }
            }
          }
        }
        if (best) {
          positions[best.id] = best.positions[best.id]!;
          changed = true;
        }
      }
      if (!changed) {
        break;
      }
    }
  }
}

/**
 * Moves a class with no supertype and no subtype -- alone, or together with
 * whichever others like it it associates with -- towards the middle of
 * everything else it is connected to, where there is room.
 *
 * `enforceTaxonomyRanks` only repositions the classes it ranks -- anything
 * with a generalization edge. A class with neither keeps exactly the
 * coordinates ELK's whole-graph pass gave it, even after every taxonomy
 * around it has since been translated onto its own re-derived rank. The
 * association that put such a class near its neighbours in that first pass is
 * still real; it is the neighbours that moved out from under it, the same way
 * a relator is stranded by ranks decided without it.
 *
 * Two such classes joined to each other -- `Journal` and its `JournalVolume`,
 * with no taxonomy of their own -- move as one piece rather than each towards
 * its own idea of the middle: settling `JournalVolume` towards a taxonomy two
 * ranks away and leaving `Journal` behind splits a pair that reads as one
 * thing, which is the same reason a whole taxonomy is re-ranked together
 * instead of class by class.
 */
function settleOrphans(
  view: ViewModel,
  positions: Positions,
  only: ReadonlySet<string>,
  ranked: ReadonlySet<string>
): void {
  const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
  const isOrphan = (id: string): boolean => {
    const node = nodeById.get(id);
    return (
      node !== undefined && node.kind === "class" && node.stereotype !== "relator" && only.has(id) && !ranked.has(id)
    );
  };
  const orphanIds = view.nodes.map((node) => node.id).filter(isOrphan);
  if (orphanIds.length === 0) {
    return;
  }

  // Taxonomy was just put back onto semantic ranks. Its open corridors are
  // part of that result: seating an association-only class between a general
  // and its specific forces the router to draw inheritance around a class it
  // has nothing to do with. Keep a modest lane around the direct border-to-
  // border path while the orphan components search for their nearest place.
  const corridors = taxonomyCorridors(view, positions, ranked);

  const neighboursOf = new Map<string, Set<string>>();
  for (const edge of view.edges) {
    if (edge.kind !== "relation" || edge.source === edge.target || !only.has(edge.source) || !only.has(edge.target)) {
      continue;
    }
    neighboursOf.set(edge.source, new Set([...(neighboursOf.get(edge.source) ?? []), edge.target]));
    neighboursOf.set(edge.target, new Set([...(neighboursOf.get(edge.target) ?? []), edge.source]));
  }

  // Union-find over orphans only: an association to a ranked class or a
  // relator never merges two components, only one to another orphan does.
  const unseen = new Set(orphanIds);
  const components: string[][] = [];
  while (unseen.size > 0) {
    const first = unseen.values().next().value as string;
    unseen.delete(first);
    const component = [first];
    const visit = [first];
    while (visit.length > 0) {
      const id = visit.pop()!;
      for (const neighbour of neighboursOf.get(id) ?? []) {
        if (isOrphan(neighbour) && unseen.delete(neighbour)) {
          component.push(neighbour);
          visit.push(neighbour);
        }
      }
    }
    components.push(component);
  }

  const centreOf = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  const average = (points: Array<{ x: number; y: number }>) => ({
    x: points.reduce((sum, one) => sum + one.x, 0) / points.length,
    y: points.reduce((sum, one) => sum + one.y, 0) / points.length,
  });

  for (const component of components) {
    const members = new Set(component);
    const rects = component.map((id) => positions[id]).filter((one): one is Rect => one !== undefined);
    if (rects.length !== component.length) {
      continue;
    }
    const outsideIds = new Set<string>();
    for (const id of component) {
      for (const neighbour of neighboursOf.get(id) ?? []) {
        if (!members.has(neighbour)) {
          outsideIds.add(neighbour);
        }
      }
    }
    const anchors = [...outsideIds].map((id) => positions[id]).filter((one): one is Rect => one !== undefined);
    if (anchors.length === 0) {
      continue;
    }

    const delta = {
      x: average(anchors.map(centreOf)).x - average(rects.map(centreOf)).x,
      y: average(anchors.map(centreOf)).y - average(rects.map(centreOf)).y,
    };
    const others = Object.entries(positions)
      .filter(([id]) => !members.has(id))
      .map(([, one]) => one);
    const fits = (dx: number, dy: number) =>
      component.every((id) => {
        const rect = positions[id]!;
        const moved = { ...rect, x: Math.round(rect.x + dx), y: Math.round(rect.y + dy) };
        return (
          !others.some((one) => overlaps(moved, one, 24)) &&
          !corridors.some((corridor) => segmentHitsRect(corridor.from, corridor.to, moved, TAXONOMY_CORRIDOR))
        );
      });

    // The straight line to the anchors is blocked as often as it is
    // clear -- `Publisher` or `Article` sitting on it is the ordinary
    // case, not the exception. A ring search around that target finds
    // the nearest opening rather than only ever a shorter version of the
    // same blocked line, the way `placePartialLayout` finds room for a
    // selection nothing here already occupies.
    let translation: Point | undefined = fits(delta.x, delta.y) ? delta : undefined;
    for (let ring = 1; ring < 80 && !translation; ring += 1) {
      for (const offset of partialRing(ring)) {
        const candidate = { x: delta.x + offset.x * PARTIAL_STEP, y: delta.y + offset.y * PARTIAL_STEP };
        if (fits(candidate.x, candidate.y)) {
          translation = candidate;
          break;
        }
      }
    }
    if (!translation) {
      continue;
    }
    for (const id of component) {
      const rect = positions[id]!;
      positions[id] = {
        ...rect,
        x: Math.round(rect.x + translation.x),
        y: Math.round(rect.y + translation.y),
      };
    }
  }
}

/**
 * Places dependent aspects where their characterization is normally read.
 *
 * A quality or extrinsic mode is visually subordinate to its bearer, but ELK
 * sees characterization as just another directed edge and often puts the
 * aspect above or to the left as though it were a supertype. The language has
 * already identified the classifier and the characterization's ends, so use
 * those facts as a soft right-side preference. A classified aspect that is
 * itself in a taxonomy stays with that taxonomy; its rank is stronger than the
 * preference, and the eventual cross-axis optimizer can weigh both together.
 */
function orientCharacterizedAspects(
  view: ViewModel,
  positions: Positions,
  subject: ReadonlySet<string>,
  ranked: ReadonlySet<string>,
  settings: LayoutOptions
): void {
  const nodes = new Map(view.nodes.map((node) => [node.id, node]));
  const covered = inversePairs(view.edges).covered;
  const prefersRight = (id: string): boolean => {
    const node = nodes.get(id);
    return node?.stereotype === "extrinsicMode" || node?.stereotype === "quality";
  };
  const bearers = new Map<string, Set<string>>();
  for (const edge of view.edges) {
    if (
      edge.kind !== "relation" ||
      edge.stereotype !== "characterization" ||
      !subject.has(edge.source) ||
      !subject.has(edge.target) ||
      !prefersRight(edge.source)
    ) {
      continue;
    }
    bearers.set(edge.source, new Set([...(bearers.get(edge.source) ?? []), edge.target]));
  }

  const corridors = taxonomyCorridors(view, positions, ranked);
  for (const [aspect, bearerIds] of [...bearers].sort(([one], [other]) => one.localeCompare(other))) {
    // Moving a member independently would undo the taxonomy's cross-axis
    // ordering even when it happens not to alter the formal rank.
    if (ranked.has(aspect)) {
      continue;
    }
    const rect = positions[aspect];
    const bearerRects = [...bearerIds].map((id) => positions[id]).filter((one): one is Rect => one !== undefined);
    if (!rect || bearerRects.length === 0) {
      continue;
    }
    const direct = view.edges.filter(
      (edge) =>
        edge.kind === "relation" &&
        !covered.has(edge.id) &&
        ((edge.source === aspect && bearerIds.has(edge.target)) ||
          (edge.target === aspect && bearerIds.has(edge.source)))
    );
    // This is a targeted reservation along one association corridor, not
    // the synthetic label nodes ELK previously turned into extra ranks.
    // The latter was rolled back; here a long stereotype merely increases
    // the preferred horizontal gap between the pair that carries it.
    const labelGap = Math.max(0, ...direct.map((edge) => layoutLabelWidth(edge) + 36));
    const gap = Math.max(settings.nodeSpacing, 40, Math.round(labelGap));
    const bearerMiddleY =
      bearerRects.reduce((sum, one) => sum + one.y + one.height / 2, 0) / bearerRects.length - rect.height / 2;
    const bundled = direct.length > 1 && bearerRects.length === 1 && settings.direction === "DOWN";
    const desiredX = bundled
      ? Math.round(bearerRects[0]!.x + (bearerRects[0]!.width - rect.width) / 2)
      : Math.max(...bearerRects.map((one) => one.x + one.width)) + gap;
    const desiredY = bundled
      ? Math.round(bearerRects[0]!.y + bearerRects[0]!.height + settings.rankSpacing + PARTIAL_STEP)
      : Math.round(bearerMiddleY);
    const obstacles = Object.entries(positions)
      .filter(([id]) => id !== aspect)
      .map(([, one]) => one);
    const incident = view.edges.filter((edge) => edge.source === aspect || edge.target === aspect);
    const crossingsAt = (candidate: Rect): number => {
      const pointOf = (id: string): Point | undefined =>
        id === aspect ? centerOf(candidate) : positions[id] ? centerOf(positions[id]!) : undefined;
      let crossings = 0;
      for (const edge of incident) {
        const from = pointOf(edge.source);
        const to = pointOf(edge.target);
        if (!from || !to) {
          continue;
        }
        for (const other of view.edges) {
          if (
            other.id === edge.id ||
            other.source === aspect ||
            other.target === aspect ||
            other.source === edge.source ||
            other.source === edge.target ||
            other.target === edge.source ||
            other.target === edge.target
          ) {
            continue;
          }
          const otherFrom = pointOf(other.source);
          const otherTo = pointOf(other.target);
          if (otherFrom && otherTo && segmentsProperlyCross(from, to, otherFrom, otherTo)) {
            crossings += 1;
          }
        }
      }
      return crossings;
    };
    const previousCrossings = crossingsAt(rect);
    const fits = (candidate: Rect): boolean =>
      !obstacles.some((one) => overlaps(candidate, one, PARTIAL_GAP)) &&
      !corridors.some((corridor) => segmentHitsRect(corridor.from, corridor.to, candidate, TAXONOMY_CORRIDOR)) &&
      crossingsAt(candidate) <= previousCrossings;

    let chosen: Rect | undefined;
    if (bundled) {
      // Parallel relationships need separate label and decorator lanes.
      // A vertical pair leaves a lane on either side, as opposed to
      // forcing both relations into the one horizontal gap reserved for
      // a single characterization.
      for (let ring = 0; ring <= PREFERRED_SIDE_STEPS && !chosen; ring += 1) {
        for (const offset of ring === 0 ? [{ x: 0, y: 0 }] : partialRing(ring)) {
          const candidate = {
            ...rect,
            x: desiredX + offset.x * PARTIAL_STEP,
            y: desiredY + offset.y * PARTIAL_STEP,
          };
          if (fits(candidate)) {
            chosen = candidate;
            break;
          }
        }
      }
    } else {
      // Preserve the bearer's row before trying a nearer x with a large
      // vertical displacement: "to the right" should read horizontally
      // wherever the surrounding graph has a clear corridor for it.
      for (let row = 0; row <= PREFERRED_SIDE_STEPS && !chosen; row += 1) {
        const offsets = row === 0 ? [0] : [-row * PARTIAL_STEP, row * PARTIAL_STEP];
        for (let column = 0; column <= PREFERRED_SIDE_STEPS; column += 1) {
          const x = desiredX + column * PARTIAL_STEP;
          for (const offset of offsets) {
            const candidate = { ...rect, x, y: desiredY + offset };
            if (fits(candidate)) {
              chosen = candidate;
              break;
            }
          }
          if (chosen) {
            break;
          }
        }
      }
    }
    const distanceFromPreference = (candidate: Rect) => Math.hypot(candidate.x - desiredX, candidate.y - desiredY);
    if (chosen && distanceFromPreference(chosen) < distanceFromPreference(rect)) {
      positions[aspect] = chosen;
    }
  }
}

/**
 * Turns a whole with several otherwise unjoined parts into a compact fan.
 *
 * Pairwise whole-before-part placement puts every part to the right. That is a
 * useful reading for one pair, but repeated independently it turns a whole
 * with two leaves into a diagonal chain. With the whole above and centred over
 * one row of leaves, both diamonds share a visual origin and neither relation
 * has to cross the other. Only leaf parts are handled here; a part with another
 * relationship belongs to a larger ordering problem and stays with ELK.
 */
function orientWholeFans(
  view: ViewModel,
  positions: Positions,
  subject: ReadonlySet<string>,
  ranked: ReadonlySet<string> | undefined,
  settings: LayoutOptions
): Set<string> {
  const byWhole = new Map<string, Array<{ edge: string; part: string }>>();
  const relationDegree = new Map<string, number>();
  const covered = inversePairs(view.edges).covered;
  for (const edge of view.edges) {
    if (edge.kind !== "relation" || edge.source === edge.target || covered.has(edge.id)) {
      continue;
    }
    relationDegree.set(edge.source, (relationDegree.get(edge.source) ?? 0) + 1);
    relationDegree.set(edge.target, (relationDegree.get(edge.target) ?? 0) + 1);
    if (!edge.whole || !subject.has(edge.source) || !subject.has(edge.target)) {
      continue;
    }
    const whole = edge.whole === "source" ? edge.source : edge.target;
    const part = edge.whole === "source" ? edge.target : edge.source;
    byWhole.set(whole, [...(byWhole.get(whole) ?? []), { edge: edge.id, part }]);
  }

  const handled = new Set<string>();
  for (const [whole, entries] of [...byWhole].sort(([one], [other]) => one.localeCompare(other))) {
    const distinct = [...new Map(entries.map((entry) => [entry.part, entry])).values()];
    if (
      distinct.length < 2 ||
      ranked?.has(whole) ||
      distinct.some((entry) => ranked?.has(entry.part) || relationDegree.get(entry.part) !== 1)
    ) {
      continue;
    }
    const wholeRect = positions[whole];
    const parts = distinct
      .map((entry) => ({ ...entry, rect: positions[entry.part] }))
      .filter((entry): entry is typeof entry & { rect: Rect } => entry.rect !== undefined);
    if (!wholeRect || parts.length !== distinct.length) {
      continue;
    }

    const primary = settings.direction === "DOWN" ? ("y" as const) : ("x" as const);
    const primarySize = settings.direction === "DOWN" ? ("height" as const) : ("width" as const);
    const cross = settings.direction === "DOWN" ? ("x" as const) : ("y" as const);
    const crossSize = settings.direction === "DOWN" ? ("width" as const) : ("height" as const);
    parts.sort(
      (one, other) =>
        one.rect[cross] + one.rect[crossSize] / 2 - (other.rect[cross] + other.rect[crossSize] / 2) ||
        one.part.localeCompare(other.part)
    );
    const originals = [wholeRect, ...parts.map((entry) => entry.rect)];
    const originalBounds = boundsOf(originals);
    const total =
      parts.reduce((sum, entry) => sum + entry.rect[crossSize], 0) + settings.nodeSpacing * (parts.length - 1);
    let along = originalBounds[cross] + (originalBounds[crossSize] - total) / 2;
    const rowAt = wholeRect[primary] + wholeRect[primarySize] + settings.rankSpacing;
    const proposed = new Map<string, Rect>();
    for (const entry of parts) {
      proposed.set(entry.part, {
        ...entry.rect,
        [cross]: Math.round(along),
        [primary]: Math.round(rowAt),
      });
      along += entry.rect[crossSize] + settings.nodeSpacing;
    }
    const rowBounds = boundsOf([...proposed.values()]);
    proposed.set(whole, {
      ...wholeRect,
      [cross]: Math.round(rowBounds[cross] + (rowBounds[crossSize] - wholeRect[crossSize]) / 2),
    });

    const members = new Set([whole, ...parts.map((entry) => entry.part)]);
    const obstacles = [...subject]
      .filter((id) => !members.has(id) && positions[id] !== undefined)
      .map((id) => positions[id]!);
    const candidateRects = [...proposed.values()];
    const fits = (dx: number, dy: number): boolean =>
      candidateRects.every((rect) => {
        const moved = { ...rect, x: rect.x + dx, y: rect.y + dy };
        return !obstacles.some((obstacle) => overlaps(moved, obstacle, PARTIAL_GAP));
      });
    let translation: Point | undefined;
    for (let ring = 0; ring <= PREFERRED_SIDE_STEPS && !translation; ring += 1) {
      for (const offset of ring === 0 ? [{ x: 0, y: 0 }] : partialRing(ring)) {
        const candidate = { x: offset.x * PARTIAL_STEP, y: offset.y * PARTIAL_STEP };
        if (fits(candidate.x, candidate.y)) {
          translation = candidate;
          break;
        }
      }
    }
    if (!translation) {
      continue;
    }
    for (const [id, rect] of proposed) {
      positions[id] = {
        ...rect,
        x: Math.round(rect.x + translation.x),
        y: Math.round(rect.y + translation.y),
      };
    }
    for (const entry of distinct) {
      handled.add(entry.edge);
    }
  }
  return handled;
}

/**
 * Moves a parthood or constitution pair so the whole reads first.
 *
 * A whole-part diamond and a constitution arrow are both read the way a
 * sentence would put them: the whole named before what it is made of. ELK has
 * no notion of that -- an association carries almost no layering priority, so
 * a part lands left of its whole as often as the other way round, generally by
 * a margin too small to read as deliberate even when the count comes out
 * right. So this asks for real clearance, not a nearer coin flip, and reaches
 * for it: the part is pushed clear of the whole's right edge, or the whole is
 * pulled clear of the part's left one, whichever moves less. Only when
 * neither fits without overlapping a third box does it fall back to the same
 * question turned sideways -- whole above part -- and only when that box is
 * free to move at all: a class the taxonomy has already put on a row of its
 * own does not get pulled off it for an association's sake, which is the same
 * rule that keeps a mediation from dragging a role a rank away from the kind
 * it specializes.
 */
function orientWholes(
  view: ViewModel,
  positions: Positions,
  subject: ReadonlySet<string>,
  ranked: ReadonlySet<string> | undefined,
  direction: LayoutOptions["direction"],
  skipped: ReadonlySet<string> = new Set()
): void {
  const pairs: Array<{ whole: string; part: string }> = [];
  for (const edge of view.edges) {
    if (
      edge.kind !== "relation" ||
      edge.source === edge.target ||
      !subject.has(edge.source) ||
      !subject.has(edge.target) ||
      skipped.has(edge.id)
    ) {
      continue;
    }
    if (edge.whole) {
      pairs.push(
        edge.whole === "source" ? { whole: edge.source, part: edge.target } : { whole: edge.target, part: edge.source }
      );
    } else if (edge.stereotype === "constitution") {
      // Unlike a diamond, constitution names no whole -- but it is
      // written the same way a parthood without one is: the constituted
      // thing as the source, the matter it is constituted of as the
      // target.
      pairs.push({ whole: edge.source, part: edge.target });
    }
  }
  if (pairs.length === 0) {
    return;
  }

  const clearOf = (rect: Rect, exclude: ReadonlySet<string>): boolean => {
    for (const id of subject) {
      if (exclude.has(id)) {
        continue;
      }
      const other = positions[id];
      if (other && overlaps(rect, other, PARTIAL_GAP)) {
        return false;
      }
    }
    return true;
  };

  // The taxonomy's own rank axis is settled ground -- `enforceTaxonomyRanks`
  // put a class there to keep a whole component's rows straight, and pulling
  // one class off that row for this reopens exactly the crossings that pass
  // exists to close. The other axis carries no such meaning and is free.
  const rankAxis: "x" | "y" = direction === "RIGHT" ? "x" : "y";
  const freeToMove = (id: string, axis: "x" | "y"): boolean => axis !== rankAxis || !(ranked?.has(id) ?? false);

  // The nearest clear spot in the direction asked for, not only the nearest
  // possible one: a hub class like `Person` has a whole row of neighbours
  // beside it, and the very first slot past its edge is normally one of
  // theirs. Stepping past them is what a modeller would do by hand; stopping
  // at the first no is what left every part of a crowded whole stranded on
  // its near side, satisfied only by the coin flip of wherever ELK had put it.
  //
  // Bounded, though: a row can stay crowded for a couple of thousand pixels
  // -- `Wood` and `LumpOfSteel` share theirs with most of the diagram -- and
  // the first gap out that far is not a neighbour skipped, it is a class
  // hauled across the drawing to satisfy a preference the reader will not
  // recognise once it has been paid for with a line that long. Past a dozen
  // neighbours' worth of searching, on top is the better trade.
  const MAX_SEEK = 20;
  const seek = (
    id: string,
    axis: "x" | "y",
    base: Rect,
    from: number,
    step: number,
    exclude: ReadonlySet<string>
  ): Rect | undefined => {
    if (!freeToMove(id, axis)) {
      return undefined;
    }
    for (let tries = 0; tries < MAX_SEEK; tries += 1) {
      const candidate = { ...base, [axis]: from + step * tries };
      if (clearOf(candidate, exclude)) {
        return candidate;
      }
    }
    return undefined;
  };

  // Which of the pair moves, when both a push and a pull would do: the one
  // with fewer lines of its own. A `Person` with twenty relations is the
  // reason half the diagram is arranged the way it is; a `Heart` with one is
  // not. Moving the hub to satisfy a single part is a worse trade than
  // moving the part, whichever happens to be nearer.
  const degree = new Map<string, number>();
  for (const edge of view.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  for (const { whole, part } of pairs) {
    const wholeRect = positions[whole];
    const partRect = positions[part];
    if (!wholeRect || !partRect) {
      continue;
    }
    const exclude = new Set([whole, part]);

    if (wholeRect.x + wholeRect.width + PARTIAL_GAP > partRect.x) {
      const pushPart = seek(part, "x", partRect, wholeRect.x + wholeRect.width + PARTIAL_GAP, PARTIAL_STEP, exclude);
      const pullWhole = seek(whole, "x", wholeRect, partRect.x - wholeRect.width - PARTIAL_GAP, -PARTIAL_STEP, exclude);
      const moveWhole = pullWhole && (!pushPart || (degree.get(whole) ?? 0) < (degree.get(part) ?? 0));
      const chosen = moveWhole ? pullWhole : pushPart;
      if (chosen) {
        positions[moveWhole ? whole : part] = chosen;
        continue;
      }
    } else {
      continue;
    }

    const w = positions[whole]!;
    const p = positions[part]!;
    if (w.y + w.height + PARTIAL_GAP <= p.y) {
      continue;
    }
    const pushDown = seek(part, "y", p, w.y + w.height + PARTIAL_GAP, PARTIAL_STEP, exclude);
    const pullUp = seek(whole, "y", w, p.y - w.height - PARTIAL_GAP, -PARTIAL_STEP, exclude);
    const moveWholeY = pullUp && (!pushDown || (degree.get(whole) ?? 0) < (degree.get(part) ?? 0));
    const chosenY = moveWholeY ? pullUp : pushDown;
    if (chosenY) {
      positions[moveWholeY ? whole : part] = chosenY;
    }
  }
}

/**
 * Restores the ontology's hierarchy after ELK has optimized the whole graph.
 *
 * The first layout remains useful: associations and packages decide where each
 * independent taxonomy belongs and the order across a rank. They must not
 * decide the ranks inside a taxonomy, however. Each hierarchy component is
 * regularized around the place ELK chose for it; unrelated hierarchies are not
 * forced into one diagram-wide row.
 */
function enforceTaxonomyRanks(
  view: ViewModel,
  positions: Positions,
  subject: ReadonlySet<string>,
  settings: LayoutOptions,
  packageContainers: boolean
): Set<string> | undefined {
  const generalizations = view.edges.filter(
    (edge) => edge.kind === "generalization" && subject.has(edge.source) && subject.has(edge.target)
  );
  if (generalizations.length === 0) {
    return undefined;
  }

  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  for (const edge of generalizations) {
    parents.set(edge.source, new Set([...(parents.get(edge.source) ?? []), edge.target]));
    children.set(edge.target, new Set([...(children.get(edge.target) ?? []), edge.source]));
    parents.set(edge.target, parents.get(edge.target) ?? new Set());
    children.set(edge.source, children.get(edge.source) ?? new Set());
  }

  // Parent -> child topological walk. A temporarily cyclic model is left in
  // rank zero rather than making arrangement fail while it is being edited.
  const pending = new Map([...parents].map(([id, values]) => [id, values.size]));
  const ranks = new Map<string, number>();
  const queue = [...pending]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort();
  while (queue.length > 0) {
    const parent = queue.shift()!;
    const parentRank = ranks.get(parent) ?? 0;
    ranks.set(parent, parentRank);
    for (const child of children.get(parent) ?? []) {
      ranks.set(child, Math.max(ranks.get(child) ?? 0, parentRank + 1));
      const left = (pending.get(child) ?? 1) - 1;
      pending.set(child, left);
      if (left === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }
  for (const id of parents.keys()) {
    if (!ranks.has(id)) {
      ranks.set(id, 0);
    }
  }

  const primary = settings.direction === "DOWN" ? ("y" as const) : ("x" as const);
  const primarySize = settings.direction === "DOWN" ? ("height" as const) : ("width" as const);
  const cross = settings.direction === "DOWN" ? ("x" as const) : ("y" as const);
  const crossSize = settings.direction === "DOWN" ? ("width" as const) : ("height" as const);
  const rankedRects = [...ranks.keys()].map((id) => positions[id]).filter((rect): rect is Rect => rect !== undefined);
  if (rankedRects.length === 0) {
    return undefined;
  }

  const unseen = new Set(ranks.keys());
  const components: string[][] = [];
  while (unseen.size > 0) {
    const first = unseen.values().next().value as string;
    const component: string[] = [];
    const visit = [first];
    unseen.delete(first);
    while (visit.length > 0) {
      const id = visit.pop()!;
      component.push(id);
      for (const neighbour of [...(parents.get(id) ?? []), ...(children.get(id) ?? [])]) {
        if (unseen.delete(neighbour)) {
          visit.push(neighbour);
        }
      }
    }
    components.push(component);
  }

  const proposed = components
    .map((ids) => {
      const originals = ids.map((id) => positions[id]!).filter((rect): rect is Rect => rect !== undefined);
      const crossLow = Math.min(...originals.map((rect) => rect[cross]));
      const crossHigh = Math.max(...originals.map((rect) => rect[cross] + rect[crossSize]));
      const crossMiddle = (crossLow + crossHigh) / 2;
      const rows = new Map<number, string[]>();
      for (const id of ids) {
        if (positions[id]) {
          const rank = ranks.get(id)!;
          rows.set(rank, [...(rows.get(rank) ?? []), id]);
        }
      }
      const rects = new Map<string, Rect>();
      let at = Math.min(...originals.map((rect) => rect[primary]));
      for (const rank of [...rows.keys()].sort((one, other) => one - other)) {
        const rowIds = rows.get(rank)!.sort((one, other) => {
          const oneRect = positions[one]!;
          const otherRect = positions[other]!;
          return (
            oneRect[cross] + oneRect[crossSize] / 2 - (otherRect[cross] + otherRect[crossSize] / 2) ||
            one.localeCompare(other)
          );
        });
        if (packageContainers) {
          // Compound packages already own disjoint cross-axis bands.
          // Retain those bands while sharing the taxonomy's rank axis;
          // repacking a row as one strip would interleave the boxes.
          for (const id of rowIds) {
            rects.set(id, { ...positions[id]!, [primary]: Math.round(at) });
          }
          at += Math.max(...rowIds.map((id) => positions[id]![primarySize])) + settings.rankSpacing;
        } else {
          const rowLength = (line: string[]) =>
            line.reduce((sum, id) => sum + positions[id]![crossSize], 0) +
            settings.nodeSpacing * Math.max(line.length - 1, 0);
          const wraps = settings.maxRankSpan > 0 && rowLength(rowIds) > settings.maxRankSpan;
          const ordered = wraps ? [...rowIds].sort((one, other) => one.localeCompare(other)) : rowIds;
          const lines: string[][] = [];
          for (const id of ordered) {
            const line = lines.at(-1);
            if (!line || (settings.maxRankSpan > 0 && rowLength([...line, id]) > settings.maxRankSpan)) {
              lines.push([id]);
            } else {
              line.push(id);
            }
          }
          for (const [lineIndex, line] of lines.entries()) {
            let along = crossMiddle - rowLength(line) / 2;
            for (const id of line) {
              const rect = positions[id]!;
              rects.set(id, {
                ...rect,
                [primary]: Math.round(at),
                [cross]: Math.round(along),
              });
              along += rect[crossSize] + settings.nodeSpacing;
            }
            at +=
              Math.max(...line.map((id) => positions[id]![primarySize])) +
              (lineIndex === lines.length - 1 ? settings.rankSpacing : settings.nodeSpacing);
          }
        }
      }
      return { ids, rects, original: boundsOf(originals) };
    })
    .sort((one, other) => one.original.y - other.original.y || one.original.x - other.original.x);

  // Re-ranking can make a hierarchy wider than the space ELK gave it. Move
  // each hierarchy as one rigid piece to the nearest clear position, leaving
  // association-only nodes where the whole-graph layout put them.
  const taxonomy = new Set(ranks.keys());
  const occupied = [...subject]
    .filter((id) => !taxonomy.has(id) && positions[id] !== undefined)
    .map((id) => positions[id]!);
  for (const component of proposed) {
    const rects = [...component.rects.values()];
    const fits = (dx: number, dy: number) =>
      rects.every((rect) => {
        const moved = { ...rect, x: rect.x + dx, y: rect.y + dy };
        return !occupied.some((obstacle) => overlaps(moved, obstacle, Math.min(settings.nodeSpacing / 3, 20)));
      });
    let translation: Point | undefined;
    for (let ring = 0; ring < 80 && !translation; ring += 1) {
      for (const offset of ring === 0 ? [{ x: 0, y: 0 }] : partialRing(ring)) {
        const candidate = { x: offset.x * PARTIAL_STEP, y: offset.y * PARTIAL_STEP };
        if (fits(candidate.x, candidate.y)) {
          translation = candidate;
          break;
        }
      }
    }
    translation ??= { x: 0, y: boundsOf(occupied).y + boundsOf(occupied).height + settings.rankSpacing };
    for (const [id, rect] of component.rects) {
      const moved = { ...rect, x: rect.x + translation.x, y: rect.y + translation.y };
      positions[id] = moved;
      occupied.push(moved);
    }
  }
  return taxonomy;
}

/**
 * Mediations to hand ELK the other way round, so a relator ranks between the
 * classes it mediates.
 *
 * A relator is a reified relationship: an employment is between an employee and
 * an employer, and that is where a reader looks for it. But a mediation is
 * written inside the relator, so the relator is the source of every one of them,
 * and a layered algorithm puts a source above all its targets -- the relator
 * ends up over the pair, with both relata below it side by side, which draws it
 * as their supertype would be drawn.
 *
 * Turning half of its mediations round for the layering puts a relatum above and
 * a relatum below, and the relator lands in the rank between them. Only the
 * layering sees this; the relation is drawn as it is written.
 */
function mediationsToTurn(view: ViewModel, grouped: boolean, only: Set<string>): Set<string> {
  const relators = new Set(
    view.nodes.filter((node) => node.stereotype === "relator" && only.has(node.id)).map((node) => node.id)
  );
  const packageOf = new Map(view.nodes.map((node) => [node.id, node.package]));
  // Kept by relatum rather than by edge: a relator that mediates one class
  // twice -- a marriage and its two spouses -- would otherwise have one of the
  // pair turned and the other not, which is a two-cycle, and the layering
  // answers a cycle by pushing its ends apart.
  const byRelator = new Map<string, Map<string, Array<{ id: string; above: boolean }>>>();
  for (const edge of view.edges) {
    if (edge.kind !== "relation" || edge.stereotype !== "mediation") {
      continue;
    }
    const relator = relators.has(edge.source) ? edge.source : relators.has(edge.target) ? edge.target : undefined;
    if (!relator || edge.source === edge.target) {
      continue;
    }
    // With the packages laid out as units, a relator can only be ranked
    // between relata that are in its own package: the others are held in a
    // box of their own, and turning the mediation only drags the relator to
    // the far side of its own package without getting it any closer.
    const relatum = edge.source === relator ? edge.target : edge.source;
    if (grouped && packageOf.get(relatum) !== packageOf.get(relator)) {
      continue;
    }
    // `above` says where the relatum would land as the edge is written.
    const relata = byRelator.get(relator) ?? new Map<string, Array<{ id: string; above: boolean }>>();
    relata.set(relatum, [...(relata.get(relatum) ?? []), { id: edge.id, above: edge.target === relator }]);
    byRelator.set(relator, relata);
  }

  const turn = new Set<string>();
  for (const relata of byRelator.values()) {
    if (relata.size < 2) {
      continue;
    }
    const entries = [...relata.entries()].sort((one, other) => one[0].localeCompare(other[0]));
    const above = entries.filter(([, mediations]) => mediations.every((one) => one.above));
    const below = entries.filter(([, mediations]) => mediations.every((one) => !one.above));
    if (above.length > 0 && below.length > 0) {
      // Already has a relatum on each side of it.
      continue;
    }
    const crowd = above.length > 0 ? above : below;
    // Half of them, and at least one: the relator wants company on both
    // sides, not to be moved from the top of the pile to the bottom of it.
    for (const [, mediations] of crowd.slice(0, Math.max(Math.floor(crowd.length / 2), 1))) {
      for (const mediation of mediations) {
        turn.add(mediation.id);
      }
    }
  }
  return turn;
}

export async function autoLayout(
  view: ViewModel,
  sizes: Record<string, Size>,
  current: Positions,
  request: AutoLayoutRequest = {}
): Promise<AutoLayoutResult> {
  // Taxonomy-only is a view of the same classifiers, not a second semantic
  // model. Removing non-taxonomy edges at the layout boundary lets ELK and
  // every semantic repair optimize the graph the user can actually see,
  // while ids and saved positions remain those of the full view.
  if (request.taxonomyOnly) {
    view = { ...view, edges: view.edges.filter((edge) => edge.kind === "generalization") };
  }
  const requestedSettings: LayoutOptions = { ...defaultLayoutOptions, ...request };
  const associationDistance = clampAssociationDistance(requestedSettings.associationDistance);
  const distanceScale = associationDistance / defaultLayoutOptions.associationDistance;
  const settings: LayoutOptions = {
    ...requestedSettings,
    associationDistance,
    nodeSpacing: Math.round(requestedSettings.nodeSpacing * distanceScale),
    rankSpacing: Math.round(requestedSettings.rankSpacing * distanceScale),
  };
  const routing = request.routing ?? "straight";
  const requested = new Set(request.only ?? view.nodes.map((node) => node.id));
  const pinned = new Set(request.constraints?.pinned.filter((id) => current[id] !== undefined) ?? []);
  const subject = new Set([...requested].filter((id) => !pinned.has(id)));
  const inverses = inversePairs(view.edges);
  const hasTaxonomy = view.edges.some(
    (edge) => edge.kind === "generalization" && subject.has(edge.source) && subject.has(edge.target)
  );
  const nodes = view.nodes.filter((node) => subject.has(node.id));
  if (nodes.length === 0) {
    return { positions: current, routes: {} };
  }

  const sizeOf = (id: string): Size => sizes[id] ?? { width: 160, height: 60 };
  // Card widths below the historical 120px baseline are a drawing
  // improvement, not a reason for ELK to choose a different discrete rank
  // order. Plan in the proven envelope, then tighten each box around its
  // measured content after semantic placement. Condensed text still recovers
  // width from every content-driven card wider than this floor.
  const layoutSizeOf = (id: string): Size => {
    const size = sizeOf(id);
    return { ...size, width: Math.max(size.width, 120) };
  };

  const populatedGroups = view.groups.filter((group) => group.nodes.some((id) => subject.has(id)));
  // A compound node earns its cost only when there is another package to
  // keep it apart from. With one package, INCLUDE_CHILDREN makes ELK lay the
  // package's disconnected components in one strip instead of packing them:
  // twelve isolated cards become a row thirty-one times wider than it is
  // high. The renderer can still draw the one package around the flat layout.
  const grouped = request.packageContainers === true && settings.groupByPackage && populatedGroups.length > 1;
  const algorithmOptions = optionsFor(settings, routing);
  /**
   * A datatype nothing is joined to is put after the model, not into it.
   *
   * Attributes are written inside the card, so a datatype or an enumeration
   * usually has no line at all -- and a node with no line is free to be
   * seated wherever a rank has room. In `parties` that was the corridor
   * between a relator and the class it mediates: `Address` landed between
   * `EmploymentContract` and `Employee`, and the mediation was drawn round
   * it, changing direction for a class it has nothing to do with. Which is
   * the picture saying something the model does not.
   *
   * Only the ones with no edge, and only datatypes and enumerations: a class
   * that happens to be undrawn today is still part of the taxonomy and keeps
   * its rank, and a datatype something does point at is drawn where it is
   * pointed at from.
   */
  const joined = new Set(view.edges.flatMap((edge) => [edge.source, edge.target]));
  const appendixIds = new Set(
    view.nodes
      .filter(
        (node) =>
          !joined.has(node.id) && (request.taxonomyOnly || node.kind === "datatype" || node.kind === "enumeration")
      )
      .map((node) => node.id)
  );
  const appendix = (id: string): Pick<ElkNode, "layoutOptions"> | Record<string, never> =>
    appendixIds.has(id) ? { layoutOptions: { "elk.layered.layering.layerConstraint": "LAST" } } : {};
  const children: ElkNode[] = grouped
    ? populatedGroups
        .map((group) => ({
          id: group.id,
          // The options are repeated on every package, not only on the
          // root: ELK lays a compound node out on its own, and it does not
          // inherit what the graph around it was told. Set only at the
          // root, a grouped diagram silently ran at ELK's 20px default --
          // ranks close enough to touch, and no room between them for the
          // labels that belong there.
          layoutOptions: {
            ...algorithmOptions,
            "elk.padding": `[top=${GROUP_PADDING + GROUP_HEADER},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
          },
          children: group.nodes
            .filter((id) => subject.has(id))
            .map((id) => ({ id, ...layoutSizeOf(id), ...appendix(id) })),
        }))
        .filter((group) => (group.children?.length ?? 0) > 0)
    : nodes.map((node) => ({ id: node.id, ...layoutSizeOf(node.id), ...appendix(node.id) }));

  const attempt = async (
    turnedMediations: Set<string>
  ): Promise<{ positions: Positions; routes: Record<string, Point[]> }> => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        ...algorithmOptions,
        // Only where there is a hierarchy to handle. Asked for it on a flat
        // graph, ELK stops packing the pieces that are not joined to each
        // other and lays them out in one row instead: thirty unconnected
        // classes went from a block 804 by 644 to a strip 7164 by 84, and
        // `boats` ignoring its packages from 4503 by 952 to 2697 by 1785.
        ...(grouped ? { "elk.hierarchyHandling": "INCLUDE_CHILDREN" } : {}),
        // Every route comes back in one coordinate system. Without this ELK
        // reports an edge relative to whichever node it decides owns it,
        // which for an edge between two packages is neither of its ends --
        // and a route drawn from those numbers lands in the corner of the
        // diagram, some hundreds of pixels from the classes it joins.
        "elk.json.edgeCoords": "ROOT",
      },
      children,
      edges: view.edges
        .filter((edge) => !inverses.covered.has(edge.id) && subject.has(edge.source) && subject.has(edge.target))
        .map((edge): ElkEdge => {
          if (edge.kind === "generalization") {
            return {
              id: edge.id,
              sources: [edge.target],
              targets: [edge.source],
              layoutOptions: {
                "elk.layered.priority.direction": "10",
                "elk.layered.priority.straightness": "10",
              },
            };
          }
          const turned = turnedMediations.has(edge.id);
          return {
            id: edge.id,
            sources: [turned ? edge.target : edge.source],
            targets: [turned ? edge.source : edge.target],
            layoutOptions:
              edge.kind === "relation" && edge.stereotype === "mediation"
                ? // A mediation should come out straight where it can: it
                  // is the line that says what the relator is between.
                  { "elk.layered.priority.direction": "4", "elk.layered.priority.straightness": "8" }
                : { "elk.layered.priority.direction": "0" },
          };
        }),
    };

    const laid = await new Elk().layout(graph);
    const positions: Positions = { ...current };
    // A laid-out node's coordinates are relative to its parent, so a package's
    // own position has to be carried into its children.
    const walk = (node: ElkNode, offsetX: number, offsetY: number) => {
      for (const child of node.children ?? []) {
        const x = offsetX + (child.x ?? 0);
        const y = offsetY + (child.y ?? 0);
        if (child.children?.length) {
          walk(child, x, y);
        } else if (subject.has(child.id)) {
          positions[child.id] = {
            x: Math.round(x),
            y: Math.round(y),
            width: child.width ?? sizeOf(child.id).width,
            height: child.height ?? sizeOf(child.id).height,
          } satisfies Rect;
        }
      }
    };
    walk(laid, 0, 0);
    const elkPositions = Object.fromEntries(
      [...subject].filter((id) => positions[id] !== undefined).map((id) => [id, { ...positions[id]! }])
    );
    let ranked: Set<string> | undefined;
    if (!request.only) {
      ranked = enforceTaxonomyRanks(view, positions, subject, settings, grouped);
    }
    guardedSemanticCandidate(view, positions, settings, () => {
      settleRelators(view, positions, subject, ranked ? settings.direction : undefined, ranked);
      if (ranked) {
        settleOrphans(view, positions, subject, ranked);
      }
      if (!grouped) {
        orientInstantiationTypes(view, positions, subject, settings);
      }
      orientCharacterizedAspects(view, positions, subject, ranked ?? new Set(), settings);
      const wholeFans = orientWholeFans(view, positions, subject, ranked, settings);
      orientWholes(view, positions, subject, ranked, settings.direction, wholeFans);
      if (!request.only && ranked) {
        optimizeRankCrossAxis(view, positions, subject, ranked, appendixIds, settings, !grouped, wholeFans);
      }
    });
    const packed = !request.only && !grouped ? packComponents(view, positions, subject, appendixIds, settings) : false;
    if (!request.only) {
      const seated = seatAppendixInWhitespace(
        view,
        positions,
        appendixIds,
        subject,
        settings,
        routing,
        request.packageContainers === true
      );
      if (!grouped) {
        placeAppendixAfter(positions, new Set([...appendixIds].filter((id) => !seated.has(id))), subject, settings);
      }
    }
    // Compaction is allowed to shorten ordinary links, but it must not silently
    // undo the reading order of an instantiation. Apply that soft preference to
    // the final compact geometry, with one safety decision per type family.
    if (!grouped) {
      orientInstantiationTypes(view, positions, subject, settings, true);
    }
    if (request.only || pinned.size > 0) {
      placePartialLayout(view, positions, current, subject);
    }
    if (request.constraints) {
      applyLayoutConstraints(positions, request.constraints, {
        movable: subject,
        ...(ranked ? { ranked } : {}),
        direction: settings.direction,
      });
    }

    // Short labels do not need a wide card, but every attached line needs a
    // distinguishable piece of border. Count visible associations and collapse
    // a generalization set to the one shared head it actually draws.
    const attachmentsByNode = new Map<string, Set<string>>();
    for (const edge of view.edges) {
      if (inverses.covered.has(edge.id)) {
        continue;
      }
      const key = edge.kind === "generalization" ? (edge.genset ?? edge.id) : edge.id;
      for (const id of new Set([edge.source, edge.target])) {
        const attachments = attachmentsByNode.get(id) ?? new Set<string>();
        attachments.add(key);
        attachmentsByNode.set(id, attachments);
      }
    }
    const tightened = new Set<string>();
    for (const id of subject) {
      const rect = positions[id];
      const measured = sizeOf(id);
      const attachments = attachmentsByNode.get(id)?.size ?? 0;
      const anchorWidth = measured.width < 108 ? Math.min(120, 72 + attachments * 12) : 0;
      const width = Math.max(measured.width, anchorWidth);
      if (!rect || rect.width <= width) {
        continue;
      }
      positions[id] = {
        ...rect,
        x: Math.round(rect.x + (rect.width - width) / 2),
        width,
      };
      tightened.add(id);
    }

    const routes: Record<string, Point[]> = {};
    if (routing === "orthogonal") {
      const edgeById = new Map(view.edges.map((edge) => [edge.id, edge]));
      const obstacles = Object.values(positions);
      const collectEdges = (node: ElkNode) => {
        for (const edge of node.edges ?? []) {
          const section = edge.sections?.[0];
          if (!section) {
            continue;
          }
          const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point) => ({
            x: Math.round(point.x),
            y: Math.round(point.y),
          }));
          const definition = edgeById.get(edge.id);
          if (!definition) {
            continue;
          }
          // Generalization ports belong at the centre ray of their
          // classes. Keeping ELK's route would retain the displaced port
          // it chose when an association joins the same pair.
          if (definition.kind === "generalization") {
            const source = positions[definition.source];
            const target = positions[definition.target];
            if (source && target) {
              routes[edge.id] = routeEdge(source, target, {
                style: "orthogonal",
                obstacles,
                ends: {
                  source: borderPoint(source, centerOf(target)),
                  target: borderPoint(target, centerOf(source)),
                },
              });
            }
            continue;
          }
          // Selected mediations may be handed to ELK backwards for
          // ranking. Stored routes always follow the view model's
          // source -> target direction.
          const reversed = turnedMediations.has(edge.id);
          const ordered = reversed ? points.reverse() : points;
          const oldSource = elkPositions[definition.source];
          const oldTarget = elkPositions[definition.target];
          const source = positions[definition.source];
          const target = positions[definition.target];
          if (!oldSource || !oldTarget || !source || !target) {
            continue;
          }
          const sourceShift = { x: source.x - oldSource.x, y: source.y - oldSource.y };
          const targetShift = { x: target.x - oldTarget.x, y: target.y - oldTarget.y };
          routes[edge.id] =
            !packed &&
            !tightened.has(definition.source) &&
            !tightened.has(definition.target) &&
            sourceShift.x === targetShift.x &&
            sourceShift.y === targetShift.y
              ? ordered.map((point) => ({
                  x: Math.round(point.x + sourceShift.x),
                  y: Math.round(point.y + sourceShift.y),
                }))
              : // A post-layout adjustment moved one end independently. The
                // old bends no longer belong to the final boxes, so route
                // again from the final geometry rather than saving a
                // detached polyline.
                routeEdge(source, target, { style: "orthogonal", obstacles });
        }
        for (const child of node.children ?? []) {
          collectEdges(child);
        }
      };
      collectEdges(laid);
    }

    return { positions, routes };
  };

  // Turning a relator's mediations round is not free: it changes the ranking
  // for everything, and on one model it lengthened enough lines to cost a
  // dozen labels their place. So the plain layout comes first, and only the
  // relators it strands are worth turning -- and the turn is kept only if it
  // seats more of them.
  const plain = await attempt(new Set());
  if (hasTaxonomy && !request.only) {
    return plain;
  }
  const stranded = strandedRelators(view, plain.positions, subject);
  if (stranded.size === 0) {
    return plain;
  }
  const turnedMediations = mediationsToTurn(view, grouped, stranded);
  if (turnedMediations.size === 0) {
    return plain;
  }
  const turned = await attempt(turnedMediations);
  return strandedRelators(view, turned.positions, subject).size < stranded.size ? turned : plain;
}

/** The relators that did not land between the classes they mediate. */
function strandedRelators(view: ViewModel, positions: Positions, only: ReadonlySet<string>): Set<string> {
  const centre = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  const stranded = new Set<string>();
  for (const relator of view.nodes.filter((node) => node.stereotype === "relator" && only.has(node.id))) {
    const rect = positions[relator.id];
    const relata = [
      ...new Set(
        view.edges
          .filter(
            (edge) =>
              edge.kind === "relation" &&
              edge.stereotype === "mediation" &&
              (edge.source === relator.id || edge.target === relator.id)
          )
          .map((edge) => (edge.source === relator.id ? edge.target : edge.source))
          .filter((id) => id !== relator.id)
      ),
    ]
      .map((id) => positions[id])
      .filter((one): one is Rect => one !== undefined);
    if (!rect || relata.length < 2) {
      continue;
    }
    const points = relata.map(centre);
    const at = centre(rect);
    const inside =
      at.x >= Math.min(...points.map((one) => one.x)) - 24 &&
      at.x <= Math.max(...points.map((one) => one.x)) + 24 &&
      at.y >= Math.min(...points.map((one) => one.y)) - 24 &&
      at.y <= Math.max(...points.map((one) => one.y)) + 24;
    if (!inside) {
      stranded.add(relator.id);
    }
  }
  return stranded;
}
