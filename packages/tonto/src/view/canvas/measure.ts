// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * How big a card is, and what it is set in.
 *
 * Measured by estimate rather than by asking the browser, because the same
 * numbers have to come out in a webview, in a test and in the command line
 * renderer: a diagram whose boxes are one size in CI and another on screen has
 * two layouts, and the saved one would be wrong in both.
 *
 * Each preset therefore names a deliberate platform fallback stack rather than
 * `system-ui`, which resolves to unrelated faces whose measured width varied by
 * 18%. The condensed choice also asks the SVG renderer for a condensed face, so
 * its narrower estimate remains meaningful when the first named font is absent.
 *
 * The ratios below are conservative over real class names, attribute lines and
 * edge labels. Erring wide shows as a slightly roomy card and never as text
 * spilling out of one.
 */

import type { ViewNode } from "../model/index.js";
import type { DisplayOptions } from "../model/index.js";
import type { Size } from "./geometry.js";

export interface FontMetrics {
  family: string;
  kind: DisplayOptions["fontFamily"];
  stretch: "normal" | "condensed";
  cardMinWidth: number;
  cardPadding: number;
  attributeWrapWidth: number;
  scale: number;
  name: number;
  stereotype: number;
  attribute: number;
  edge: number;
  edgeStereotype: number;
}

