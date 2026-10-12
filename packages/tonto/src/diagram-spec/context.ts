import { EmptyFileSystem, type LangiumDocument } from "langium";
import { URI } from "vscode-uri";
import { readFile } from "node:fs/promises";
import { getTontoProjectSourceFiles } from "../cli/utils/buildFolderDocuments.js";
import { readOrCreateDefaultTontoManifest } from "../cli/utils/readManifest.js";
import { builtInLibs } from "../language/workspace/builtins/index.js";
import path from "node:path";
import { access } from "node:fs/promises";
import { createTontoServices } from "../language/tonto-module.js";
import {
    ClassDeclaration,
    ContextModule,
    ElementRelation,
    Model,
    isClassDeclaration,
    isDataType,
    isElementRelation
} from "../language/generated/ast.js";

import { getModelContextModules } from "../language/utils/modelStatements.js";
import {
    TontoDiagramElementContext,
    TontoDiagramPackageContext,
    TontoDiagramRelationContext,
    TontoDiagramWorkspaceContext
} from "./types.js";

export type DiagramWorkspace = {
    sourceModel?: Model;
    sourcePath?: string;
    projectRoot: string;
    models: Model[];
    ontologyModels: Model[];
    issues: { message: string; severity: "error" | "warning" }[];
};

export async function loadTontoDiagramProjectWorkspace(
    diagramPath: string, overlays: ReadonlyMap<string, string> = new Map()
): Promise<DiagramWorkspace> {
    return loadTontoDiagramWorkspace(undefined, diagramPath, overlays);
}

/** Fresh linked documents prevent stale cross-file references; overlays never write to disk. */
export async function loadTontoDiagramWorkspace(
    source: string | undefined, diagramPath: string, overlays: ReadonlyMap<string, string> = new Map(), workspaceRoot?: string
): Promise<DiagramWorkspace> {
    const sourcePath = source ? resolveTontoDiagramSourcePath(source, diagramPath) : undefined;
    const projectRoot = await findTontoProjectRoot(sourcePath ? path.dirname(sourcePath) : path.dirname(diagramPath), workspaceRoot);
    const services = createTontoServices(EmptyFileSystem);
    const documents: LangiumDocument<Model>[] = [];
    for (const lib of builtInLibs) {
        documents.push(services.shared.workspace.LangiumDocumentFactory.fromString<Model>(lib.content, URI.parse(lib.uri)));
    }
    const files = await getTontoProjectSourceFiles(projectRoot, readOrCreateDefaultTontoManifest(projectRoot));
    const sources = new Map<string, string>();
    for (const file of files.sort()) sources.set(path.resolve(file), overlays.get(path.resolve(file)) ?? await readFile(file, "utf8"));
    for (const [file, text] of overlays) {
        const relative = path.relative(projectRoot, file);
        if (path.extname(file) === ".tonto" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
            sources.set(path.resolve(file), text);
        }
    }
    for (const [file, text] of sources) {
        documents.push(services.shared.workspace.LangiumDocumentFactory.fromString<Model>(text, URI.file(file)));
    }
    for (const document of documents) services.shared.workspace.LangiumDocuments.addDocument(document);
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: false });
    const issues: DiagramWorkspace["issues"] = documents.filter(document => document.uri.scheme === "file").flatMap(document => [
        ...document.parseResult.lexerErrors.map(error => ({ severity: "error" as const, message: `${document.uri.fsPath}: ${error.message}` })),
        ...document.parseResult.parserErrors.map(error => ({ severity: "error" as const, message: `${document.uri.fsPath}: ${error.message}` })),
        ...document.references.filter(reference => reference.error).map(reference => ({ severity: "error" as const, message: reference.error?.message ?? "Unresolved reference" })),
    ]);
    const models = documents.map(document => document.parseResult.value);
    return { projectRoot, sourcePath, sourceModel: models.find(model => model.$document?.uri.fsPath === sourcePath),
        models, ontologyModels: excludeBuiltInModels(models), issues };
}

export async function collectTontoDiagramWorkspaceContext(
    source: string | undefined,
    diagramPath: string
): Promise<TontoDiagramWorkspaceContext> {
    const workspace = await loadTontoDiagramWorkspace(source, diagramPath);
    const packages = collectPackages(workspace.ontologyModels);
    const elements = collectElements(workspace.ontologyModels);
    const relations = collectRelations(workspace.ontologyModels);

    return {
        sourcePath: workspace.sourcePath ?? workspace.projectRoot,
        packages,
        elements,
        relations,
    };
}

