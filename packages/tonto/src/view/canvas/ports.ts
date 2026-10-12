// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * Where each line meets each box.
 *
 * Every edge used to aim at the centre of the box at its far end and stop where
 * that ray crossed the border, so two edges between neighbouring classes met the
 * border within a pixel or two of each other and ran together for most of their
 * length. Two associations that look like one line is the worst thing a class
 * diagram can do: the reader counts one relationship where the model has two,
 * and the multiplicities of both sit in the same place with nothing to say which
 * belongs to which.
 *
 * So each end first asks for the point where its own line of sight crosses the
 * border. Ends that arrive too close together are spread only far enough to be
 * distinguishable, in the order of the angle each line leaves at. This keeps
 * them from crossing one another without making a lone diagonal association
 * leave from the unrelated middle of a side.
 *
 * A relation from a class to itself is placed here too. It goes nowhere, so it
 * has no angle to be ordered by: it takes the end of its side, at the corner it
 * turns, and it turns the corner with the most room left around it.
 *
 * A relator is the exception. It is a reified relationship, and its mediations
 * are the relationship: the drawing should read as one line from one relatum to
 * the other, passing through the relator on its way. Spreading those ends evenly
 * along the border breaks that -- the line arrives at the middle of the top edge
 * from the left and leaves the middle of the bottom edge to the right, which
 * reads as two lines meeting at a box rather than as one line through it. So an
 * end named in `through` is anchored where the ray from the centre of the box
 * out to the far end crosses the border. Each such line then points at the
 * relator's centre, and a pair of them lines up across it.
 */

import type { Point, Rect, Side } from "./geometry.js";
import { centerOf, sideOf } from "./geometry.js";

export interface EdgeEnds {
  source: Point;
  target: Point;
}

interface Arrival {
  edge: string;
  isSource: boolean;
  /** Where the line is coming from, which decides the side and the order. */
  from: Point;
  /** Anchored on the ray out of the centre rather than spread along the side. */
  through: boolean;
  /** What that ray points at: the far end, once it is known, else its centre. */
  aim: Point;
  /** A taxonomy side fixed by the view's layout direction. */
  side?: Side;
  /** Half the border corridor this end needs beside its neighbours. */
  clearance?: number;
  /**
   * A loop's end: the side it leaves by, and the neighbouring side it turns
   * towards. It belongs at that end of its side rather than anywhere in the
   * fan, because it does not go anywhere -- it turns the corner.
   */
  corner?: { side: Side; towards: Side };
}

/**
 * The corners a loop may turn, in the order they are preferred on a tie.
 *
 * Out of a vertical side and back into a horizontal one, which is the shape a
 * loop has always been drawn as; right and over the top first, so a class with
 * nothing else attached is drawn as it was before there was a choice.
 */
const CORNERS: ReadonlyArray<{ out: Side; back: Side }> = [
  { out: "right", back: "top" },
  { out: "right", back: "bottom" },
  { out: "left", back: "top" },
  { out: "left", back: "bottom" },
];

/** Whether a side is at the low end of the axis its neighbours are placed along. */
function towardsLow(side: Side): boolean {
  return side === "top" || side === "left";
}

/** The difference between two directions, as an angle no bigger than half a turn. */
function between(one: number, other: number): number {
  const difference = Math.abs(one - other) % (Math.PI * 2);
  return difference > Math.PI ? Math.PI * 2 - difference : difference;
}

/**
 * The corner a class's loops turn at: the one with the most room around it.
 *
 * A relation from a class to itself used to leave the right side and return over
 * the top whatever else was there, and `assignPorts` did not know it existed, so
 * the lines that go somewhere were spread as though those two sides were free.
 * On gUFO that put the loop of `Aspect` over the line to `ConcreteIndividual`
 * and the loop of `Event` over two more -- crossings the arrangement never asked
 * for, and which go as soon as the loop is told what is already there.
 *
 * Room is measured as an angle, not as a count of what attaches to each side. A
 * loop takes up the corner it turns, so what matters is whether anything leaves
 * in that direction: the line out of `Aspect` to `ConcreteIndividual` runs
 * almost exactly along the top right diagonal, and a loop turning that corner
 * crosses it wherever along the two sides either of them is anchored. Counting
 * sides says only that the top has one line on it, which every corner of a class
 * with four relations can say.
 */
function loopCorner(leaving: readonly number[] | undefined): { out: Side; back: Side } {
  let best = CORNERS[0]!;
  let clearest = -Infinity;
  for (const corner of CORNERS) {
    const diagonal = Math.atan2(corner.back === "bottom" ? 1 : -1, corner.out === "right" ? 1 : -1);
    // Half a turn where nothing leaves at all, which leaves the first corner
    // holding the tie: a class drawn on its own keeps the loop it always had.
    const clearance = Math.min(Math.PI, ...(leaving ?? []).map((angle) => between(angle, diagonal)));
    if (clearance > clearest) {
      best = corner;
      clearest = clearance;
    }
  }
  return best;
}

