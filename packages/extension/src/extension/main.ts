import * as path from "path";
import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node.js";
import { createAddGuidancesCommand } from "../commands/addGuidancesCommand.js";
import { createAddSemanticTokenColorsCommand } from "../commands/addSemanticTokenColorsCommand.js";
import { createAddSkillCommand } from "../commands/addSkillCommand.js";
import { registerTransformToAlloyCommands } from "../commands/alloyTransformCommand.js";
import { createTransformToGufoSatusBarItem } from "../commands/gufoTransformCommand.js";
import { createInitCommand } from "../commands/initCommand.js";
import { createGenerateJsonStatusBarItem } from "../commands/JsonGenerationCommands.js";
import { registerPlantUMLCommands } from "../commands/plantumlCommand.js";
import { createTontoGenerationStatusBarItem } from "../commands/TontoGenerationCommand.js";
import { createTpmInstallCommands } from "../commands/TpmInstallCommand.js";
import { createValidationSatusBarItem } from "../commands/validationCommand.js";
import { TontoFeature, TontoFeatureToggleController } from "../configuration/tonto-feature-toggles.js";
import { activateDiagram } from "../diagram/activateDiagram.js";
import { registerAutoOpenTontoDiagramPreview } from "../diagram-editor/auto-open-tontodiagram-preview.js";
import { registerCreateTontoDiagramCommand } from "../diagram-editor/create-tontodiagram-command.js";
import { registerTontoDiagramCompletionProvider } from "../diagram-editor/tontodiagram-completion-provider.js";
import { TontoDiagramEditorProvider } from "../diagram-editor/tonto-diagram-editor-provider.js";
import { registerTontoMetadataFolding } from "../editor/tonto-metadata-folding.js";
import { setOutputChannel } from "./outputChannel.js";
import { TontoLibraryFileSystemProvider } from "./TontoLibraryFileSystemProvider.js";

// Commands to show inside the `tontoCommandsExplorer` view, grouped by context
interface TontoCommandDefinition {
    id: string;
    label: string;
    icon: string;
}

interface TontoCommandGroup {
    label: string;
    icon: string;
    commands: TontoCommandDefinition[];
}

const TONTO_COMMAND_GROUPS: TontoCommandGroup[] = [
    {
        label: "Project",
        icon: "folder-library",
        commands: [
            { id: "tonto.initProject", label: "Init new Tonto project", icon: "new-folder" },
            { id: "tonto.tpm.install", label: "Install Packages (TPM)", icon: "package" },
        ],
    },
    {
        label: "Model",
        icon: "symbol-class",
        commands: [
            { id: "tonto.validateModel", label: "Validate Model", icon: "check" },
        ],
    },
    {
        label: "Transformations",
        icon: "arrow-swap",
        commands: [
            { id: "tonto.generateJSON", label: "Transform Tonto -> JSON", icon: "json" },
            { id: "tonto.generateTonto", label: "Transform JSON -> Tonto", icon: "file-code" },
            { id: "tonto.transformModel", label: "Transform Tonto -> gUFO", icon: "globe" },
        ],
    },
    {
        label: "Diagrams",
        icon: "type-hierarchy",
        commands: [
            { id: "tonto.diagram.plantuml.openProject", label: "Open Ontology PlantUML Diagram", icon: "symbol-structure" },
        ],
    },
    {
        label: "AI & LLMs",
        icon: "sparkle",
        commands: [
            { id: "tonto.addGuidances", label: "Add Guidances to project (LLMs)", icon: "book" },
            { id: "tonto.addSkill", label: "Add Tonto skill to project", icon: "lightbulb" },
        ],
    },
    {
        label: "Editor",
        icon: "settings-gear",
        commands: [
            { id: "tonto.addSemanticTokenColors", label: "Add Semantic Token Colors", icon: "symbol-color" },
            {
                id: "tonto.editor.toggleLabelAndDescriptionFolding",
                label: "Toggle Label and Description Folding",
                icon: "fold",
            },
        ],
    },
];

