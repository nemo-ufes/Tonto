// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * Where an edge runs.
 *
 * Straight by default. A UML class diagram is read as a set of things joined by
 * lines, not as a circuit board: a direct line says "these two" at a glance,
 * where a right-angled one has to be followed around two corners, and on a
 * model with many associations the corridors start to look like the diagram.
 * Orthogonal remains, for the taxonomies it does suit -- several subtypes under
 * one supertype line up better with square corners -- but it is a choice now
 * rather than the only thing on offer.
 *
 * Associations between the same pair fan apart with a real bend. Merely moving
 * two straight lines sideways leaves them parallel and easy to confuse in the
 * middle, where their labels live.
 *
 * A route the modeller drew is obeyed exactly. That is the whole reason routes
 * are computed here rather than asked of a layout engine: an engine re-routes
 * everything when anything changes, and a corrected route would not survive the
 * next keystroke.
 */

import type { Point, Rect } from "./geometry.js";
import { borderPoint, centerOf, distanceToSegment, segmentHitsRect, sideOf } from "./geometry.js";

export type RoutingStyle = "straight" | "curved" | "orthogonal";

export interface RouteRequest {
  /** A route already decided -- by ELK, or by the modeller -- used as it stands. */
  stored?: Point[];
  /**
   * Where this line meets each box, when the ends arriving at a box have been
   * spread along its border. Without them every line aims at the far centre,
   * and lines between neighbouring boxes arrive at the same spot.
   */
  ends?: { source: Point; target: Point };
  /** Which of the loops on this class this is, when a class relates to itself. */
  loop?: { index: number; count: number };
  /**
   * Bends other lines have already taken. Two lines going round the same box
   * pick the same corner unless told otherwise, and then they run together
   * between it and their ends -- which is the superimposition the ports were
   * meant to prevent, moved to the middle of the diagram.
   */
  avoid?: Point[];
  style?: RoutingStyle;
  /** Which repeated edge this is; reach is used while testing safer fans. */
  spread?: { index: number; count: number; reach?: number };
  /**
   * Boxes the line should not cross -- every other element in the drawing.
   * A straight line between two distant classes will otherwise pass through
   * whatever stands between them, and a reader following it arrives at the
   * wrong class.
   */
  obstacles?: Rect[];
}

/** How much farther a repeated association opens away from its shared axis. */
const SPREAD = 16;

/** How wide a berth a detour gives the box it is going round. */
const CLEARANCE = 22;

/** How far a right-angled line steps out of a border before it turns. */
const STUB = 18;

/** How much of two boxes has to line up before they are joined straight across. */
const FACING = 24;
const LOOP = 28;

export interface DrawnRoute {
  /** Sampled geometry used by labels, hit-testing and quality checks. */
  points: Point[];
  /** SVG commands for the same geometry. */
  data: string;
}

interface Cubic {
  from: Point;
  one: Point;
  two: Point;
  to: Point;
}

