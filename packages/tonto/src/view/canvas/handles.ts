// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * Taking hold of a route guide, and the corner of a card.
 *
 * A line is routed for the modeller until they disagree with it, and then it is
 * theirs. What they take hold of is a handle on every guide bend and stretch.
 * A curved line may contain many adaptive drawing samples, but those are not
 * handles; dropping the last guide bend gives the line back to the router.
 *
 * The arithmetic is here rather than in the panel because it is the part that
 * can be wrong -- an index off by one puts the bend on the wrong side of the
 * one beside it, and the line doubles back -- and because a panel is a poor
 * place to test anything. What the panel keeps is the pointer and the DOM.
 *
 * A route holds its ends as well as its bends (see `EdgeRoute`), so the first
 * and last point of a polyline are where the line meets its two classes. Those
 * are not offered as handles: the border point is the ports' answer, and moving
 * it by hand would leave a line ending in mid-air the next time either class
 * changed size.
 */

import type { Point, Rect, Size } from "./geometry.js";

export interface Handle {
  /** Where the handle sits. */
  at: Point;
  /**
   * Which point of the route it is: the index of the bend it holds, or, for a
   * new one, the index the bend would be inserted at.
   */
  index: number;
  /** `bend` moves a point the route already has; `new` adds one. */
  kind: "bend" | "new";
}

/**
 * How short a stretch has to be before it is not offered a handle of its own.
 *
 * Two handles a few pixels apart are one target the pointer cannot choose
 * between, and the stretch either side of a bend is often that short.
 */
const SHORTEST = 24;

/** The handles offered on a drawn route. */
export function handlesFor(points: Point[]): Handle[] {
  if (points.length < 2) {
    return [];
  }
  const handles: Handle[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    if (Math.hypot(to.x - from.x, to.y - from.y) >= SHORTEST) {
      handles.push({
        at: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        index: index + 1,
        kind: "new",
      });
    }
    if (index + 2 < points.length) {
      handles.push({ at: { ...to }, index: index + 1, kind: "bend" });
    }
  }
  return handles;
}

/**
 * The route a drag of one handle leaves behind.
 *
 * A new handle becomes a bend where it is dropped, between the two points the
 * stretch it came from joins; an existing one is simply somewhere else.
 */
export function moveHandle(points: Point[], handle: Handle, to: Point): Point[] {
  const moved = [...points];
  if (handle.kind === "new") {
    moved.splice(handle.index, 0, { ...to });
  } else {
    moved[handle.index] = { ...to };
  }
  return moved;
}

/**
 * The route left when a bend is dropped, or nothing when the line has none left.
 *
 * Nothing means the router has it back. A route of two points is what a straight
 * line would be given anyway -- except that it would also be given the ports and
 * the way round anything in between, which a stored one would have thrown away.
 */
export function dropHandle(points: Point[], index: number): Point[] | undefined {
  if (index <= 0 || index >= points.length - 1) {
    return points;
  }
  const left = points.filter((_, at) => at !== index);
  return left.length > 2 ? left : undefined;
}

/** Which corner of a card is being pulled. */
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const CORNERS: readonly Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/** Where a corner of a rectangle is. */
export function cornerOf(rect: Rect, corner: Corner): Point {
  return {
    x: corner === "top-left" || corner === "bottom-left" ? rect.x : rect.x + rect.width,
    y: corner === "top-left" || corner === "top-right" ? rect.y : rect.y + rect.height,
  };
}

/**
 * The card a corner has been pulled to, with the opposite corner left alone.
 *
 * A card is only ever made roomier than what it holds. `least` is the size the
 * content needs, so pulling a corner past it stops there rather than sliding the
 * name out of the box: a card too small for what is written in it is not a
 * smaller card, it is a broken one. Which is also why the size a modeller
 * chooses is kept as a minimum rather than as the size -- an attribute added
 * later grows the card past it.
 */
export function resizeTo(rect: Rect, corner: Corner, to: Point, least: Size): Rect {
  const left = corner === "top-left" || corner === "bottom-left";
  const top = corner === "top-left" || corner === "top-right";
  const fixed = cornerOf(rect, opposite(corner));
  const width = Math.max(least.width, left ? fixed.x - to.x : to.x - fixed.x);
  const height = Math.max(least.height, top ? fixed.y - to.y : to.y - fixed.y);
  return {
    x: left ? fixed.x - width : fixed.x,
    y: top ? fixed.y - height : fixed.y,
    width,
    height,
  };
}

function opposite(corner: Corner): Corner {
  switch (corner) {
    case "top-left":
      return "bottom-right";
    case "top-right":
      return "bottom-left";
    case "bottom-left":
      return "top-right";
    case "bottom-right":
    default:
      return "top-left";
  }
}
