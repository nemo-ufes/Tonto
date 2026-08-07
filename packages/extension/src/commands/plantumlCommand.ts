import { NodeFileSystem } from 'langium/node';
import * as path from 'node:path';
import {
    buildFolderDocuments,
    createTontoServices,
    formatJsonGenerationErrorMessage,
    generatePlantUML,
    getJsonGenerationDocumentErrorInfos,
    getModelContextModules,
    getPrimaryContextModuleOrThrow,
    isModel,
    Model,
} from 'tonto-cli';
import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { PlantUMLPanel } from '../diagram/plantuml-webview.js';
import { promptForProjectFolder, resolveCommandFolderFromContext } from './project-location.js';

type TontoServices = ReturnType<typeof createTontoServices>["Tonto"];
type PlantUMLLayoutVariant =
    | 'default'
    | 'top-to-bottom'
    | 'left-to-right'
    | 'polyline'
    | 'orthogonal'
    | 'smetana'
    | 'elk';

const plantUMLLayoutOptions: Array<{ value: PlantUMLLayoutVariant; label: string }> = [
    { value: 'orthogonal', label: 'Orthogonal' },
    { value: 'default', label: 'Default' },
    { value: 'top-to-bottom', label: 'Top to bottom' },
    { value: 'left-to-right', label: 'Left to right' },
    { value: 'polyline', label: 'Polyline' },
    { value: 'smetana', label: 'Smetana' },
    { value: 'elk', label: 'ELK' },
];

type PlantUMLSpacing = 'compact' | 'cozy' | 'spacious';

const plantUMLSpacingOptions: Array<{ value: PlantUMLSpacing; label: string }> = [
    { value: 'compact', label: 'Compact' },
    { value: 'cozy', label: 'Cozy' },
    { value: 'spacious', label: 'Spacious' },
];

function isPlantUMLSpacing(value: unknown): value is PlantUMLSpacing {
    return typeof value === 'string' && plantUMLSpacingOptions.some((option) => option.value === value);
}

type PlantUMLPanelTarget =
    | { kind: 'document'; uri: vscode.Uri }
    | { kind: 'project'; uri: vscode.Uri; defaultBaseName: string; title: string };

type PlantUMLBooleanOption =
    | 'showExternalReferences'
    | 'showPackageNames'
    | 'showPackageNamesInCards'
    | 'groupExternalPackages'
    | 'showAttributes'
    | 'showCardinalities'
    | 'showRelationNames'
    | 'showColors'
    | 'sizeByDegree';

const defaultBooleanOptions: Record<PlantUMLBooleanOption, boolean> = {
    showExternalReferences: true,
    showPackageNames: true,
    showPackageNamesInCards: true,
    groupExternalPackages: true,
    showAttributes: true,
    showCardinalities: true,
    showRelationNames: true,
    showColors: true,
    sizeByDegree: true,
};

const defaultLayoutVariant: PlantUMLLayoutVariant = 'orthogonal';
const defaultSpacing: PlantUMLSpacing = 'cozy';

function isPlantUMLBooleanOption(value: unknown): value is PlantUMLBooleanOption {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(defaultBooleanOptions, value);
}

