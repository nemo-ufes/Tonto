/** Serializable graph boundary. This module deliberately has no language or filesystem dependencies. */
export interface SourceLocation {
  uri: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
}
export interface ViewAttribute {
  name: string;
  type: string;
  cardinality?: string;
  stereotypes: string[];
  isOrdered?: boolean;
  isConst?: boolean;
  isAddOnly?: boolean;
  isDerived?: boolean;
}
export interface ViewNode {
  id: string;
  kind: "class" | "datatype" | "enumeration" | "unresolved";
  name: string;
  package?: string;
  stereotype?: string;
  color: string;
  isExternal?: boolean;
  isPowerType?: boolean;
  attributes: ViewAttribute[];
  literals?: string[];
  documentation?: string;
  source?: SourceLocation;
  natures?: { natures: string[]; origin?: string; from?: string };
}
export interface ViewRelationEnd {
  cardinality?: string;
  role?: string;
  isConst?: boolean;
  isAddOnly?: boolean;
  subsets?: string;
  redefines?: string;
  isWhole?: boolean;
}
interface Edge {
  id: string;
  source: string;
  target: string;
  documentation?: string;
  source_?: SourceLocation;
}
export interface ViewRelation extends Edge {
  kind: "relation";
  name?: string;
  stereotype?: string;
  sourceEnd: ViewRelationEnd;
  targetEnd: ViewRelationEnd;
  whole?: "source" | "target";
  composition?: boolean;
  inverseOf?: string;
  derivedFrom?: string[];
}
export interface ViewGeneralization extends Edge {
  kind: "generalization";
  genset?: string;
}
export interface ViewInstantiation extends Edge {
  kind: "instantiation";
}
export type ViewEdge = ViewRelation | ViewGeneralization | ViewInstantiation;
export interface ViewGroup {
  id: string;
  name: string;
  nodes: string[];
}
export interface ViewGenset {
  id: string;
  name: string;
  general?: string;
  specifics: string[];
  disjoint: boolean;
  complete: boolean;
  source?: SourceLocation;
}
export interface ViewModel {
  nodes: ViewNode[];
  edges: ViewEdge[];
  groups: ViewGroup[];
  gensets: ViewGenset[];
}