/** How close to a corner a line may attach. */
const MARGIN = 14;

/** How close two ends may sit on one side before they read as one. */
const GAP = 12;

/** Half the width reserved for a hollow generalization triangle. */
const GENERALIZATION_CLEARANCE = 10;

/** Names one end of one edge: the end of `edge` that touches `node`. */
export function endKey(edge: string, node: string): string {
  return `${edge}@${node}`;
}

/**
 * A generalization tree's stem, competing for its share of the general's
 * border the same way an association does.
 *
 * A genset gathers several specializations into one shared triangle, drawn by
 * its own code rather than as an ordinary edge -- so without this, the border
 * space its stem needs is not reserved by anything, and the associations
 * fanned out beside it are placed as though the tree were not there at all.
 */
export interface TreeStem {
  /** A key of the caller's choosing, distinct from every edge id. */
  id: string;
  /** The general the stem attaches to. */
  node: string;
  /** Where the tree reaches towards, for the fan order and the aim through centre. */
  towards: Point;
}

export type AssociationAnchors = "ray" | "even";

export function assignPorts(
  edges: Array<{ id: string; source: string; target: string; kind?: string }>,
  positions: Record<string, Rect>,
  /** The ends to aim through the centre of the box, by `endKey`. */
  through: ReadonlySet<string> = new Set(),
  /** Generalization-set stems, sharing the fan on the general's side of the border. */
  stems: readonly TreeStem[] = [],
  /** Candidate policy for ordinary associations; taxonomy always follows its ray. */
  associationAnchors: AssociationAnchors = "ray",
  /** Rank direction, when known, so generalizations meet rank-facing sides. */
  direction?: "DOWN" | "RIGHT",
  /** Reserve the rendered triangle footprint, not only its attachment tip. */
  reserveGeneralizationHeads = true
): { ends: Map<string, EdgeEnds>; stems: Map<string, Point> } {
  // The direction everything that goes somewhere leaves in, by class, so that
  // a loop can turn at the corner with the most room around it.
  const leaving = new Map<string, number[]>();
  for (const edge of edges) {
    const source = positions[edge.source];
    const target = positions[edge.target];
    if (!source || !target || edge.source === edge.target) {
      continue;
    }
    note(leaving, edge.source, centerOf(source), centerOf(target));
    note(leaving, edge.target, centerOf(target), centerOf(source));
  }

  const arrivals = new Map<string, Arrival[]>();
  for (const edge of edges) {
    const source = positions[edge.source];
    const target = positions[edge.target];
    if (!source || !target) {
      continue;
    }
    if (edge.source === edge.target) {
      // Both ends of a loop are ends on this class, and are placed with
      // everything else: a line that goes somewhere must not be given the
      // piece of border the loop leaves from.
      const { out, back } = loopCorner(leaving.get(edge.source));
      const centre = centerOf(source);
      push(arrivals, edge.source, {
        edge: edge.id,
        isSource: true,
        from: centre,
        aim: centre,
        through: false,
        corner: { side: out, towards: back },
      });
      push(arrivals, edge.source, {
        edge: edge.id,
        isSource: false,
        from: centre,
        aim: centre,
        through: false,
        corner: { side: back, towards: out },
      });
      continue;
    }
    // Taxonomy is read through the centre of each class, same as a
    // mediation through its relator -- so it takes the same `through`
    // treatment, aimed at first through the far box's centre and then
    // refined onto the point that box was actually given. Associations
    // sharing the same side may still fan out beside it, but `separate`
    // now holds them off the triangle instead of the triangle landing on
    // top of one of them regardless of what their fan already claimed.
    const ranked = edge.kind === "generalization" && direction && rankedBeyond(source, target, direction);
    push(arrivals, edge.source, {
      edge: edge.id,
      isSource: true,
      from: centerOf(target),
      aim: centerOf(target),
      through: edge.kind === "generalization" || through.has(endKey(edge.id, edge.source)),
      ...(ranked ? { side: direction === "DOWN" ? ("top" as const) : ("left" as const) } : {}),
    });
    push(arrivals, edge.target, {
      edge: edge.id,
      isSource: false,
      from: centerOf(source),
      aim: centerOf(source),
      through: edge.kind === "generalization" || through.has(endKey(edge.id, edge.target)),
      ...(edge.kind === "generalization" && reserveGeneralizationHeads ? { clearance: GENERALIZATION_CLEARANCE } : {}),
      ...(ranked ? { side: direction === "DOWN" ? ("bottom" as const) : ("right" as const) } : {}),
    });
  }
  for (const stem of stems) {
    const rect = positions[stem.node];
    if (!rect) {
      continue;
    }
    push(arrivals, stem.node, {
      edge: stem.id,
      isSource: true,
      from: stem.towards,
      aim: stem.towards,
      through: true,
      ...(reserveGeneralizationHeads ? { clearance: GENERALIZATION_CLEARANCE } : {}),
    });
  }

  // Twice over. The first pass aims a line to be read through a box at the
  // centre of the box at its far end, because that is all there is to aim at;
  // the second aims it at the point the first pass gave that far end, which is
  // where the line will actually be drawn to. Without it a mediation to a tall
  // class was anchored for a line steeper than the one drawn, and missed the
  // relator's centre by half its height.
  let ends = place(arrivals, positions, associationAnchors);
  const hasThrough = stems.length > 0 || through.size > 0 || edges.some((edge) => edge.kind === "generalization");
  if (hasThrough) {
    for (const incoming of arrivals.values()) {
      for (const arrival of incoming) {
        const pair = ends.get(arrival.edge);
        const far = arrival.isSource ? pair?.target : pair?.source;
        if (far) {
          arrival.aim = far;
        }
      }
    }
    ends = place(arrivals, positions, associationAnchors);
  }

  const complete = new Map<string, EdgeEnds>();
  for (const [edge, pair] of ends) {
    if (pair.source && pair.target) {
      complete.set(edge, { source: pair.source, target: pair.target });
    }
  }
  const stemPoints = new Map<string, Point>();
  for (const stem of stems) {
    const point = ends.get(stem.id)?.source;
    if (point) {
      stemPoints.set(stem.id, point);
    }
  }
  return { ends: complete, stems: stemPoints };
}

