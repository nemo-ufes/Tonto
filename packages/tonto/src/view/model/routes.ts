import type { ViewFile, EdgeRoute, Placement } from "./viewfile.js";
import type { ViewModel } from "./model.js";
/** Moving/resizing a card invalidates incident guides and guides through its new corridor. */
export function invalidateMovedRoutes(
  file: ViewFile,
  view: ViewModel,
  moved: Iterable<string>,
  boxes: Record<string, Placement> = file.nodes
): Record<string, EdgeRoute> {
  const changed = new Set(moved);
  const incident = new Set(
    view.edges.filter((edge) => changed.has(edge.source) || changed.has(edge.target)).map((edge) => edge.id)
  );
  const nodes = [...changed].map((id) => boxes[id]).filter(Boolean);
  const hits = (a: { x: number; y: number }, b: { x: number; y: number }, box: (typeof nodes)[number]) => {
    const left = box.x - 8,
      top = box.y - 8,
      right = box.x + (box.width ?? 160) + 8,
      bottom = box.y + (box.height ?? 60) + 8;
    let low = 0,
      high = 1;
    for (const [p, q] of [
      [-(b.x - a.x), a.x - left],
      [b.x - a.x, right - a.x],
      [-(b.y - a.y), a.y - top],
      [b.y - a.y, bottom - a.y],
    ]) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const ratio = q / p;
      if (p < 0) low = Math.max(low, ratio);
      else high = Math.min(high, ratio);
      if (low > high) return false;
    }
    return true;
  };
  return Object.fromEntries(
    Object.entries(file.edges).map(([id, route]) => {
      const corridor = route.points?.some(
        (point, index, points) => index > 0 && nodes.some((box) => hits(points[index - 1], point, box))
      );
      return [
        id,
        incident.has(id) || corridor ? { ...(route.labelOffset ? { labelOffset: route.labelOffset } : {}) } : route,
      ];
    })
  );
}
