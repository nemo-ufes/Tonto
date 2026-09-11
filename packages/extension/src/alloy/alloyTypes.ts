/**
 * Shapes exchanged with the Alloy server.
 *
 * Kept free of `vscode` so the pieces that only reason about data — rendering above all —
 * can be tested outside the extension host.
 */

/** The three Alloy modules a transformed Tonto project produces. */
export interface AlloyModules {
    mainModule: string
    worldStructureModule: string
    ontologicalPropertiesModule: string
}

export interface AlloyInstance {
    sessionId: string
    satisfiable: boolean
    commandName: string
    instanceNumber: number
    /** Alloy's XML for the instance. Absent when `satisfiable` is false. */
    instanceXml?: string
    /** The same instance grouped by world. Absent when `satisfiable` is false. */
    instance?: InstanceDTO
    warnings?: string[]
}

/** An instance arranged by possible world, as the server extracts it. */
export interface InstanceDTO {
    commandName: string
    instanceNumber: number
    worlds: WorldDTO[]
    /** OntoUML classes the model declares, whether or not a world populates them. */
    classes: string[]
}

export interface WorldDTO {
    id: string
    /** `CurrentWorld`, `PastWorld`, `FutureWorld` or `CounterfactualWorld`. */
    kind?: string
    /** Worlds reachable from this one. */
    next: string[]
    atoms: AtomDTO[]
    tuples: TupleDTO[]
}

export interface AtomDTO {
    id: string
    /**
     * Every OntoUML class this atom belongs to *in this world* — plural because the
     * transformation encodes classes as per-world subsets, so an endurant can be a Pessoa,
     * a Crianca and an Estudante at once. That overlap is what makes phases and roles
     * visible, so it must not be collapsed to a single type.
     */
    classes: string[]
}

export interface TupleDTO {
    relation: string
    atoms: string[]
}

export interface AlloyCommand {
    name: string
    isCheck: boolean
}
