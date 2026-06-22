import { NodeFileSystem } from "langium/node";
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
import { buildFolderDocuments } from "../cli/utils/buildFolderDocuments.js";
import { getModelContextModules } from "../language/utils/modelStatements.js";
import {
    TontoDiagramElementContext,
    TontoDiagramPackageContext,
    TontoDiagramRelationContext,
    TontoDiagramWorkspaceContext
} from "./types.js";

type DiagramWorkspace = {
    sourceModel?: Model;
    sourcePath?: string;
    projectRoot: string;
    models: Model[];
};

export async function loadTontoDiagramProjectWorkspace(diagramPath: string): Promise<DiagramWorkspace> {
    const projectRoot = await findTontoProjectRoot(path.dirname(diagramPath));
    const services = createTontoServices({ ...NodeFileSystem }).Tonto;
    const builtDocuments = await buildFolderDocuments(projectRoot, services, { validation: false });

    return {
        projectRoot,
        models: builtDocuments.models,
    };
}

export async function loadTontoDiagramWorkspace(source: string | undefined, diagramPath: string): Promise<DiagramWorkspace> {
    if (!source) {
        return loadTontoDiagramProjectWorkspace(diagramPath);
    }

    const sourcePath = resolveTontoDiagramSourcePath(source, diagramPath);
    const projectRoot = await findTontoProjectRoot(path.dirname(sourcePath));
    const services = createTontoServices({ ...NodeFileSystem }).Tonto;
    const builtDocuments = await buildFolderDocuments(projectRoot, services, { validation: false });
    const sourceModel = builtDocuments.models.find((model) => model.$document?.uri.fsPath === sourcePath);

    if (!sourceModel) {
        return {
            projectRoot,
            models: builtDocuments.models,
        };
    }

    return {
        sourceModel,
        sourcePath,
        projectRoot,
        models: builtDocuments.models,
    };
}

export async function collectTontoDiagramWorkspaceContext(
    source: string | undefined,
    diagramPath: string
): Promise<TontoDiagramWorkspaceContext> {
    const workspace = await loadTontoDiagramWorkspace(source, diagramPath);
    const packages = collectPackages(workspace.models);
    const elements = collectElements(workspace.models);
    const relations = collectRelations(workspace.models);

    return {
        sourcePath: workspace.sourcePath ?? workspace.projectRoot,
        packages,
        elements,
        relations,
    };
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

async function findTontoProjectRoot(startDirectory: string): Promise<string> {
    let currentDirectory = path.resolve(startDirectory);

    while (true) {
        const manifestPath = path.join(currentDirectory, "tonto.json");
        try {
            await access(manifestPath);
            return currentDirectory;
        } catch {
            const parentDirectory = path.dirname(currentDirectory);
            if (parentDirectory === currentDirectory) {
                return startDirectory;
            }
            currentDirectory = parentDirectory;
        }
    }
}