/** One pass: every arrival given its point on the border of the box it meets. */
function place(
  arrivals: Map<string, Arrival[]>,
  positions: Record<string, Rect>,
  associationAnchors: AssociationAnchors
): Map<string, Partial<EdgeEnds>> {
  const ends = new Map<string, Partial<EdgeEnds>>();
  for (const [nodeId, incoming] of arrivals) {
    const rect = positions[nodeId]!;
    const bySide = new Map<Side, Arrival[]>();
    for (const arrival of incoming) {
      const side = arrival.corner?.side ?? arrival.side ?? sideOf(rect, arrival.from);
      bySide.set(side, [...(bySide.get(side) ?? []), arrival]);
    }
    for (const [side, group] of bySide) {
      // Ordered by the angle each line leaves at, so they fan out without
      // crossing one another between the border and open space. A loop
      // turns the corner rather than leaving for anywhere, so it takes the
      // end of the side it turns at -- outside the fan, at either extreme.
      const order = (arrival: Arrival) =>
        arrival.corner
          ? (towardsLow(arrival.corner.towards) ? -1 : 1) * Math.PI * 2
          : fanAngle(rect, side, arrival.from);
      const ordered = [...group].sort((one, other) => {
        if (one.corner && other.corner) {
          // Two loops turning the same corner nest one inside the
          // other, and both ends of each have to come in the same
          // order out from that corner -- which is towards the low end
          // of one side and towards the high end of the other, or the
          // wider loop's return leg crosses the narrower one's.
          const outwards = towardsLow(one.corner.towards) ? 1 : -1;
          return outwards * one.edge.localeCompare(other.edge);
        }
        return order(one) - order(other) || one.edge.localeCompare(other.edge);
      });
      // Every line asks for the point its own ray crosses. Before this,
      // only a generalization or mediation through a relator did so; an
      // ordinary association was divided evenly across the whole side.
      // A single diagonal association therefore left from the middle of
      // an unrelated edge, and several associations were displaced much
      // farther than the small separation needed to tell them apart.
      // Loops still take their ordered even share because their ray goes
      // nowhere: the corner, not a far endpoint, says where they belong.
      const even = ordered.map((_, index) => alongAt(rect, side, (index + 1) / (ordered.length + 1)));
      const wanted = ordered.map((arrival, index) =>
        arrival.corner || (!arrival.through && associationAnchors === "even")
          ? even[index]!
          : alongThrough(rect, side, arrival.aim)
      );
      const spaced = ordered.some((arrival) => arrival.through || associationAnchors === "ray")
        ? separate(
            wanted,
            even,
            lengthOf(rect, side),
            ordered.map((arrival) => arrival.clearance ?? GAP / 2)
          )
        : even;
      ordered.forEach((arrival, index) => {
        const at = pointOn(rect, side, spaced[index]!);
        const current = ends.get(arrival.edge) ?? {};
        ends.set(arrival.edge, arrival.isSource ? { ...current, source: at } : { ...current, target: at });
      });
    }
  }
  return ends;
}