class TontoCommandItem extends vscode.TreeItem {
    constructor(public override readonly id: string, definition: TontoCommandDefinition) {
        super(definition.label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "tontoCommand";
        this.iconPath = new vscode.ThemeIcon(definition.icon);
        this.command = {
            command: definition.id,
            title: definition.label,
            arguments: [],
        };
    }
}

class TontoCommandGroupItem extends vscode.TreeItem {
    constructor(public readonly group: TontoCommandGroup) {
        super(group.label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "tontoCommandGroup";
        this.iconPath = new vscode.ThemeIcon(group.icon);
    }
}

type TontoCommandTreeItem = TontoCommandItem | TontoCommandGroupItem;

class TontoCommandsProvider implements vscode.TreeDataProvider<TontoCommandTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TontoCommandTreeItem | undefined | void> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<TontoCommandTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    getTreeItem(element: TontoCommandTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TontoCommandTreeItem): Thenable<TontoCommandTreeItem[]> {
        if (element instanceof TontoCommandGroupItem) {
            return Promise.resolve(element.group.commands.map(cmd => new TontoCommandItem(cmd.id, cmd)));
        }
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(TONTO_COMMAND_GROUPS.map(group => new TontoCommandGroupItem(group)));
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

let languageClient: LanguageClient;
let generateTontoStatusBarItem!: vscode.StatusBarItem;
let generateJsonStatusBarItem!: vscode.StatusBarItem;
let generateDiagramStatusBarItem!: vscode.StatusBarItem;
let validateStatusBarItem!: vscode.StatusBarItem;
let transformToGufoStatusBarItem!: vscode.StatusBarItem;
let tpmInstallStatusBarItem!: vscode.StatusBarItem;
let outputChannel!: vscode.OutputChannel;



// This function is called when the extension is activated.
export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel("Tonto logs");
    // expose this shared output channel to other modules
    setOutputChannel(outputChannel);
    TontoLibraryFileSystemProvider.register(context);
    languageClient = startLanguageClient(context);

    createInitCommand(context, outputChannel);
    createAddGuidancesCommand(context, outputChannel);
    createAddSkillCommand(context, outputChannel);
    createAddSemanticTokenColorsCommand(context, outputChannel);
    createGenerateJsonStatusBarItem(context, generateJsonStatusBarItem);
    createTontoGenerationStatusBarItem(context, generateTontoStatusBarItem);
    createValidationSatusBarItem(context, validateStatusBarItem, outputChannel);
    createTransformToGufoSatusBarItem(context, transformToGufoStatusBarItem);
    registerTransformToAlloyCommands(context);
    createTpmInstallCommands(context, tpmInstallStatusBarItem);
    registerTontoMetadataFolding(context);
    activateDiagram(context, languageClient);
    registerPlantUMLCommands(context);

    const featureToggles = new TontoFeatureToggleController();
    context.subscriptions.push(featureToggles);
    featureToggles.registerFeature(TontoFeature.TontoDiagramVisualization, () => vscode.Disposable.from(
        registerCreateTontoDiagramCommand(),
        TontoDiagramEditorProvider.register(context),
        registerAutoOpenTontoDiagramPreview(),
        registerTontoDiagramCompletionProvider(),
    ));

    // Register a TreeDataProvider for the `tontoCommandsExplorer` view so commands
    // appear as items inside the primary Sidebar view instead of as top-bar buttons.
    const commandsProvider = new TontoCommandsProvider();
    const treeView = vscode.window.createTreeView("tontoCommandsExplorer", {
        treeDataProvider: commandsProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    // Also register the same provider for the Tonto activity bar sidebar view
    // so the Commands view appears inside the `Tonto` view container.
    const treeViewSidebar = vscode.window.createTreeView("tontoCommands", {
        treeDataProvider: commandsProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeViewSidebar);

}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    if (languageClient) {
        return languageClient.stop();
    }
    validateStatusBarItem.dispose();
    generateJsonStatusBarItem.dispose();
    generateDiagramStatusBarItem.dispose();
    tpmInstallStatusBarItem.dispose();
    generateTontoStatusBarItem.dispose();
    transformToGufoStatusBarItem.dispose();
    return undefined;
}

function startLanguageClient(context: vscode.ExtensionContext): LanguageClient {
    const serverModule = context.asAbsolutePath(path.join("pack", "language", "main.cjs"));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = {
        execArgv: ["--nolazy", `--inspect${process.env.DEBUG_BREAK ? "-brk" : ""}=${process.env.DEBUG_SOCKET || "6009"}`],
    };
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions,
        },
    };

    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*.tonto");

    context.subscriptions.push(fileSystemWatcher);

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: "file", language: "tonto" }],
        synchronize: {
            // Notify the server about file changes to files contained in the workspace
            fileEvents: fileSystemWatcher,
        },
    };
    // Create the language client and start the client.
    const client = new LanguageClient("tonto", "Tonto", serverOptions, clientOptions);

    // Start the client. This will also launch the extension
    client.start();

    return client;
}
