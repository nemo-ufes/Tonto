/** The inspected visualizer groups inverse/parallel declarations under one filter. */
export interface FilterItem {
  kind: "class" | "association";
  label: string;
  ids: string[];
}
