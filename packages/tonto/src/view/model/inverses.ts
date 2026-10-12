// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
import type { ViewEdge, ViewRelation } from "./model.js";

export interface InversePairs {
  /** The half not drawn or sent to layout. */
  covered: Set<string>;
  /** The covered half, keyed by the deterministic half that represents it. */
  partnerOf: Map<string, ViewRelation>;
  /** The other declaration, keyed in both directions. */
  pairedWith: Map<string, string>;
}

/**
 * Gives every consumer the same identity for an inverse association.
 *
 * Only mutually linked relations form a pair. This makes an invalid or
 * ambiguous inverse claim remain two visible edges instead of silently hiding
 * one of the declarations. The lexically smaller stable id represents a valid
 * pair, so saved routes and layout stay stable when source files move around.
 */
export function inversePairs(edges: readonly ViewEdge[]): InversePairs {
  const relations = new Map<string, ViewRelation>();
  for (const edge of edges) {
    if (edge.kind === "relation") {
      relations.set(edge.id, edge);
    }
  }

  const covered = new Set<string>();
  const partnerOf = new Map<string, ViewRelation>();
  const pairedWith = new Map<string, string>();
  for (const edge of relations.values()) {
    const other = edge.inverseOf ? relations.get(edge.inverseOf) : undefined;
    if (!other || other.inverseOf !== edge.id || other.id === edge.id || edge.id > other.id) {
      continue;
    }
    covered.add(other.id);
    partnerOf.set(edge.id, other);
    pairedWith.set(edge.id, other.id);
    pairedWith.set(other.id, edge.id);
  }
  return { covered, partnerOf, pairedWith };
}

/** A line-level action on either reading applies to the whole association. */
export function expandInverseIds(edges: readonly ViewEdge[], ids: Iterable<string>): string[] {
  const pairs = inversePairs(edges).pairedWith;
  const expanded = new Set<string>();
  for (const id of ids) {
    expanded.add(id);
    const partner = pairs.get(id);
    if (partner) {
      expanded.add(partner);
    }
  }
  return [...expanded];
}
