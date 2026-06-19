export interface TontoManifest {
    projectName: string;
    displayName: string;
    description?: string;
    publisher: string;
    version: string;
    license: string;
    dependencies: {
        [key: string]: TontoDependency;
    };
    outFolder: string;
    authors: Author[];
}

export interface Author {
    name: string;
    email?: string;
    url?: string;
}

export interface TontoDependencies {
    [name: string]: TontoDependency;
}

export interface TontoDependency {
    url: string;
    version?: string;
    directory?: string;
    branch?: string;
}

export const manifestFileName = "tonto.json";

export function toJson(manifest: TontoManifest): string {
    return JSON.stringify(manifest, null, 3);
}

export function createDefaultTontoManifest(): TontoManifest {
    return {
        projectName: "default-name",
        displayName: "Default Name",
        version: "1.0.0",
        publisher: "default publisher",
        license: "MIT",
        outFolder: "out",
        dependencies: {},
        authors: [],
    } as TontoManifest;
}