/** A polyline in SVG path syntax. */
export function pathData(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${coordinate(point.x)} ${coordinate(point.y)}`)
    .join(" ");
}

/**
 * Smooths a necessary detour without giving up its directness or safety.
 *
 * A direct, two-point guide is already the clearest path and remains a line.
 * When the straight router had to add bends, the guide remains editable and
 * persisted while cubics round that detour. Progressively smaller handles
 * retreat towards the guide whenever a curve would cut through a card. The
 * sampled result is the same curve the rest of the canvas measures; the SVG is
 * not allowed to know a prettier geometry than selection, labels and scoring.
 */
export function curvedRoute(guide: Point[], source: Rect, target: Rect, obstacles: readonly Rect[] = []): DrawnRoute {
  if (guide.length <= 2) {
    return { points: guide, data: pathData(guide) };
  }
  const others = obstacles.filter((rect) => rect !== source && rect !== target);
  const guideLength = euclideanPathLength(guide);
  const first = unit({ x: guide[1]!.x - guide[0]!.x, y: guide[1]!.y - guide[0]!.y });
  const last = unit({
    x: guide[guide.length - 1]!.x - guide[guide.length - 2]!.x,
    y: guide[guide.length - 1]!.y - guide[guide.length - 2]!.y,
  });
  const cubics = fitRouteSpline(guide, first, last, others, 0);
  if (cubics) {
    const points = flattenCubics(cubics);
    // A curve is for tracing a direct relationship, not ornament. Long
    // handles may look fluid while quietly adding a large visual journey.
    if (euclideanPathLength(points) <= guideLength * 1.15 + 4) {
      return { points, data: cubicPathData(cubics) };
    }
  }
  return roundedRoute(guide, source, target, obstacles);
}

/**
 * Rounds each necessary guide corner locally when a whole-route spline would
 * stray outside its safe corridor. The progressively smaller radii matter for
 * a bend close to another card: keeping a small curve is still more truthful
 * to curved mode than silently restoring the sharp polyline.
 */
export function roundedRoute(guide: Point[], source: Rect, target: Rect, obstacles: readonly Rect[] = []): DrawnRoute {
  if (guide.length <= 2 || !hasVisibleBend(guide)) {
    return { points: guide, data: pathData(guide) };
  }
  const others = obstacles.filter((rect) => rect !== source && rect !== target);
  for (const radius of [18, 12, 8, 4, 2]) {
    const rounded = roundGuideCorners(guide, radius);
    if (rounded && pathIsClear(rounded.points, others)) {
      return rounded;
    }
  }
  return { points: guide, data: pathData(guide) };
}

function roundGuideCorners(guide: Point[], radius: number): DrawnRoute | undefined {
  const points: Point[] = [{ ...guide[0]! }];
  let data = `M ${coordinate(guide[0]!.x)} ${coordinate(guide[0]!.y)}`;
  let rounded = false;
  for (let index = 1; index < guide.length - 1; index += 1) {
    const before = guide[index - 1]!;
    const corner = guide[index]!;
    const after = guide[index + 1]!;
    const incoming = { x: before.x - corner.x, y: before.y - corner.y };
    const outgoing = { x: after.x - corner.x, y: after.y - corner.y };
    const incomingLength = Math.hypot(incoming.x, incoming.y);
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    if (incomingLength < 1 || outgoingLength < 1 || Math.abs(cross) <= incomingLength * outgoingLength * 0.005) {
      data += ` L ${coordinate(corner.x)} ${coordinate(corner.y)}`;
      points.push({ ...corner });
      continue;
    }
    // At most a third of either segment leaves room when two neighboring
    // corners share a short segment.
    const trim = Math.min(radius, incomingLength / 3, outgoingLength / 3);
    const entry = {
      x: corner.x + (incoming.x * trim) / incomingLength,
      y: corner.y + (incoming.y * trim) / incomingLength,
    };
    const exit = {
      x: corner.x + (outgoing.x * trim) / outgoingLength,
      y: corner.y + (outgoing.y * trim) / outgoingLength,
    };
    const cubic: Cubic = {
      from: entry,
      one: {
        x: entry.x + ((corner.x - entry.x) * 2) / 3,
        y: entry.y + ((corner.y - entry.y) * 2) / 3,
      },
      two: {
        x: exit.x + ((corner.x - exit.x) * 2) / 3,
        y: exit.y + ((corner.y - exit.y) * 2) / 3,
      },
      to: exit,
    };
    data +=
      ` L ${coordinate(entry.x)} ${coordinate(entry.y)} C ` +
      `${coordinate(cubic.one.x)} ${coordinate(cubic.one.y)} ` +
      `${coordinate(cubic.two.x)} ${coordinate(cubic.two.y)} ` +
      `${coordinate(exit.x)} ${coordinate(exit.y)}`;
    points.push(entry);
    flattenCubic(cubic, points, 0);
    rounded = true;
  }
  const last = guide[guide.length - 1]!;
  data += ` L ${coordinate(last.x)} ${coordinate(last.y)}`;
  points.push({ ...last });
  return rounded ? { points, data } : undefined;
}

/**
 * Graphviz's route fitter: fit one cubic to the whole guide and split only
 * when that cubic cannot remain in the safe corridor around the polyline.
 * Unlike interpolation, an ordinary guide bend is not a point the curve must
 * pass through, which is the direct, relaxed shape PlantUML inherits from dot.
 */
function fitRouteSpline(
  guide: Point[],
  startSlope: Point,
  endSlope: Point,
  obstacles: readonly Rect[],
  depth: number
): Cubic[] | undefined {
  const fit = fittedCubic(guide, startSlope, endSlope);
  for (const multiplier of [4, 2, 1, 0.5, 0.25, 0.125]) {
    const cubic = scaledCubic(fit, multiplier);
    if (cubicFits(cubic, guide, obstacles)) {
      return [cubic];
    }
  }
  if (guide.length <= 2 || depth >= 8) {
    return undefined;
  }
  const reference = scaledCubic(fit, 1);
  const parameters = chordParameters(guide);
  let split = 1;
  let error = -1;
  for (let index = 1; index < guide.length - 1; index += 1) {
    const at = cubicAt(reference, parameters[index]!);
    const distance = Math.hypot(at.x - guide[index]!.x, at.y - guide[index]!.y);
    if (distance > error) {
      error = distance;
      split = index;
    }
  }
  const before = unit({
    x: guide[split]!.x - guide[split - 1]!.x,
    y: guide[split]!.y - guide[split - 1]!.y,
  });
  const after = unit({
    x: guide[split + 1]!.x - guide[split]!.x,
    y: guide[split + 1]!.y - guide[split]!.y,
  });
  const splitSlope = unit({ x: before.x + after.x, y: before.y + after.y });
  const left = fitRouteSpline(guide.slice(0, split + 1), startSlope, splitSlope, obstacles, depth + 1);
  const right = fitRouteSpline(guide.slice(split), splitSlope, endSlope, obstacles, depth + 1);
  return left && right ? [...left, ...right] : undefined;
}

interface CubicFit {
  from: Point;
  to: Point;
  startSlope: Point;
  endSlope: Point;
  startScale: number;
  endScale: number;
}

/** Chord-length least-squares handle lengths used by Graphviz's fitter. */
function fittedCubic(guide: Point[], startSlope: Point, endSlope: Point): CubicFit {
  const parameters = chordParameters(guide);
  const from = guide[0]!;
  const to = guide[guide.length - 1]!;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let index = 0; index < guide.length; index += 1) {
    const t = parameters[index]!;
    const one = 3 * t * (1 - t) * (1 - t);
    const two = 3 * t * t * (1 - t);
    const a0 = { x: startSlope.x * one, y: startSlope.y * one };
    const a1 = { x: endSlope.x * two, y: endSlope.y * two };
    c00 += dot(a0, a0);
    c01 += dot(a0, a1);
    c11 += dot(a1, a1);
    const baseFrom = (1 - t) ** 3 + one;
    const baseTo = two + t ** 3;
    const residual = {
      x: guide[index]!.x - from.x * baseFrom - to.x * baseTo,
      y: guide[index]!.y - from.y * baseFrom - to.y * baseTo,
    };
    x0 += dot(a0, residual);
    x1 += dot(a1, residual);
  }
  const determinant = c00 * c11 - c01 * c01;
  let startScale = determinant === 0 ? 0 : (x0 * c11 - x1 * c01) / determinant;
  let endScale = determinant === 0 ? 0 : (c00 * x1 - c01 * x0) / determinant;
  if (Math.abs(determinant) < 1e-6 || startScale <= 0 || endScale <= 0) {
    startScale = endScale = Math.hypot(to.x - from.x, to.y - from.y) / 3;
  }
  return { from, to, startSlope, endSlope, startScale, endScale };
}

function scaledCubic(fit: CubicFit, multiplier: number): Cubic {
  return {
    from: fit.from,
    one: {
      x: fit.from.x + (fit.startSlope.x * fit.startScale * multiplier) / 3,
      y: fit.from.y + (fit.startSlope.y * fit.startScale * multiplier) / 3,
    },
    two: {
      x: fit.to.x - (fit.endSlope.x * fit.endScale * multiplier) / 3,
      y: fit.to.y - (fit.endSlope.y * fit.endScale * multiplier) / 3,
    },
    to: fit.to,
  };
}

function cubicFits(cubic: Cubic, guide: Point[], obstacles: readonly Rect[]): boolean {
  const samples: Point[] = [{ ...cubic.from }];
  flattenCubic(cubic, samples, 0);
  const clear = samples
    .slice(1)
    .every((point, index) => obstacles.every((rect) => !segmentHitsRect(samples[index]!, point, rect, 4)));
  const corridor = samples.every((point) =>
    guide.slice(1).some((to, index) => distanceToSegment(point, guide[index]!, to) <= 20)
  );
  const followsBends = guide
    .slice(1, -1)
    .every((point) => samples.slice(1).some((to, index) => distanceToSegment(point, samples[index]!, to) <= 20));
  return clear && corridor && followsBends;
}

function chordParameters(guide: Point[]): number[] {
  const parameters = [0];
  for (let index = 1; index < guide.length; index += 1) {
    parameters.push(
      parameters[index - 1]! + Math.hypot(guide[index]!.x - guide[index - 1]!.x, guide[index]!.y - guide[index - 1]!.y)
    );
  }
  const total = parameters[parameters.length - 1] || 1;
  return parameters.map((value) => value / total);
}

function cubicAt(cubic: Cubic, t: number): Point {
  const one = 1 - t;
  return {
    x: one ** 3 * cubic.from.x + 3 * one * one * t * cubic.one.x + 3 * one * t * t * cubic.two.x + t ** 3 * cubic.to.x,
    y: one ** 3 * cubic.from.y + 3 * one * one * t * cubic.one.y + 3 * one * t * t * cubic.two.y + t ** 3 * cubic.to.y,
  };
}

function dot(one: Point, other: Point): number {
  return one.x * other.x + one.y * other.y;
}

function unit(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function flattenCubics(cubics: Cubic[]): Point[] {
  const points = cubics.length > 0 ? [{ ...cubics[0]!.from }] : [];
  for (const cubic of cubics) {
    flattenCubic(cubic, points, 0);
  }
  return points;
}

function flattenCubic(cubic: Cubic, points: Point[], depth: number): void {
  const flatness = Math.max(
    distanceToSegment(cubic.one, cubic.from, cubic.to),
    distanceToSegment(cubic.two, cubic.from, cubic.to)
  );
  if (flatness <= 0.75 || depth >= 10) {
    points.push({ ...cubic.to });
    return;
  }
  const fromOne = middle(cubic.from, cubic.one);
  const oneTwo = middle(cubic.one, cubic.two);
  const twoTo = middle(cubic.two, cubic.to);
  const leftMiddle = middle(fromOne, oneTwo);
  const rightMiddle = middle(oneTwo, twoTo);
  const at = middle(leftMiddle, rightMiddle);
  flattenCubic({ from: cubic.from, one: fromOne, two: leftMiddle, to: at }, points, depth + 1);
  flattenCubic({ from: at, one: rightMiddle, two: twoTo, to: cubic.to }, points, depth + 1);
}

function middle(one: Point, other: Point): Point {
  return { x: (one.x + other.x) / 2, y: (one.y + other.y) / 2 };
}

function cubicPathData(cubics: Cubic[]): string {
  if (cubics.length === 0) {
    return "";
  }
  return (
    `M ${coordinate(cubics[0]!.from.x)} ${coordinate(cubics[0]!.from.y)} ` +
    cubics
      .map(
        (cubic) =>
          `C ${coordinate(cubic.one.x)} ${coordinate(cubic.one.y)} ` +
          `${coordinate(cubic.two.x)} ${coordinate(cubic.two.y)} ` +
          `${coordinate(cubic.to.x)} ${coordinate(cubic.to.y)}`
      )
      .join(" ")
  );
}

function euclideanPathLength(points: Point[]): number {
  return points
    .slice(1)
    .reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);
}

function coordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

export function routeEdge(source: Rect, target: Rect, request: RouteRequest = {}): Point[] {
  if (request.stored && request.stored.length >= 2) {
    return request.stored;
  }
  if (source === target) {
    return selfLoop(source, request.loop?.index ?? 0, request.ends, request.obstacles);
  }
  const offset = spreadOf(request.spread);
  let route: Point[];
  if (request.ends) {
    route =
      request.style === "orthogonal"
        ? orthogonalBetween(source, target, request.ends, request.obstacles)
        : straightBetween(request.ends, source, target, request.obstacles, request.avoid);
  } else {
    route =
      request.style === "orthogonal"
        ? orthogonalAround(orthogonal(source, target, offset), source, target, request.obstacles)
        : straight(source, target, offset, request.obstacles, request.avoid);
  }
  return request.spread?.count && request.spread.count > 1 && !hasVisibleBend(route)
    ? fanRepeated(route, source, target, request.spread, request.style, request.obstacles)
    : route;
}

/** The perpendicular distance this edge runs from the line its group shares. */
function spreadOf(spread: { index: number; count: number; reach?: number } | undefined): number {
  if (!spread || spread.count < 2) {
    return 0;
  }
  return (spread.index - (spread.count - 1) / 2) * SPREAD;
}

/** Whether a guide changes direction, ignoring redundant collinear points. */
function hasVisibleBend(points: Point[]): boolean {
  return points.slice(2).some((point, index) => {
    const one = points[index]!;
    const two = points[index + 1]!;
    return Math.abs((two.x - one.x) * (point.y - two.y) - (two.y - one.y) * (point.x - two.x)) > 0.5;
  });
}

/**
 * Opens repeated associations into a fan instead of drawing parallel rails.
 *
 * Port assignment has already put each line on its side of the shared axis.
 * Extending that displacement at the middle preserves their order at both
 * cards and creates the separation where labels have to distinguish the lines.
 */
function fanRepeated(
  points: Point[],
  source: Rect,
  target: Rect,
  spread: { index: number; count: number; reach?: number },
  style: RoutingStyle | undefined,
  obstacles?: Rect[]
): Point[] {
  const start = points[0]!;
  const end = points[points.length - 1]!;
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const order = Math.sign(spread.index - (spread.count - 1) / 2);
  if (order === 0) {
    return points;
  }
  // Ports with the same desired point are not necessarily symmetric around
  // the card centre: the separator may leave the first at centre and push
  // the second along the side. Their stable order, rather than their distance
  // from centre, is what guarantees that the pair opens in opposite ways.
  const sourceSide = sideOf(source, start);
  const alongSide = sourceSide === "top" || sourceSide === "bottom" ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const away = { x: alongSide.x * order, y: alongSide.y * order };
  const others = obstacles?.filter((rect) => rect !== source && rect !== target) ?? [];
  const reaches = spread.reach === undefined ? [SPREAD, 12, 8, 4] : [spread.reach];
  for (const reach of reaches) {
    const candidate =
      style === "orthogonal"
        ? orthogonalFan(start, end, away, reach)
        : [start, round({ x: middle.x + away.x * reach, y: middle.y + away.y * reach }), end];
    if (pathIsClear(candidate, others)) {
      return candidate;
    }
  }
  return points;
}

/** A short square-sided corridor for a repeated, otherwise collinear route. */
function orthogonalFan(start: Point, end: Point, away: Point, reach: number): Point[] {
  const vertical = Math.abs(end.y - start.y) >= Math.abs(end.x - start.x);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const inset = Math.min(STUB, length / 4);
  const along = unit({ x: end.x - start.x, y: end.y - start.y });
  const from = { x: start.x + along.x * inset, y: start.y + along.y * inset };
  const to = { x: end.x - along.x * inset, y: end.y - along.y * inset };
  const sign = vertical ? Math.sign(away.x) || 1 : Math.sign(away.y) || 1;
  const shift = vertical ? { x: sign * reach, y: 0 } : { x: 0, y: sign * reach };
  return compact([
    start,
    from,
    { x: from.x + shift.x, y: from.y + shift.y },
    { x: to.x + shift.x, y: to.y + shift.y },
    to,
    end,
  ]);
}

/**
 * Border to border, on the line between the two centres.
 *
 * A spread edge starts as the same line moved sideways. The endpoints are the
 * unspread border points pushed along the perpendicular, rather than the
 * intersections of the moved line with the boxes -- a difference of a pixel or
 * two at these offsets; `fanRepeated` then opens repeated associations farther
 * at the middle so the lines do not remain parallel.
 */
/** Port to port, with the same detour round anything in the way. */
function straightBetween(
  ends: { source: Point; target: Point },
  source: Rect,
  target: Rect,
  obstacles?: Rect[],
  avoid?: Point[]
): Point[] {
  const start = round(ends.source);
  const end = round(ends.target);
  const blocked = obstacles?.filter(
    (rect) => rect !== source && rect !== target && segmentHitsRect(start, end, rect, 4)
  );
  if (!blocked || blocked.length === 0) {
    return [start, end];
  }
  // The ports are kept: a detour that re-aimed at the box centres put every
  // blocked line back on the same two border points, which is how two
  // relations between one pair of classes came to be drawn as one line.
  return detour(source, target, start, end, blocked, obstacles ?? [], true, avoid);
}

/**
 * Out of each port at right angles, then one turn -- or two, when both ends
 * leave the same way and the line has to cross between them.
 */
function orthogonalBetween(
  source: Rect,
  target: Rect,
  ends: { source: Point; target: Point },
  obstacles?: Rect[]
): Point[] {
  const from = stub(source, ends.source);
  const to = stub(target, ends.target);
  const points = [round(ends.source), round(from.at)];
  if (from.vertical === to.vertical) {
    const middle = from.vertical
      ? { first: { x: from.at.x, y: (from.at.y + to.at.y) / 2 }, second: { x: to.at.x, y: (from.at.y + to.at.y) / 2 } }
      : { first: { x: (from.at.x + to.at.x) / 2, y: from.at.y }, second: { x: (from.at.x + to.at.x) / 2, y: to.at.y } };
    points.push(round(middle.first), round(middle.second));
  } else {
    points.push(round(from.vertical ? { x: from.at.x, y: to.at.y } : { x: to.at.x, y: from.at.y }));
  }
  points.push(round(to.at), round(ends.target));
  return orthogonalAround(compact(points), source, target, obstacles);
}

/**
 * Moves a square route into a clear horizontal or vertical corridor.
 *
 * The direct Manhattan path is usually best, but a card between its ends turns
 * it into a line that appears to terminate at the wrong class. Trying the clear
 * sides of every obstacle is enough to find the outside corridor even when
 * several cards form one block, while keeping every segment axis-aligned.
 */
function orthogonalAround(points: Point[], source: Rect, target: Rect, obstacles?: Rect[]): Point[] {
  const others = obstacles?.filter((rect) => rect !== source && rect !== target) ?? [];
  if (others.length === 0 || pathIsClear(points, others)) {
    return points;
  }

  const start = points[0]!;
  const end = points[points.length - 1]!;
  const from = points.length > 2 ? points[1]! : start;
  const to = points.length > 2 ? points[points.length - 2]! : end;
  const candidates: Point[][] = [
    [start, from, { x: from.x, y: to.y }, to, end],
    [start, from, { x: to.x, y: from.y }, to, end],
  ];
  for (const rect of others) {
    for (const y of [rect.y - CLEARANCE, rect.y + rect.height + CLEARANCE]) {
      candidates.push([start, from, { x: from.x, y }, { x: to.x, y }, to, end]);
    }
    for (const x of [rect.x - CLEARANCE, rect.x + rect.width + CLEARANCE]) {
      candidates.push([start, from, { x, y: from.y }, { x, y: to.y }, to, end]);
    }
  }

  const clear = candidates
    .map(compact)
    .filter((candidate) => pathIsClear(candidate, others))
    .sort((one, other) => pathLength(one) - pathLength(other) || one.length - other.length);
  return clear[0] ?? points;
}

function pathIsClear(points: Point[], obstacles: Rect[]): boolean {
  return points
    .slice(1)
    .every((point, index) => obstacles.every((rect) => !segmentHitsRect(points[index]!, point, rect, 4)));
}

function pathLength(points: Point[]): number {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index]!;
    return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
  }, 0);
}

function compact(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points.map(round)) {
    const previous = result[result.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      result.push(point);
    }
  }
  return result;
}

/** A short step straight out of the border, so the line leaves the box squarely. */
function stub(rect: Rect, at: Point): { at: Point; vertical: boolean } {
  const side = sideOf(rect, at);
  switch (side) {
    case "top":
      return { at: { x: at.x, y: at.y - STUB }, vertical: true };
    case "bottom":
      return { at: { x: at.x, y: at.y + STUB }, vertical: true };
    case "left":
      return { at: { x: at.x - STUB, y: at.y }, vertical: false };
    case "right":
    default:
      return { at: { x: at.x + STUB, y: at.y }, vertical: false };
  }
}

function straight(source: Rect, target: Rect, offset: number, obstacles?: Rect[], request_avoid?: Point[]): Point[] {
  const from = centerOf(source);
  const to = centerOf(target);
  let start = borderPoint(source, to);
  let end = borderPoint(target, from);
  if (offset !== 0) {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const shift = { x: -((to.y - from.y) / length) * offset, y: ((to.x - from.x) / length) * offset };
    start = { x: start.x + shift.x, y: start.y + shift.y };
    end = { x: end.x + shift.x, y: end.y + shift.y };
  }

  const blocked = obstacles?.filter(
    (rect) => rect !== source && rect !== target && segmentHitsRect(start, end, rect, 4)
  );
  if (!blocked || blocked.length === 0) {
    return [round(start), round(end)];
  }
  return detour(source, target, start, end, blocked, obstacles ?? [], false, request_avoid);
}

/**
 * One bend, round the box that is in the way.
 *
 * Straight lines are what a class diagram is read by, and a straight line
 * through an unrelated class is worse than no line: the reader follows it into
 * the wrong box. So an edge that is blocked is offered a corner past each side
 * of every box blocking it, and takes the shortest path that is clear of
 * everything. If nothing is clear -- a corridor with no way through -- it stays
 * straight, because a two-bend detour that still crosses something has bought
 * nothing and costs the reader a corner.
 */
function detour(
  source: Rect,
  target: Rect,
  start: Point,
  end: Point,
  blocked: Rect[],
  obstacles: Rect[],
  keepEnds: boolean,
  avoid: Point[] = []
): Point[] {
  const candidates = cornersOf(blocked);
  const others = obstacles.filter((rect) => rect !== source && rect !== target);
  // The straight line is in the running: a detour is worth a corner only if it
  // crosses fewer boxes than going straight through did.
  let best = {
    points: [round(start), round(end)],
    hits: others.filter((rect) => segmentHitsRect(start, end, rect, 4)).length,
    length: Math.hypot(end.x - start.x, end.y - start.y),
    bends: 0,
  };
  for (const via of candidates) {
    const first = keepEnds ? start : borderPoint(source, via);
    const last = keepEnds ? end : borderPoint(target, via);
    const hits =
      others.filter((rect) => segmentHitsRect(first, via, rect, 4) || segmentHitsRect(via, last, rect, 4)).length +
      (avoid.some((point) => Math.hypot(point.x - via.x, point.y - via.y) < CLEARANCE) ? 1 : 0);
    const length = Math.hypot(via.x - first.x, via.y - first.y) + Math.hypot(last.x - via.x, last.y - via.y);
    if (hits < best.hits || (hits === best.hits && best.bends > 0 && length < best.length)) {
      best = { points: [round(first), round(via), round(last)], hits, length, bends: 1 };
    }
  }
  if (best.hits === 0) {
    return best.points;
  }

  // One bend was not enough. Two are worth trying before giving up and
  // crossing something: a line that disappears behind a class it has nothing
  // to do with is read as ending there. The corners of whatever blocked the
  // one-bend attempts join the search, since those are the boxes to get round.
  const alsoBlocking = new Set<Rect>();
  for (const via of candidates) {
    const first = keepEnds ? start : borderPoint(source, via);
    const last = keepEnds ? end : borderPoint(target, via);
    for (const rect of others) {
      if (segmentHitsRect(first, via, rect, 4) || segmentHitsRect(via, last, rect, 4)) {
        alsoBlocking.add(rect);
      }
    }
  }
  const wider = [...candidates, ...cornersOf([...alsoBlocking])];
  for (const first of wider) {
    for (const second of wider) {
      if (first === second) {
        continue;
      }
      const from = keepEnds ? start : borderPoint(source, first);
      const to = keepEnds ? end : borderPoint(target, second);
      const hits = others.filter(
        (rect) =>
          segmentHitsRect(from, first, rect, 4) ||
          segmentHitsRect(first, second, rect, 4) ||
          segmentHitsRect(second, to, rect, 4)
      ).length;
      if (hits > 0) {
        continue;
      }
      const length =
        Math.hypot(first.x - from.x, first.y - from.y) +
        Math.hypot(second.x - first.x, second.y - first.y) +
        Math.hypot(to.x - second.x, to.y - second.y);
      if (best.hits > 0 || length < best.length) {
        best = { points: [round(from), round(first), round(second), round(to)], hits: 0, length, bends: 2 };
      }
    }
  }
  return best.points;
}

/** Corners and side-middles of the boxes to get round, with clearance. */
function cornersOf(rects: Rect[]): Point[] {
  const candidates: Point[] = [];
  for (const rect of rects) {
    const left = rect.x - CLEARANCE;
    const right = rect.x + rect.width + CLEARANCE;
    const top = rect.y - CLEARANCE;
    const bottom = rect.y + rect.height + CLEARANCE;
    const middleX = rect.x + rect.width / 2;
    const middleY = rect.y + rect.height / 2;
    // Corners, and the middle of each side: a box is passed either round its
    // end or over its face, and which is shorter depends on where the two
    // classes sit.
    candidates.push(
      { x: left, y: top },
      { x: right, y: top },
      { x: left, y: bottom },
      { x: right, y: bottom },
      { x: middleX, y: top },
      { x: middleX, y: bottom },
      { x: left, y: middleY },
      { x: right, y: middleY }
    );
  }
  return candidates;
}

function round(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function orthogonal(source: Rect, target: Rect, offset: number): Point[] {
  const verticalOverlap = overlapRange(source.y, source.y + source.height, target.y, target.y + target.height);
  const horizontalOverlap = overlapRange(source.x, source.x + source.width, target.x, target.x + target.width);

  if (verticalOverlap && verticalOverlap.length >= FACING && !horizontallyTouching(source, target)) {
    const y = Math.round(verticalOverlap.middle + offset);
    const goingRight = target.x > source.x;
    return [
      { x: goingRight ? source.x + source.width : source.x, y },
      { x: goingRight ? target.x : target.x + target.width, y },
    ];
  }

  if (horizontalOverlap && horizontalOverlap.length >= FACING) {
    const x = Math.round(horizontalOverlap.middle + offset);
    const goingDown = target.y > source.y;
    return [
      { x, y: goingDown ? source.y + source.height : source.y },
      { x, y: goingDown ? target.y : target.y + target.height },
    ];
  }

  const from = centerOf(source);
  const to = centerOf(target);
  if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) {
    const goingRight = to.x > from.x;
    const startX = goingRight ? source.x + source.width : source.x;
    const endX = goingRight ? target.x : target.x + target.width;
    const middle = Math.round((startX + endX) / 2 + offset);
    return [
      { x: startX, y: Math.round(from.y + offset) },
      { x: middle, y: Math.round(from.y + offset) },
      { x: middle, y: Math.round(to.y + offset) },
      { x: endX, y: Math.round(to.y + offset) },
    ];
  }
  const goingDown = to.y > from.y;
  const startY = goingDown ? source.y + source.height : source.y;
  const endY = goingDown ? target.y : target.y + target.height;
  const middle = Math.round((startY + endY) / 2 + offset);
  return [
    { x: Math.round(from.x + offset), y: startY },
    { x: Math.round(from.x + offset), y: middle },
    { x: Math.round(to.x + offset), y: middle },
    { x: Math.round(to.x + offset), y: endY },
  ];
}

/**
 * A relation from a class to itself: out of one side, round the corner, and back
 * into the next -- each loop wider than the last.
 *
 * Which corner is decided with the rest of the anchoring, because a loop drawn
 * over whatever else leaves that side crosses it for no reason. Its two ends
 * arrive here as ports like any other line's; the fixed corner below is what a
 * loop is drawn as when there are none, which is only a class drawn on its own.
 *
 * A class with two of them -- gUFO's `ConcreteIndividual` has constitution and
 * historical dependence, both to itself -- drew the same rectangle twice, which
 * reads as one relation with two labels stacked on it. The ports keep the two
 * apart on the border; `reach` keeps them apart out in the open.
 */
function selfLoop(rect: Rect, index: number, ends?: { source: Point; target: Point }, obstacles?: Rect[]): Point[] {
  const others = obstacles?.filter((obstacle) => obstacle !== rect) ?? [];
  const preferred = loopPath(rect, index, ends);
  if (others.length === 0 || pathIsClear(preferred, others)) {
    return preferred;
  }

  // Port assignment chooses a corner by the other lines leaving this class.
  // A disconnected card cannot contribute an angle there, so make the final
  // choice with the obstacle rectangles that only routing has. The assigned
  // corner remains first; alternatives mirror its compact corner ports and
  // keep their index-dependent reach so multiple loops do not coincide.
  const insetY = Math.min(14 + index * 8, Math.max(rect.height / 2 - 2, 2));
  const insetX = Math.min(14 + index * 8, Math.max(rect.width / 2 - 2, 2));
  const alternatives = [
    { source: { x: rect.x + rect.width, y: rect.y + insetY }, target: { x: rect.x + rect.width - insetX, y: rect.y } },
    {
      source: { x: rect.x + rect.width, y: rect.y + rect.height - insetY },
      target: { x: rect.x + rect.width - insetX, y: rect.y + rect.height },
    },
    { source: { x: rect.x, y: rect.y + insetY }, target: { x: rect.x + insetX, y: rect.y } },
    {
      source: { x: rect.x, y: rect.y + rect.height - insetY },
      target: { x: rect.x + insetX, y: rect.y + rect.height },
    },
  ].map((candidate) => loopPath(rect, index, candidate));
  const clear = alternatives
    .filter((candidate) => pathIsClear(candidate, others))
    .sort((one, other) => pathLength(one) - pathLength(other));
  return clear[0] ?? preferred;
}

function loopPath(rect: Rect, index: number, ends?: { source: Point; target: Point }): Point[] {
  const reach = LOOP + index * 16;
  const centre = centerOf(rect);
  const from = ends?.source ?? { x: rect.x + rect.width, y: Math.round(rect.y + rect.height / 3) };
  const to = ends?.target ?? { x: Math.round(centre.x), y: rect.y };
  // Out past the side it leaves by, and past the side it comes back into: the
  // corner of the loop is where those two clearances meet.
  const out = from.x > centre.x ? from.x + reach : from.x - reach;
  const over = to.y > centre.y ? to.y + reach : to.y - reach;
  return [
    round(from),
    round({ x: out, y: from.y }),
    round({ x: out, y: over }),
    round({ x: to.x, y: over }),
    round(to),
  ];
}

function horizontallyTouching(source: Rect, target: Rect): boolean {
  return source.x < target.x + target.width && target.x < source.x + source.width;
}

function overlapRange(
  fromA: number,
  toA: number,
  fromB: number,
  toB: number
): { middle: number; length: number } | undefined {
  const from = Math.max(fromA, fromB);
  const to = Math.min(toA, toB);
  return to > from ? { middle: (from + to) / 2, length: to - from } : undefined;
}
