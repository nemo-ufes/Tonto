// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/** Rectangles, points, and the small amount of geometry an edge needs. */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export type Side = "top" | "right" | "bottom" | "left";

export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function overlaps(one: Rect, other: Rect, margin = 0): boolean {
  return (
    one.x - margin < other.x + other.width &&
    one.x + one.width + margin > other.x &&
    one.y - margin < other.y + other.height &&
    one.y + one.height + margin > other.y
  );
}

/**
 * The rectangle two corners describe, whichever way round they were given.
 *
 * A rubber band is dragged in any of four directions, and a rectangle with a
 * negative width is not one: it contains nothing, so a marquee dragged up and to
 * the left would select nothing at all.
 */
export function rectBetween(one: Point, other: Point): Rect {
  return {
    x: Math.min(one.x, other.x),
    y: Math.min(one.y, other.y),
    width: Math.abs(other.x - one.x),
    height: Math.abs(other.y - one.y),
  };
}

export function boundsOf(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Where a line towards `towards` leaves the rectangle.
 *
 * Anchoring on the border rather than on the centre is what keeps an arrowhead
 * off the middle of a class name, and doing it by intersection rather than by
 * picking a fixed port is what lets a box be dragged anywhere and still be met
 * squarely.
 */
export function borderPoint(rect: Rect, towards: Point): Point {
  const center = centerOf(rect);
  const dx = towards.x - center.x;
  const dy = towards.y - center.y;
  if (dx === 0 && dy === 0) {
    return center;
  }
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  // The scale at which the ray first meets one of the four edges.
  const scale = Math.min(
    dx === 0 ? Infinity : halfWidth / Math.abs(dx),
    dy === 0 ? Infinity : halfHeight / Math.abs(dy)
  );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** Which side of the rectangle a point sits against. */
export function sideOf(rect: Rect, point: Point): Side {
  const center = centerOf(rect);
  const dx = (point.x - center.x) / (rect.width / 2 || 1);
  const dy = (point.y - center.y) / (rect.height / 2 || 1);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

/**
 * Whether a segment passes through a rectangle.
 *
 * Liang-Barsky: clip the segment against each of the four edges in turn and see
 * whether any of it is left. Exact, allocation-free, and the inner loop of every
 * route that goes round a box rather than through it.
 */
export function segmentHitsRect(from: Point, to: Point, rect: Rect, margin = 0): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let enter = 0;
  let leave = 1;
  const clip = (direction: number, distance: number): boolean => {
    if (direction === 0) {
      // Parallel to this pair of edges: outside them means never inside.
      return distance >= 0;
    }
    const ratio = distance / direction;
    if (direction < 0) {
      if (ratio > leave) {
        return false;
      }
      enter = Math.max(enter, ratio);
    } else {
      if (ratio < enter) {
        return false;
      }
      leave = Math.min(leave, ratio);
    }
    return true;
  };
  return (
    clip(-dx, from.x - (rect.x - margin)) &&
    clip(dx, rect.x + rect.width + margin - from.x) &&
    clip(-dy, from.y - (rect.y - margin)) &&
    clip(dy, rect.y + rect.height + margin - from.y)
  );
}

/** How far a point is from a segment, measuring to its nearest point. */
export function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }
  const along = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy));
}

/** How far a point is from a polyline. */
export function distanceToPath(point: Point, path: Point[]): number {
  let nearest = Infinity;
  for (let index = 0; index + 1 < path.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(point, path[index]!, path[index + 1]!));
  }
  return nearest;
}

export function distance(one: Point, other: Point): number {
  return Math.hypot(one.x - other.x, one.y - other.y);
}

/** Two segments cross in their interiors; a shared endpoint is not a crossing. */
export function segmentsProperlyCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (one: Point, two: Point, point: Point) =>
    (two.x - one.x) * (point.y - one.y) - (two.y - one.y) * (point.x - one.x);
  const abC = side(a, b, c);
  const abD = side(a, b, d);
  const cdA = side(c, d, a);
  const cdB = side(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

/** A point `offset` along the segment that starts the path, for an end label. */
export function alongPath(points: Point[], fromStart: boolean, offset: number): Point {
  const ordered = fromStart ? points : [...points].reverse();
  let remaining = offset;
  for (let index = 0; index + 1 < ordered.length; index += 1) {
    const from = ordered[index]!;
    const to = ordered[index + 1]!;
    const length = distance(from, to);
    if (length >= remaining) {
      const ratio = length === 0 ? 0 : remaining / length;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    remaining -= length;
  }
  return ordered[ordered.length - 1] ?? { x: 0, y: 0 };
}

/** The middle of a path, by length rather than by index. */
export function midpointOf(points: Point[]): Point {
  const total = points.slice(1).reduce((sum, point, index) => sum + distance(points[index]!, point), 0);
  return alongPath(points, true, total / 2);
}