export function registerPlantUMLCommands(context: vscode.ExtensionContext) {
    const booleanOptions: Record<PlantUMLBooleanOption, boolean> = { ...defaultBooleanOptions };
    let layoutVariant: PlantUMLLayoutVariant = defaultLayoutVariant;
    let spacing: PlantUMLSpacing = defaultSpacing;
    let currentPanelTarget: PlantUMLPanelTarget | undefined;
    let availablePackageNames: string[] = [];
    let selectedPackageNames = new Set<string>();

    const getGeneratorOptions = () => ({
        ...booleanOptions,
        layoutVariant,
        spacing,
        includedPackageNames: currentPanelTarget?.kind === 'project'
            ? Array.from(selectedPackageNames)
            : undefined,
    });

    const getPanelState = () => ({
        ...booleanOptions,
        layoutVariant,
        layoutOptions: plantUMLLayoutOptions,
        spacing,
        spacingOptions: plantUMLSpacingOptions,
        availablePackageNames,
        selectedPackageNames: Array.from(selectedPackageNames),
    });

    const updateCurrentDiagram = async () => {
        if (!PlantUMLPanel.currentPanel || !currentPanelTarget) {
            return;
        }

        try {
            if (currentPanelTarget.kind === 'document') {
                const plantuml = await buildPlantUmlForDocument(
                    await vscode.workspace.openTextDocument(currentPanelTarget.uri),
                    getGeneratorOptions()
                );
                if (plantuml) {
                    PlantUMLPanel.currentPanel.update(plantuml, getPanelState());
                }
                return;
            }

            const result = await buildPlantUmlForProject(currentPanelTarget.uri, getGeneratorOptions());
            if (result) {
                availablePackageNames = result.packageNames;
                PlantUMLPanel.currentPanel.update(result.plantuml, getPanelState());
            }
        } catch (e) {
            console.error('Error updating diagram:', e);
        }
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('tonto.diagram.plantuml.open', async () => {
            const document = getActiveTontoDocument();
            if (!document) {
                return;
            }

            try {
                currentPanelTarget = undefined;
                availablePackageNames = [];
                selectedPackageNames = new Set();
                const plantuml = await buildPlantUmlForDocument(document, getGeneratorOptions());
                if (!plantuml) {
                    vscode.window.showErrorMessage('Please fix syntax errors before generating diagram.');
                    return;
                }

                PlantUMLPanel.createOrShow(context.extensionUri, plantuml, document.uri, getPanelState());
                currentPanelTarget = { kind: 'document', uri: document.uri };
            } catch (e) {
                console.error(e);
                vscode.window.showErrorMessage('Error generating diagram: ' + e);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tonto.diagram.plantuml.openProject', async (resource?: vscode.Uri) => {
            const folderUri = resource
                ? await resolveCommandFolderFromContext({
                    uri: resource,
                    missingContextMessage: 'Select a Tonto project or file to visualize.',
                })
                : await promptForProjectFolder({
                    singleWorkspacePlaceholder: 'Select the Tonto project to visualize',
                    multiWorkspacePlaceholder: 'Select the Tonto project to visualize',
                    openLabel: 'Select Tonto Project',
                });
            if (!folderUri) {
                return;
            }

            try {
                currentPanelTarget = undefined;
                availablePackageNames = [];
                selectedPackageNames = new Set();
                const result = await buildPlantUmlForProject(folderUri, getGeneratorOptions());
                if (!result) {
                    return;
                }

                availablePackageNames = result.packageNames;
                selectedPackageNames = new Set(result.packageNames);

                const projectName = path.basename(folderUri.fsPath) || 'ontology';
                currentPanelTarget = {
                    kind: 'project',
                    uri: folderUri,
                    defaultBaseName: `${projectName}-ontology`,
                    title: `PlantUML: ${projectName} ontology`,
                };
                PlantUMLPanel.createOrShow(context.extensionUri, result.plantuml, folderUri, getPanelState(), {
                    defaultBaseName: currentPanelTarget.defaultBaseName,
                    defaultSaveDirectory: folderUri,
                    title: currentPanelTarget.title,
                });
            } catch (e) {
                console.error(e);
                vscode.window.showErrorMessage('Error generating ontology diagram: ' + formatPlantUMLErrorMessage(e), { modal: true });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tonto.diagram.plantuml.setVisiblePackages', async (packageNames: unknown) => {
            if (!Array.isArray(packageNames) || !packageNames.every((packageName) => typeof packageName === 'string')) {
                return;
            }

            const available = new Set(availablePackageNames);
            selectedPackageNames = new Set(packageNames.filter((packageName) => available.has(packageName)));
            if (PlantUMLPanel.currentPanel && currentPanelTarget?.kind === 'project') {
                await updateCurrentDiagram();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tonto.diagram.plantuml.setLayoutVariant', async (nextLayoutVariant: PlantUMLLayoutVariant) => {
            if (!isPlantUMLLayoutVariant(nextLayoutVariant)) {
                return;
            }

            layoutVariant = nextLayoutVariant;
            if (PlantUMLPanel.currentPanel) {
                await updateCurrentDiagram();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tonto.diagram.plantuml.setSpacing', async (nextSpacing: unknown) => {
            if (!isPlantUMLSpacing(nextSpacing)) {
                return;
            }

            spacing = nextSpacing;
            if (PlantUMLPanel.currentPanel) {
                await updateCurrentDiagram();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tonto.diagram.plantuml.setOption', async (key: unknown, value: unknown) => {
            if (!isPlantUMLBooleanOption(key)) {
                return;
            }

            booleanOptions[key] = Boolean(value);
            if (PlantUMLPanel.currentPanel) {
                await updateCurrentDiagram();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tonto.diagram.plantuml.resetOptions', async () => {
            Object.assign(booleanOptions, defaultBooleanOptions);
            selectedPackageNames = new Set(availablePackageNames);
            layoutVariant = defaultLayoutVariant;
            spacing = defaultSpacing;
            if (PlantUMLPanel.currentPanel) {
                await updateCurrentDiagram();
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.languageId !== 'tonto' || !PlantUMLPanel.currentPanel || !currentPanelTarget) {
                return;
            }

            if (currentPanelTarget.kind === 'document' && currentPanelTarget.uri.toString() === document.uri.toString()) {
                await updateCurrentDiagram();
                return;
            }

            if (currentPanelTarget.kind === 'project' && isUriInsideFolder(document.uri, currentPanelTarget.uri)) {
                await updateCurrentDiagram();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tonto.diagram.plantuml.export', async () => {
            const document = getActiveTontoDocument();
            if (!document) {
                return;
            }

            try {
                const plantuml = await buildPlantUmlForDocument(document);
                if (!plantuml) {
                    vscode.window.showErrorMessage('Please fix syntax errors before exporting.');
                    return;
                }

                const fileUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(document.uri.fsPath.replace('.tonto', '.puml')),
                    filters: {
                        'PlantUML': ['puml']
                    }
                });

                if (fileUri) {
                    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(plantuml, 'utf8'));
                    vscode.window.showInformationMessage(`Exported PlantUML to ${fileUri.fsPath}`);
                }
            } catch (e) {
                console.error(e);
                vscode.window.showErrorMessage('Error exporting diagram: ' + e);
            }
        })
    );
}

function getActiveTontoDocument(): vscode.TextDocument | undefined {
    const document = vscode.window.activeTextEditor?.document;
    if (!document) {
        vscode.window.showErrorMessage('No active Tonto editor found.');
        return undefined;
    }

    if (document.languageId !== 'tonto') {
        vscode.window.showErrorMessage('Active file is not a Tonto file.');
        return undefined;
    }

    return document;
}

interface PlantUMLBuildOptions {
    showExternalReferences?: boolean;
    showPackageNames?: boolean;
    showPackageNamesInCards?: boolean;
    groupExternalPackages?: boolean;
    showAttributes?: boolean;
    showCardinalities?: boolean;
    showRelationNames?: boolean;
    showColors?: boolean;
    sizeByDegree?: boolean;
    layoutVariant?: PlantUMLLayoutVariant;
    spacing?: PlantUMLSpacing;
    includedPackageNames?: string[];
}

interface PlantUMLProjectBuildResult {
    packageNames: string[];
    plantuml: string;
}

async function buildPlantUmlForDocument(
    document: vscode.TextDocument,
    options: PlantUMLBuildOptions = {}
): Promise<string | undefined> {
    const services = createTontoServices(NodeFileSystem).Tonto;
    const langiumDocuments = services.shared.workspace.LangiumDocuments;
    const documentBuilder = services.shared.workspace.DocumentBuilder;
    const currentUri = URI.parse(document.uri.toString());
    const langiumDoc = await services.shared.workspace.LangiumDocumentFactory.fromString(
        document.getText(),
        currentUri
    );
    langiumDocuments.addDocument(langiumDoc);

    await loadWorkspaceTontoDocuments(services, currentUri);
    await documentBuilder.build(langiumDocuments.all.toArray());

    if (langiumDoc.parseResult.parserErrors.length > 0) {
        return undefined;
    }

    const externalReferenceModules = langiumDocuments.all
        .flatMap((workspaceDocument) => getModelContextModules(workspaceDocument.parseResult.value as Model))
        .toArray();
    const plantUmlOptions = {
        showExternalReferences: options.showExternalReferences ?? true,
        showPackageNames: options.showPackageNames ?? true,
        showPackageNamesInCards: options.showPackageNamesInCards ?? true,
        groupExternalPackages: options.groupExternalPackages ?? true,
        showAttributes: options.showAttributes ?? true,
        showCardinalities: options.showCardinalities ?? true,
        showRelationNames: options.showRelationNames ?? true,
        showColors: options.showColors ?? true,
        sizeByDegree: options.sizeByDegree ?? true,
        layout: options.layoutVariant ?? defaultLayoutVariant,
        spacing: options.spacing ?? defaultSpacing,
        externalReferenceModules,
    };
    const currentModule = getPrimaryContextModuleOrThrow(langiumDoc.parseResult.value as Model);

    return generatePlantUML(currentModule, plantUmlOptions);
}

async function buildPlantUmlForProject(
    folderUri: vscode.Uri,
    options: PlantUMLBuildOptions = {}
): Promise<PlantUMLProjectBuildResult | undefined> {
    const services = createTontoServices(NodeFileSystem).Tonto;
    const { allFiles, documents } = await buildFolderDocuments(folderUri.fsPath, services, {
        validation: true,
    });

    if (allFiles.length === 0) {
        vscode.window.showErrorMessage('No Tonto source files found in the selected project.');
        return undefined;
    }

    const diagnosticInfos = getJsonGenerationDocumentErrorInfos(documents);
    if (diagnosticInfos.length > 0) {
        vscode.window.showErrorMessage('Please fix syntax or validation errors before generating the ontology diagram.');
        return undefined;
    }

    const sourceFilePaths = new Set(allFiles.map((filePath) => path.resolve(filePath)));
    const contextModules = documents.all
        .filter((workspaceDocument) => workspaceDocument.uri.scheme === 'file' && sourceFilePaths.has(path.resolve(workspaceDocument.uri.fsPath)))
        .map((workspaceDocument) => workspaceDocument.parseResult.value)
        .filter(isModel)
        .flatMap(getModelContextModules)
        .toArray();

    if (contextModules.length === 0) {
        vscode.window.showErrorMessage('No package declarations found in the selected project.');
        return undefined;
    }

    const packageNames = Array.from(new Set(contextModules.map((contextModule) => contextModule.name)))
        .sort((left, right) => left.localeCompare(right));
    const plantuml = generatePlantUML(contextModules, {
        showExternalReferences: options.showExternalReferences ?? true,
        showPackageNames: options.showPackageNames ?? true,
        showPackageNamesInCards: options.showPackageNamesInCards ?? true,
        groupExternalPackages: options.groupExternalPackages ?? true,
        showAttributes: options.showAttributes ?? true,
        showCardinalities: options.showCardinalities ?? true,
        showRelationNames: options.showRelationNames ?? true,
        showColors: options.showColors ?? true,
        sizeByDegree: options.sizeByDegree ?? true,
        layout: options.layoutVariant ?? defaultLayoutVariant,
        spacing: options.spacing ?? defaultSpacing,
        includedPackageNames: options.includedPackageNames,
    });

    return { packageNames, plantuml };
}

function isPlantUMLLayoutVariant(value: unknown): value is PlantUMLLayoutVariant {
    return typeof value === 'string' && plantUMLLayoutOptions.some((option) => option.value === value);
}

async function loadWorkspaceTontoDocuments(
    services: TontoServices,
    currentUri: URI
): Promise<void> {
    const tontoFiles = await vscode.workspace.findFiles(
        '**/*.tonto',
        '**/{node_modules,out,dist,pack,build}/**'
    );
    for (const file of tontoFiles) {
        const fileUri = URI.parse(file.toString());
        if (fileUri.toString() === currentUri.toString()) {
            continue;
        }

        const bytes = await vscode.workspace.fs.readFile(file);
        const workspaceDocument = services.shared.workspace.LangiumDocumentFactory.fromString(
            Buffer.from(bytes).toString("utf8"),
            fileUri
        );
        services.shared.workspace.LangiumDocuments.addDocument(workspaceDocument);
    }
}

function isUriInsideFolder(uri: vscode.Uri, folderUri: vscode.Uri): boolean {
    if (uri.scheme !== 'file' || folderUri.scheme !== 'file') {
        return uri.toString().startsWith(folderUri.toString());
    }

    const relativePath = path.relative(folderUri.fsPath, uri.fsPath);
    return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function formatPlantUMLErrorMessage(error: unknown): string {
    try {
        return formatJsonGenerationErrorMessage(error);
    } catch {
        return error instanceof Error ? error.message : String(error);
    }
}
