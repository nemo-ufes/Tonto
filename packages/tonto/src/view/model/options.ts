// Adapted from Tonto Visualizer 0.1.53, MIT licensed; see THIRD-PARTY-NOTICES.md.
/**
 * The options, in two groups, because they cost different things.
 *
 * `ContentOptions` decide what is *in* the view -- which packages, whether
 * external elements are drawn at all -- so changing one re-derives the model
 * from the AST. `DisplayOptions` decide how what is there is drawn, and the
 * canvas applies them to a model it already has, which is why toggling
 * cardinalities is instant and does not disturb a hand-made arrangement.
 *
 * Both are written to the `.tontoview` file: a view is its content and its
 * appearance together, and reopening one should not need either restating.
 */

/**
 * Where a view's elements come from before anything else is decided: the
 * packages the opened file declares, or every package in the workspace.
 */
export type PackageScope = "file" | "workspace";

export interface ContentOptions {
  /**
   * Which packages the view starts from. Stored as the choice rather than as
   * the names it comes to, because the answer moves: a diagram follows the
   * editor, and a file gains and loses packages as it is written.
   */
  scope: PackageScope;
  /** Draw elements from packages outside the view that something in it points at. */
  showExternalReferences: boolean;
  /** Draw datatypes and enumerations, and the attributes typed by them. */
  showDatatypes: boolean;
  /** Draw generalization sets as a shared triangle. */
  showGensets: boolean;
  /**
   * The packages the modeller ticked by hand, which outrank the scope.
   * Absent while they have not, which is what a scope change goes back to.
   */
  includedPackages?: string[];
  /** Element ids the modeller has hidden by hand. */
  hidden?: string[];
}

/** How an edge gets from one box to the other. */
export type RoutingStyle = "straight" | "curved" | "orthogonal";
export type DiagramFontFamily = "sans" | "condensed" | "humanist" | "geometric" | "serif" | "book" | "monospace";
export type DiagramFontSize = "small" | "medium" | "large";

export interface DisplayOptions {
  /** Draw classifier names and inheritance only, preserving the other choices for later. */
  taxonomyOnly: boolean;
  /**
   * Straight by default: a direct line says "these two" at a glance, and a
   * model with many associations drawn with right angles turns into a set of
   * corridors that read as the diagram. Curved associations retain that
   * direct reading while separating nearby paths; orthogonal suits a taxonomy.
   */
  routing: RoutingStyle;
  /** Font stack used by every piece of text in the diagram. */
  fontFamily: DiagramFontFamily;
  /** A stable size preset, so saved layouts do not depend on editor zoom. */
  fontSize: DiagramFontSize;
  showAttributes: boolean;
  showCardinalities: boolean;
  showRelationNames: boolean;
  showRelationStereotypes: boolean;
  /** `subsets`, `redefines`, `const`, `addOnly` on the ends that carry them. */
  showEndDecorations: boolean;
  showRoleNames: boolean;
  /** Fill elements with their nature colour; off is monochrome. */
  showColors: boolean;
  /** Show the nature-colour key beside the canvas. */
  showLegend: boolean;
  /** Box each package. */
  showPackageGroups: boolean;
  /** Write `University::Room` rather than `Room` on the card. */
  qualifyNames: boolean;
  /** Show `///` documentation on hover. */
  showDocumentation: boolean;
}

/**
 * How the automatic arrangement is made, when it is asked for.
 *
 * Separate from the display options because it is not applied to a diagram that
 * exists: it decides where things go the first time, and again whenever the
 * modeller asks for the whole thing to be arranged.
 */
export interface LayoutOptions {
  /** Which way generalizations point. Down is what a class diagram is read as. */
  direction: "DOWN" | "RIGHT";
  /** Percentage applied to both layout gaps; larger values lengthen associations. */
  associationDistance: number;
  /** Between neighbours in a rank. */
  nodeSpacing: number;
  /** Between one rank and the next -- a supertype and its subtypes. */
  rankSpacing: number;
  /** Wrap a taxonomy level wider than this many pixels; zero leaves it unbounded. */
  maxRankSpan: number;
  /**
   * Prefer classes from one package beside one another while sharing the
   * taxonomy's ranks across packages. Turning it off lets association and
   * generalization order alone decide which classes are neighbours.
   */
  groupByPackage: boolean;
}

export const defaultLayoutOptions: LayoutOptions = {
  direction: "DOWN",
  associationDistance: 100,
  nodeSpacing: 60,
  rankSpacing: 100,
  maxRankSpan: 2000,
  groupByPackage: true,
};

/** Toolbar bounds keep dense layouts usable and spacious ones finite. */
export const ASSOCIATION_DISTANCE = { minimum: 60, maximum: 180, step: 20 } as const;

export function clampAssociationDistance(value: number): number {
  return Math.max(ASSOCIATION_DISTANCE.minimum, Math.min(ASSOCIATION_DISTANCE.maximum, Math.round(value)));
}

export const defaultContentOptions: ContentOptions = {
  scope: "file",
  showExternalReferences: true,
  showDatatypes: true,
  showGensets: true,
};

export const defaultDisplayOptions: DisplayOptions = {
  taxonomyOnly: false,
  routing: "straight",
  fontFamily: "sans",
  fontSize: "medium",
  showAttributes: true,
  showCardinalities: true,
  showRelationNames: true,
  showRelationStereotypes: true,
  showEndDecorations: true,
  showRoleNames: true,
  showColors: true,
  showLegend: false,
  showPackageGroups: true,
  qualifyNames: false,
  showDocumentation: true,
};

/**
 * The packages a view is drawn from, given what the workspace holds and what
 * the opened file declares.
 *
 * The two lists are the caller's because only it knows which file is open; the
 * rule for choosing between them is here, so it is the same rule wherever a
 * view is derived and can be read without a screen.
 */
export function packagesInScope(
  content: Pick<ContentOptions, "scope" | "includedPackages">,
  packages: { file: readonly string[]; workspace: readonly string[] }
): string[] {
  if (content.includedPackages) {
    return [...content.includedPackages];
  }
  return [...(content.scope === "workspace" ? packages.workspace : packages.file)];
}

/**
 * The content options after a change the modeller made.
 *
 * Every field is a straight overwrite except one: the packages ticked by hand
 * were ticked inside a scope and outrank it, so choosing the other scope hands
 * the ticks back to it. Keeping them would make the choice appear to do
 * nothing, which is the one way a switch between two scopes can be read wrong.
 */
export function contentAfter(content: ContentOptions, change: Partial<ContentOptions>): ContentOptions {
  const next = { ...content, ...change };
  if (change.scope !== undefined && change.scope !== content.scope) {
    delete next.includedPackages;
  }
  return next;
}