/**
 * Where an arrival belongs in the fan of lines leaving one side of a box.
 *
 * The ends have to be placed along a side in the order the lines leave in, or
 * two of them cross each other on the way out -- a crossing the reader has to
 * untangle to see which class each line reaches, and one the arrangement never
 * asked for.
 *
 * That order was taken from the far box's x on a top or bottom side and its y on
 * a left or right one, which is the same order only while the far boxes differ
 * on that axis. A layered layout puts a whole rank at one y: three lines leaving
 * the right side of a class for three classes on the rank below had the same y,
 * the comparison tied, and the tiebreak ordered them by edge id -- alphabetically,
 * which on `boats` came out exactly reversed and crossed two of the three.
 *
 * The angle is the order in every case, and ties only for two lines that really
 * do leave in the same direction. Measured against the outward normal of the
 * side so that it grows the way ends are placed along it: rightwards on a top or
 * bottom side, downwards on a left or right one.
 */
function fanAngle(rect: Rect, side: Side, towards: Point): number {
  const centre = centerOf(rect);
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;
  switch (side) {
    case "top":
      return Math.atan2(dx, -dy);
    case "bottom":
      return Math.atan2(dx, dy);
    case "left":
      return Math.atan2(dy, -dx);
    case "right":
    default:
      return Math.atan2(dy, dx);
  }
}

/**
 * Whether the specific lies wholly past its general along the rank direction:
 * the case the rank-facing sides were chosen for, where the line of sight hits
 * an inner vertical side only because the cross-axis offset is large. Once the
 * modeller puts the specific beside or above its general, pinning the head to
 * the general's bottom sent the line round the box to an arbitrary side.
 */
function rankedBeyond(specific: Rect, general: Rect, direction: "DOWN" | "RIGHT"): boolean {
  return direction === "DOWN" ? specific.y >= general.y + general.height : specific.x >= general.x + general.width;
}

function lengthOf(rect: Rect, side: Side): number {
  return side === "top" || side === "bottom" ? rect.width : rect.height;
}

/** How far along a side a fraction of it falls, kept clear of the corners. */
function alongAt(rect: Rect, side: Side, fraction: number): number {
  const length = lengthOf(rect, side);
  const usable = Math.max(length - MARGIN * 2, 0);
  return (length - usable) / 2 + usable * fraction;
}

/** Where the ray from the centre of the box out to `towards` crosses `side`. */
function alongThrough(rect: Rect, side: Side, towards: Point): number {
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;
  const length = lengthOf(rect, side);
  const half = length / 2;
  if (side === "top" || side === "bottom") {
    const reach = dy === 0 ? 0 : (rect.height / 2) * (dx / Math.abs(dy));
    return clamp(half + reach, rect.width);
  }
  const reach = dx === 0 ? 0 : (rect.width / 2) * (dy / Math.abs(dx));
  return clamp(half + reach, rect.height);
}

function clamp(along: number, length: number): number {
  const low = Math.min(MARGIN, length / 2);
  return Math.max(low, Math.min(length - low, along));
}

/**
 * The same ends, no two of them within `GAP` of each other.
 *
 * Pushed apart from the front and then held back from the far corner. A side
 * with more ends than it has room for falls back on the even share, which at
 * least crowds them in order instead of pushing the last of them off the corner.
 */
function separate(wanted: number[], even: number[], length: number, clearances: number[]): number[] {
  const low = Math.min(MARGIN, length / 2);
  const high = Math.max(length - low, low);
  const gapAt = (index: number) => clearances[index - 1]! + clearances[index]!;
  const required = clearances.slice(1).reduce((sum, _clearance, index) => sum + gapAt(index + 1), 0);
  if (required > high - low) {
    return even;
  }
  const spaced = [...wanted];
  for (let index = 0; index < spaced.length; index += 1) {
    const floor = index === 0 ? low : spaced[index - 1]! + gapAt(index);
    spaced[index] = Math.max(spaced[index]!, floor);
  }
  for (let index = spaced.length - 1; index >= 0; index -= 1) {
    const ceiling = index === spaced.length - 1 ? high : spaced[index + 1]! - gapAt(index + 1);
    spaced[index] = Math.min(spaced[index]!, ceiling);
  }
  return spaced;
}

/** The point that far along one side of the box. */
function pointOn(rect: Rect, side: Side, along: number): Point {
  switch (side) {
    case "top":
      return { x: rect.x + along, y: rect.y };
    case "bottom":
      return { x: rect.x + along, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: rect.y + along };
    case "right":
    default:
      return { x: rect.x + rect.width, y: rect.y + along };
  }
}

function push(index: Map<string, Arrival[]>, key: string, arrival: Arrival): void {
  index.set(key, [...(index.get(key) ?? []), arrival]);
}

function note(index: Map<string, number[]>, key: string, from: Point, towards: Point): void {
  index.set(key, [...(index.get(key) ?? []), Math.atan2(towards.y - from.y, towards.x - from.x)]);
}
