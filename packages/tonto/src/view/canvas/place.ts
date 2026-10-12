// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * Where the boxes go.
 *
 * Two different jobs, deliberately kept apart:
 *
 * - `placeNewNodes` runs on every edit. It only ever places what has no
 *   position yet, next to whatever it is connected to. Nothing already placed
 *   moves, because the modeller put it there and adding a class is not a
 *   request to rearrange the diagram. This is the property a re-render through
 *   an external layout engine cannot have, and the reason this repository draws
 *   its own diagrams.
 * - `autoLayout` runs when the modeller asks for it, and only then. It is
 *   ELK's layered algorithm, over everything or over a selection.
 */

import type { ViewModel } from "../model/index.js";
import type { Placement } from "../model/index.js";
import type { Rect, Size } from "./geometry.js";
import { boundsOf, centerOf, overlaps } from "./geometry.js";

export type Positions = Record<string, Rect>;

const GAP = 40;
const STEP = 24;

/**
 * Positions for every node in the view: the saved ones as they were, and a spot
 * for each of the rest.
 */
export function placeNewNodes(
  view: ViewModel,
  sizes: Record<string, Size>,
  saved: Record<string, Placement>
): Positions {
  const positions: Positions = {};
  for (const node of view.nodes) {
    const placement = saved[node.id];
    const size = sizes[node.id] ?? { width: 160, height: 60 };
    if (placement) {
      positions[node.id] = { x: placement.x, y: placement.y, ...grownTo(size, placement) };
    }
  }

  const neighbours = neighbourIndex(view);
  // In view order, so that two elements written together are placed together,
  // and so the same model always produces the same first sketch.
  for (const node of view.nodes) {
    if (positions[node.id]) {
      continue;
    }
    const size = sizes[node.id] ?? { width: 160, height: 60 };
    const anchors = (neighbours.get(node.id) ?? [])
      .map((id) => positions[id])
      .filter((rect): rect is Rect => rect !== undefined);
    positions[node.id] = findSpot(size, anchors, Object.values(positions));
  }
  return positions;
}

/**
 * The size a card is drawn at: what it holds, grown to what the file asks for.
 *
 * A size in the file is the least the card may be, not the size it is. A
 * modeller widens a card to give a long name a line of its own, and it stays
 * wide; but an attribute added afterwards still grows it, because a card too
 * small for what is written in it is not a smaller card, it is a broken one.
 */
function grownTo(size: Size, placement: Placement | undefined): Size {
  return {
    width: Math.max(size.width, placement?.width ?? 0),
    height: Math.max(size.height, placement?.height ?? 0),
  };
}

/**
 * The size every node is drawn at, which is the size to arrange it at.
 *
 * `sizeOf` answers what a card needs; the file may ask for more. A layout run
 * on the smaller of the two packs the diagram around a card that is not the
 * size it will be drawn at, and the widened card then sits over its neighbours.
 */
export function drawnSizes(
  view: ViewModel,
  sizes: Record<string, Size>,
  saved: Record<string, Placement>
): Record<string, Size> {
  return Object.fromEntries(
    view.nodes.map((node) => [node.id, grownTo(sizes[node.id] ?? { width: 160, height: 60 }, saved[node.id])])
  );
}

/**
 * An arrangement on its way back into the file: new places, old sizes.
 *
 * A layout answers with a rectangle for every node, but its width and height
 * are the size the card is drawn at -- and writing that back would record every
 * card's present content as a size it must never go below. A class that lost an
 * attribute afterwards would keep the room the attribute used to take, and the
 * one card the modeller did widen by hand would be reset to what it holds. So
 * only the place is written, and a size the file already asked for stays.
 */
export function movedTo(laid: Positions, saved: Record<string, Placement>): Record<string, Placement> {
  return Object.fromEntries(
    Object.entries(laid).map(([id, rect]) => {
      const chosen = saved[id];
      return [
        id,
        {
          x: rect.x,
          y: rect.y,
          ...(chosen?.width === undefined ? {} : { width: chosen.width }),
          ...(chosen?.height === undefined ? {} : { height: chosen.height }),
        },
      ];
    })
  );
}

/**
 * A free rectangle near the anchors -- below them, which is where a reader of a
 * class diagram looks for what was added last -- searched outwards in a square
 * spiral so that a busy area does not push everything into one column.
 */
function findSpot(size: Size, anchors: Rect[], taken: Rect[]): Rect {
  const start = anchors.length > 0 ? centreBelow(anchors, size) : nextFreeRow(taken, size);
  let candidate = { ...start, ...size };
  for (let ring = 0; ring < 60; ring += 1) {
    for (const offset of ringOffsets(ring)) {
      candidate = {
        x: Math.round(start.x + offset.x * STEP),
        y: Math.round(start.y + offset.y * STEP),
        width: size.width,
        height: size.height,
      };
      if (!taken.some((rect) => overlaps(candidate, rect, GAP / 2))) {
        return candidate;
      }
    }
  }
  // A very dense or deliberately hand-packed diagram can occupy the whole
  // search radius. Returning the last rejected candidate silently overlaps a
  // box; below the complete occupied bounds is less local, but always free.
  return { ...nextFreeRow(taken, size), width: size.width, height: size.height };
}

function centreBelow(anchors: Rect[], size: Size): { x: number; y: number } {
  const centres = anchors.map(centerOf);
  const x = centres.reduce((sum, point) => sum + point.x, 0) / centres.length - size.width / 2;
  const bottom = Math.max(...anchors.map((rect) => rect.y + rect.height));
  return { x: Math.round(x), y: Math.round(bottom + GAP) };
}

function nextFreeRow(taken: Rect[], size: Size): { x: number; y: number } {
  if (taken.length === 0) {
    return { x: 0, y: 0 };
  }
  const bounds = boundsOf(taken);
  return { x: bounds.x, y: Math.round(bounds.y + bounds.height + GAP), ...size };
}

/** Offsets at distance `ring`, right and down first: a diagram grows that way. */
function ringOffsets(ring: number): Array<{ x: number; y: number }> {
  if (ring === 0) {
    return [{ x: 0, y: 0 }];
  }
  const offsets: Array<{ x: number; y: number }> = [];
  for (let step = -ring; step <= ring; step += 1) {
    offsets.push({ x: step, y: ring });
    offsets.push({ x: ring, y: step });
    offsets.push({ x: step, y: -ring });
    offsets.push({ x: -ring, y: step });
  }
  return offsets;
}

function neighbourIndex(view: ViewModel): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    index.set(from, [...(index.get(from) ?? []), to]);
  };
  for (const edge of view.edges) {
    add(edge.source, edge.target);
    add(edge.target, edge.source);
  }
  return index;
}
