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
    warnings?: string[]
}

export interface AlloyCommand {
    name: string
    isCheck: boolean
}
