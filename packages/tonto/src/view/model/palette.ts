// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * The palette, and nothing that needs the language.
 *
 * Kept apart from `natures.ts` so the panel can draw a legend without pulling
 * the grammar, the checks and Node's file system into a browser bundle.
 *
 * The colours are the ones the Tonto PlantUML preview uses, so a diagram drawn
 * here is recognisable to anyone who has used that one.
 */

export const COLORS = {
  GREEN: "#99FF99",
  LIGHT_GREEN: "#D3FFD3",
  PINK: "#FF99A3",
  LIGHT_PINK: "#FFDADD",
  BLUE: "#70D7FF",
  LIGHT_BLUE: "#C0EDFF",
  TEAL: "#67C3CB",
  LIGHT_TEAL: "#DDEDEE",
  WHITE: "#FFFFFF",
  YELLOW: "#FCFCD4",
  ORANGE: "#FCE0C0",
  PURPLE: "#D3D3FC",
  GREY: "#E0E0E0",
} as const;

/** The full tone, worn by the ultimate sortals. */
export const fullTone: Record<string, string> = {
  objects: COLORS.TEAL,
  "functional-complexes": COLORS.PINK,
  collectives: COLORS.PINK,
  quantities: COLORS.PINK,
  relators: COLORS.GREEN,
  qualities: COLORS.BLUE,
  "intrinsic-modes": COLORS.BLUE,
  "extrinsic-modes": COLORS.BLUE,
  events: COLORS.YELLOW,
  processes: COLORS.YELLOW,
  situations: COLORS.ORANGE,
  types: COLORS.PURPLE,
  "abstract-individuals": COLORS.WHITE,
};

/** The same hues, lighter, for everything that is not an ultimate sortal. */
export const lightTone: Record<string, string> = {
  objects: COLORS.LIGHT_TEAL,
  "functional-complexes": COLORS.LIGHT_PINK,
  collectives: COLORS.LIGHT_PINK,
  quantities: COLORS.LIGHT_PINK,
  relators: COLORS.LIGHT_GREEN,
  qualities: COLORS.LIGHT_BLUE,
  "intrinsic-modes": COLORS.LIGHT_BLUE,
  "extrinsic-modes": COLORS.LIGHT_BLUE,
  events: COLORS.YELLOW,
  processes: COLORS.YELLOW,
  situations: COLORS.ORANGE,
  types: COLORS.PURPLE,
  "abstract-individuals": COLORS.WHITE,
};

export interface NatureLegendEntry {
  color: string;
  label: string;
}

export const natureLegend: NatureLegendEntry[] = [
  { color: COLORS.TEAL, label: "Object" },
  { color: COLORS.PINK, label: "Functional complex · Collective · Quantity" },
  { color: COLORS.GREEN, label: "Relator" },
  { color: COLORS.BLUE, label: "Quality · Mode" },
  { color: COLORS.YELLOW, label: "Event · Process" },
  { color: COLORS.ORANGE, label: "Situation" },
  { color: COLORS.PURPLE, label: "Type (high-order)" },
  { color: COLORS.WHITE, label: "Abstract individual" },
  { color: COLORS.GREY, label: "Unspecified nature" },
];

export const DATATYPE_COLOR = COLORS.WHITE;
export const UNRESOLVED_COLOR = COLORS.GREY;