function excludeBuiltInModels(models: Model[]): Model[] {
    return models.filter((model) => model.$document?.uri.scheme !== "builtin");
}

export function buildTontoDiagramWorkspaceContext(models: Model[], sourcePath: string): TontoDiagramWorkspaceContext {
    return {
        sourcePath,
        packages: collectPackages(models),
        elements: collectElements(models),
        relations: collectRelations(models),
    };
}

export function resolveRequestedPackages(models: Model[], requestedPackages: string[]): {
    missing: string[];
    packages: ContextModule[];
} {
    const modulesByName = new Map<string, ContextModule>();

    for (const model of models) {
        for (const contextModule of getModelContextModules(model)) {
            modulesByName.set(contextModule.name, contextModule);
        }
    }

    const packages: ContextModule[] = [];
    const missing: string[] = [];

    for (const packageName of requestedPackages) {
        const contextModule = modulesByName.get(packageName);
        if (!contextModule) {
            missing.push(packageName);
            continue;
        }
        packages.push(contextModule);
    }

    return {
        missing,
        packages,
    };
}

export function resolveTontoDiagramSourcePath(source: string, diagramPath: string): string {
    return path.resolve(path.dirname(diagramPath), source);
}

function collectPackages(models: Model[]): TontoDiagramPackageContext[] {
    const packages = new Map<string, TontoDiagramPackageContext>();

    for (const model of models) {
        for (const contextModule of getModelContextModules(model)) {
            packages.set(contextModule.name, {
                name: contextModule.name,
                sourcePath: model.$document?.uri.fsPath ?? "",
            });
        }
    }

    return [...packages.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function collectElements(models: Model[]): TontoDiagramElementContext[] {
    const elements = new Map<string, TontoDiagramElementContext>();

    for (const model of models) {
        for (const contextModule of getModelContextModules(model)) {
            for (const declaration of contextModule.declarations) {
                if (isClassDeclaration(declaration)) {
                    addElement(elements, declaration.name, contextModule.name, "class");
                } else if (isDataType(declaration)) {
                    addElement(elements, declaration.name, contextModule.name, "datatype");
                }
            }
        }
    }

    return [...elements.values()].sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName));
}

function addElement(
    elements: Map<string, TontoDiagramElementContext>,
    name: string,
    packageName: string,
    kind: TontoDiagramElementContext["kind"]
): void {
    const qualifiedName = `${packageName}.${name}`;
    elements.set(qualifiedName, {
        name,
        qualifiedName,
        packageName,
        kind,
    });
}

function collectRelations(models: Model[]): TontoDiagramRelationContext[] {
    const relations = new Map<string, TontoDiagramRelationContext>();

    for (const model of models) {
        for (const contextModule of getModelContextModules(model)) {
            for (const declaration of contextModule.declarations) {
                if (isClassDeclaration(declaration)) {
                    for (const relation of declaration.references) {
                        addRelation(relations, relation, declaration, contextModule);
                    }
                } else if (isElementRelation(declaration)) {
                    addRelation(relations, declaration, undefined, contextModule);
                }
            }
        }
    }

    return [...relations.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function addRelation(
    relations: Map<string, TontoDiagramRelationContext>,
    relation: ElementRelation,
    owningDeclaration: ClassDeclaration | undefined,
    owningPackage: ContextModule
): void {
    const sourceElement = relation.firstEnd?.ref ?? owningDeclaration;
    const targetElement = relation.secondEnd.ref;

    if ((!sourceElement || !targetElement) || (!isClassDeclaration(sourceElement) && !isDataType(sourceElement)) || (!isClassDeclaration(targetElement) && !isDataType(targetElement))) {
        return;
    }

    const source = `${sourceElement.$container.name}.${sourceElement.name}`;
    const target = `${targetElement.$container.name}.${targetElement.name}`;
    const id = `${source}::${relation.name ?? relation.relationType ?? "unnamed"}::${target}`;

    relations.set(id, {
        id,
        name: relation.name,
        packageName: owningPackage.name,
        source,
        target,
        stereotype: relation.relationType,
    });
}

async function findTontoProjectRoot(startDirectory: string, fallbackDirectory = startDirectory): Promise<string> {
    let currentDirectory = path.resolve(startDirectory);

    while (true) {
        const manifestPath = path.join(currentDirectory, "tonto.json");
        try {
            await access(manifestPath);
            return currentDirectory;
        } catch {
            const parentDirectory = path.dirname(currentDirectory);
            if (parentDirectory === currentDirectory) {
                return fallbackDirectory;
            }
            currentDirectory = parentDirectory;
        }
    }
}
