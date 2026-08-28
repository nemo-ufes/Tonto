import * as vscode from "vscode";
import { renderInstance } from "./alloyInstanceView.js";
import { AlloyLspClient } from "./alloyLspClient.js";
import { AlloyInstance } from "./alloyTypes.js";

/**
 * A webview showing one Alloy session, with a button to step to the next instance.
 *
 * <p>The panel owns the session: closing it releases the session on the server. Without that
 * the server would hold the solver state of every model a user ever looked at, until the idle
 * sweep got to it.
 */
export class AlloyInstancePanel {

    private readonly panel: vscode.WebviewPanel;
    private disposed = false;

    private constructor(
        private readonly client: AlloyLspClient,
        private readonly sessionId: string,
        title: string
    ) {
        this.panel = vscode.window.createWebviewPanel(
            "tonto.alloyInstance",
            title,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.onDidReceiveMessage((message: { command?: string }) => {
            if (message?.command === "next") {
                void this.showNext();
            }
        });

        this.panel.onDidDispose(() => {
            this.disposed = true;
            void this.client.closeSession(this.sessionId);
        });
    }

    static show(client: AlloyLspClient, instance: AlloyInstance, projectName: string): AlloyInstancePanel {
        const panel = new AlloyInstancePanel(client, instance.sessionId, `Alloy — ${projectName}`);
        panel.render(instance);
        return panel;
    }

    private async showNext(): Promise<void> {
        try {
            const instance = await this.client.nextInstance(this.sessionId);
            if (!this.disposed) {
                this.render(instance);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Could not generate the next instance: ${message}`);
        }
    }

    private render(instance: AlloyInstance): void {
        this.panel.webview.html = renderInstance(instance);
    }
}