const FONT_FAMILIES: Record<DisplayOptions["fontFamily"], string> = {
  sans: '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif',
  condensed: '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", Arial, sans-serif',
  humanist: 'Aptos, Calibri, "Segoe UI", Candara, Carlito, sans-serif',
  geometric: '"Avenir Next", Avenir, Montserrat, Futura, "Century Gothic", sans-serif',
  serif: '"Times New Roman", "Liberation Serif", Times, serif',
  book: 'Georgia, "Noto Serif", "Liberation Serif", serif',
  monospace: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

/** Conservative width relative to the Helvetica/Arial measurements below. */
const FONT_WIDTHS: Record<DisplayOptions["fontFamily"], number> = {
  sans: 1,
  condensed: 0.84,
  humanist: 0.98,
  geometric: 1.03,
  serif: 1.04,
  book: 1.08,
  monospace: 1,
};

const FONT_SCALES: Record<DisplayOptions["fontSize"], number> = {
  small: 0.88,
  medium: 1,
  large: 1.15,
};

const BASE_FONT = {
  name: 13,
  stereotype: 11,
  attribute: 12,
  edge: 11,
  /** A relation's stereotype, which sits over its name rather than beside it. */
  edgeStereotype: 9.5,
} as const;

export function fontMetrics(options: Pick<DisplayOptions, "fontFamily" | "fontSize">): FontMetrics {
  const scale = FONT_SCALES[options.fontSize];
  const scaled = (size: number) => Math.round(size * scale * 100) / 100;
  return {
    family: FONT_FAMILIES[options.fontFamily],
    kind: options.fontFamily,
    stretch: options.fontFamily === "condensed" ? "condensed" : "normal",
    cardMinWidth: options.fontFamily === "condensed" ? 72 : 108,
    cardPadding: options.fontFamily === "condensed" ? 6 : 8,
    attributeWrapWidth: options.fontFamily === "condensed" ? 132 : Number.POSITIVE_INFINITY,
    scale,
    name: scaled(BASE_FONT.name),
    stereotype: scaled(BASE_FONT.stereotype),
    attribute: scaled(BASE_FONT.attribute),
    edge: scaled(BASE_FONT.edge),
    edgeStereotype: scaled(BASE_FONT.edgeStereotype),
  };
}

export const FONT = fontMetrics({ fontFamily: "sans", fontSize: "medium" });

/** Average advance per character, as a fraction of the size. */
const ADVANCE = 0.53;
const BOLD_ADVANCE = 0.59;

/**
 * Characters are not all one width, and a diagram is full of the two extremes:
 * `[1..*]` is nearly all narrow glyphs, `«characterization»` nearly all wide
 * ones. Counting every character as average made the first far too wide and the
 * second too narrow -- which is a roomy cardinality label and a reading triangle
 * printed on the last letter of a stereotype.
 */
const NARROW = new Set([..."iljtfrI.,;:'\"!|()[]{}/\\-1 "]);
const WIDE = new Set([..."mwMW@%«»&"]);
const NARROW_FACTOR = 0.62;
const WIDE_FACTOR = 1.42;

export function textWidth(
  text: string,
  size: number,
  bold = false,
  family: DisplayOptions["fontFamily"] = "sans"
): number {
  if (family === "monospace") {
    return text.length * size * (bold ? 0.64 : 0.62);
  }
  let units = 0;
  for (const character of text) {
    units += NARROW.has(character) ? NARROW_FACTOR : WIDE.has(character) ? WIDE_FACTOR : 1;
  }
  return units * size * (bold ? BOLD_ADVANCE : ADVANCE) * FONT_WIDTHS[family];
}

export const NODE = {
  minWidth: 108,
  padding: 8,
  headerGap: 4,
  lineHeight: 17,
  stereotypeHeight: 15,
  nameHeight: 19,
} as const;

/**
 * A multiplicity as a diagram writes it, or nothing at all.
 *
 * Brackets are Tonto's textual syntax, where a multiplicity has to be told apart
 * from what surrounds it; on a diagram it stands alone at the end of a line and
 * the brackets are two more marks to read. And `1` is what an end means when it
 * says nothing, so writing it says nothing twice -- on a model of any size that
 * is a `1` beside almost every line, which is noise the reader has to look past
 * to find the multiplicities that do say something.
 */
export function multiplicityLabel(cardinality: string | undefined): string | undefined {
  if (!cardinality) {
    return undefined;
  }
  const [lower, upper] = cardinality.split("..");
  if (upper === undefined) {
    return lower === "1" ? undefined : lower;
  }
  if (lower === upper) {
    // `3..3` is three, and `1..1` is the default said twice.
    return lower === "1" ? undefined : lower;
  }
  // `0..*` and `*` are the same range; the shorter is what a diagram uses.
  return lower === "0" && upper === "*" ? "*" : `${lower}..${upper}`;
}

/** The lines of the attribute compartment, as they are drawn. */
export function attributeLines(node: ViewNode, options: DisplayOptions): string[] {
  if (options.taxonomyOnly || !options.showAttributes) {
    return [];
  }
  if (node.kind === "enumeration") {
    return node.literals ?? [];
  }
  return node.attributes.map((attribute) => {
    const flags = [
      attribute.isOrdered ? "ordered" : undefined,
      attribute.isConst ? "const" : undefined,
      attribute.isAddOnly ? "addOnly" : undefined,
      attribute.isDerived ? "derived" : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    const stereotypes = attribute.stereotypes.map((one) => `@${one}`).join(" ");
    // Brackets stay here, where UML puts them and where the multiplicity
    // has a type to be told apart from -- but an explicit `1` is the default
    // written down, and says no more on an attribute than on an end.
    const multiplicity = multiplicityLabel(attribute.cardinality);
    const cardinality = multiplicity ? ` [${multiplicity}]` : "";
    return `${stereotypes ? `${stereotypes} ` : ""}${attribute.name}: ${flags ? `${flags} ` : ""}${attribute.type}${cardinality}`;
  });
}

/** Attribute rows after wrapping at the spaces already present in Tonto. */
export function wrappedAttributeLines(
  node: ViewNode,
  options: DisplayOptions,
  maxWidth = fontMetrics(options).attributeWrapWidth
): string[] {
  const font = fontMetrics(options);
  return attributeLines(node, options).flatMap((line) => {
    const words = line.split(" ");
    const rows: string[] = [];
    let row = "";
    for (const word of words) {
      const candidate = row ? `${row} ${word}` : word;
      if (row && textWidth(candidate, font.attribute, false, font.kind) > maxWidth + 1) {
        rows.push(row);
        row = word;
      } else {
        row = candidate;
      }
    }
    if (row) {
      rows.push(row);
    }
    // A lone cardinality is visually detached from the type it qualifies.
    // Pull the preceding word onto that last row when it still fits, which
    // also gives other short final fragments a more balanced break.
    const last = rows.at(-1);
    const previous = rows.at(-2);
    if (rows.length > 1 && last && previous && !last.includes(" ")) {
      const previousWords = previous.split(" ");
      const moved = previousWords.at(-1)!;
      const balancedLast = `${moved} ${last}`;
      if (previousWords.length > 1 && textWidth(balancedLast, font.attribute, false, font.kind) <= maxWidth + 1) {
        rows[rows.length - 2] = previousWords.slice(0, -1).join(" ");
        rows[rows.length - 1] = balancedLast;
      }
    }
    return rows;
  });
}

/** The `«kind»` line, when there is one to draw. */
export function stereotypeLabel(node: ViewNode): string | undefined {
  if (node.kind === "unresolved") {
    return undefined;
  }
  const powerType = node.isPowerType ? ", powertype" : "";
  return node.stereotype ? `«${node.stereotype}${powerType}»` : undefined;
}

export function nodeLabel(node: ViewNode, options: DisplayOptions): string {
  return options.qualifyNames && node.package ? `${node.package}::${node.name}` : node.name;
}

export function sizeOf(node: ViewNode, options: DisplayOptions): Size {
  const font = fontMetrics(options);
  const label = nodeLabel(node, options);
  const stereotype = stereotypeLabel(node);
  const lines = wrappedAttributeLines(node, options, font.attributeWrapWidth);
  const width = Math.max(
    font.cardMinWidth,
    textWidth(label, font.name, true, font.kind) + font.cardPadding * 2,
    stereotype ? textWidth(stereotype, font.stereotype, false, font.kind) + font.cardPadding * 2 : 0,
    ...lines.map((line) => textWidth(line, font.attribute, false, font.kind) + font.cardPadding * 2)
  );
  const header =
    (stereotype ? NODE.stereotypeHeight * font.scale : 0) + NODE.nameHeight * font.scale + NODE.headerGap * 2;
  const body = lines.length > 0 ? lines.length * NODE.lineHeight * font.scale + NODE.headerGap * 2 : 0;
  return { width: round(width), height: round(header + body) };
}

/** Sizes stay whole numbers, so a saved layout is not a page of decimals. */
function round(value: number): number {
  return Math.round(value);
}
