import * as vscode from "vscode";

const TONTO_CONFIGURATION_SECTION = "tonto";

export enum TontoFeature {
    TontoDiagramVisualization = "tontoDiagramVisualization",
}

type TontoFeatureDefinition = {
    readonly settingPath: string;
    readonly defaultValue: boolean;
};

const TONTO_FEATURE_DEFINITIONS: Record<TontoFeature, TontoFeatureDefinition> = {
    [TontoFeature.TontoDiagramVisualization]: {
        settingPath: "features.tontodiagram.enabled",
        defaultValue: false,
    },
};

export const TontoConfigurationKeys = {
    tontoDiagramVisualizationEnabled: getConfigurationKey(TontoFeature.TontoDiagramVisualization),
} as const;

export type TontoFeatureRegistration = () => vscode.Disposable | vscode.Disposable[] | void;

export class TontoFeatureToggleController implements vscode.Disposable {
    private readonly registrations = new Map<TontoFeature, TontoFeatureRegistration>();
    private readonly activeDisposables = new Map<TontoFeature, vscode.Disposable>();
    private readonly configurationChangeDisposable: vscode.Disposable;
    private disposed = false;

    constructor() {
        this.configurationChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
            for (const feature of Object.values(TontoFeature)) {
                if (event.affectsConfiguration(getConfigurationKey(feature))) {
                    this.syncFeature(feature);
                }
            }
        });
    }

    public registerFeature(feature: TontoFeature, registration: TontoFeatureRegistration): void {
        if (this.disposed) {
            return;
        }

        this.registrations.set(feature, registration);
        this.syncFeature(feature);
    }

    public isEnabled(feature: TontoFeature): boolean {
        const definition = TONTO_FEATURE_DEFINITIONS[feature];
        return vscode.workspace
            .getConfiguration(TONTO_CONFIGURATION_SECTION)
            .get<boolean>(definition.settingPath, definition.defaultValue);
    }

    public dispose(): void {
        this.disposed = true;
        this.configurationChangeDisposable.dispose();

        for (const disposable of this.activeDisposables.values()) {
            disposable.dispose();
        }

        this.activeDisposables.clear();
        this.registrations.clear();
    }

    private syncFeature(feature: TontoFeature): void {
        this.disposeFeature(feature);

        if (this.disposed || !this.isEnabled(feature)) {
            return;
        }

        const registration = this.registrations.get(feature);
        if (!registration) {
            return;
        }

        this.activeDisposables.set(feature, toDisposable(registration()));
    }

    private disposeFeature(feature: TontoFeature): void {
        const activeDisposable = this.activeDisposables.get(feature);
        if (!activeDisposable) {
            return;
        }

        activeDisposable.dispose();
        this.activeDisposables.delete(feature);
    }
}

function getConfigurationKey(feature: TontoFeature): string {
    return `${TONTO_CONFIGURATION_SECTION}.${TONTO_FEATURE_DEFINITIONS[feature].settingPath}`;
}

function toDisposable(disposables: vscode.Disposable | vscode.Disposable[] | void): vscode.Disposable {
    if (!disposables) {
        return new vscode.Disposable(() => undefined);
    }

    if (Array.isArray(disposables)) {
        return vscode.Disposable.from(...disposables);
    }

    return disposables;
}
