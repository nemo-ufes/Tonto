export type TontoDiagramProjectManifest = {
    displayName?: string;
    projectName?: string;
};

export function createEntireOntologyDiagramTemplate(projectName: string): string {
    return `diagram "${normalizeDiagramTitle(projectName)} Ontology" {
  direction TB
  stereotypes true
  attributes true
  external false
  datatypes true
}
`;
}

export function getTontoDiagramProjectName(manifestText: string, fallbackName: string): string {
    try {
        const manifest = JSON.parse(manifestText) as TontoDiagramProjectManifest;
        return firstNonEmpty(manifest.displayName, manifest.projectName, fallbackName);
    } catch {
        return fallbackName;
    }
}

function firstNonEmpty(...values: Array<string | undefined>): string {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) {
            return trimmed;
        }
    }

    return "Tonto";
}

function normalizeDiagramTitle(value: string): string {
    return value.trim().replace(/\s+/g, " ").replace(/"/g, "'");
}
