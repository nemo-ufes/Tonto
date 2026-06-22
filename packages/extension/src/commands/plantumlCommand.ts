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
import { promptForProjectFolder } from './project-location.js';

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
    { value: 'default', label: 'Default' },
    { value: 'top-to-bottom', label: 'Top to bottom' },
    { value: 'left-to-right', label: 'Left to right' },
    { value: 'polyline', label: 'Polyline' },
    { value: 'orthogonal', label: 'Orthogonal' },
    { value: 'smetana', label: 'Smetana' },
    { value: 'elk', label: 'ELK' },
];

type PlantUMLPanelTarget =
    | { kind: 'document'; uri: vscode.Uri }
    | { kind: 'project'; uri: vscode.Uri; defaultBaseName: string; title: string };

export function registerPlantUMLCommands(context: vscode.ExtensionContext) {
    let showExternalReferences = true;
    let layoutVariant: PlantUMLLayoutVariant = 'default';
    let currentPanelTarget: PlantUMLPanelTarget | undefined;

    const getPanelState = () => ({
        showExternalReferences,
        layoutVariant,
        layoutOptions: plantUMLLayoutOptions,
    });

    const updateCurrentDiagram = async () => {
        if (!PlantUMLPanel.currentPanel || !currentPanelTarget) {
            return;
        }

        try {
            const plantuml = currentPanelTarget.kind === 'document'
                ? await buildPlantUmlForDocument(await vscode.workspace.openTextDocument(currentPanelTarget.uri), {
                    showExternalReferences,
                    layoutVariant,
                })
                : await buildPlantUmlForProject(currentPanelTarget.uri, {
                    showExternalReferences,
                    layoutVariant,
                });

            if (plantuml) {
                PlantUMLPanel.currentPanel.update(plantuml, getPanelState());
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
                const plantuml = await buildPlantUmlForDocument(document, {
                    showExternalReferences,
                    layoutVariant,
                });
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
        vscode.commands.registerCommand('tonto.diagram.plantuml.openProject', async () => {
            const folderUri = await promptForProjectFolder({
                singleWorkspacePlaceholder: 'Select the Tonto project to visualize',
                multiWorkspacePlaceholder: 'Select the Tonto project to visualize',
                openLabel: 'Select Tonto Project',
            });
            if (!folderUri) {
                return;
            }

            try {
                const plantuml = await buildPlantUmlForProject(folderUri, {
                    showExternalReferences,
                    layoutVariant,
                });
                if (!plantuml) {
                    return;
                }

                const projectName = path.basename(folderUri.fsPath) || 'ontology';
                currentPanelTarget = {
                    kind: 'project',
                    uri: folderUri,
                    defaultBaseName: `${projectName}-ontology`,
                    title: `PlantUML: ${projectName} ontology`,
                };
                PlantUMLPanel.createOrShow(context.extensionUri, plantuml, folderUri, getPanelState(), {
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
        vscode.commands.registerCommand('tonto.diagram.plantuml.toggleOrthogonalLines', async () => {
            layoutVariant = layoutVariant === 'orthogonal' ? 'default' : 'orthogonal';
            if (PlantUMLPanel.currentPanel) {
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
        vscode.commands.registerCommand('tonto.diagram.plantuml.toggleExternalRefs', async () => {
            showExternalReferences = !showExternalReferences;
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

async function buildPlantUmlForDocument(
    document: vscode.TextDocument,
    options: { showExternalReferences?: boolean; layoutVariant?: PlantUMLLayoutVariant } = {}
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
        layout: options.layoutVariant ?? 'default',
        externalReferenceModules,
    };
    const currentModule = getPrimaryContextModuleOrThrow(langiumDoc.parseResult.value as Model);

    return generatePlantUML(currentModule, plantUmlOptions);
}

async function buildPlantUmlForProject(
    folderUri: vscode.Uri,
    options: { showExternalReferences?: boolean; layoutVariant?: PlantUMLLayoutVariant } = {}
): Promise<string | undefined> {
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

    return generatePlantUML(contextModules, {
        showExternalReferences: options.showExternalReferences ?? true,
        layout: options.layoutVariant ?? 'default',
    });
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
