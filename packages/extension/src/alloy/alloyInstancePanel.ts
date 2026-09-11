import * as fs from "node:fs";
import * as vscode from "vscode";
import { createNonce, renderInstance, toPayload } from "./alloyInstanceView.js";
import { AlloyLspClient } from "./alloyLspClient.js";
import { AlloyInstance } from "./alloyTypes.js";

/**
 * A webview showing one Alloy session as a graph per possible world, with a button to step to
 * the next instance.
 *
 * <p>The panel owns the session: closing it releases the session on the server. Without that
 * the server would hold the solver state of every model a user ever looked at, until the idle
 * sweep got to it.
 */
export class AlloyInstancePanel {

    private readonly panel: vscode.WebviewPanel;
    private disposed = false;

    private constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly client: AlloyLspClient,
        private readonly output: vscode.OutputChannel,
        private readonly sessionId: string,
        title: string
    ) {
        this.panel = vscode.window.createWebviewPanel(
            "tonto.alloyInstance",
            title,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                // The graph script is the only thing loaded from disk; nothing else in the
                // extension needs to be reachable from the webview.
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "pack", "webview")],
            }
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

    static show(
        context: vscode.ExtensionContext,
        client: AlloyLspClient,
        output: vscode.OutputChannel,
        instance: AlloyInstance,
        projectName: string
    ): AlloyInstancePanel {
        const panel = new AlloyInstancePanel(
            context, client, output, instance.sessionId, `Alloy — ${projectName}`);
        panel.renderFull(instance);
        return panel;
    }

    private async showNext(): Promise<void> {
        try {
            const instance = await this.client.nextInstance(this.sessionId);
            if (this.disposed) {
                return;
            }
            // Posting the new instance rather than rebuilding the page keeps the tab layout
            // and the loaded script in place, so stepping does not flash the whole view.
            void this.panel.webview.postMessage({ instance: toPayload(instance) });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Could not generate the next instance: ${message}`);
        }
    }

    private renderFull(instance: AlloyInstance): void {
        const scriptPath = vscode.Uri.joinPath(
            this.context.extensionUri, "pack", "webview", "alloyGraph.js");

        this.panel.webview.html = renderInstance(
            instance,
            this.scriptUri(scriptPath),
            createNonce()
        );

        const payload = toPayload(instance);
        const issues = payload.worlds.reduce(
            (total, world) => total + world.nodes.filter((node) => node.issues.length > 0).length, 0);
        this.output.appendLine(
            `Instance ${instance.instanceNumber}: ${payload.worlds.length} world(s), `
            + `${payload.worlds.reduce((total, world) => total + world.nodes.length, 0)} endurant(s), `
            + `${payload.worlds.reduce((total, world) => total + world.edges.length, 0)} relation(s), `
            + `${issues} constraint issue(s)`);
    }

    /**
     * Appends the script's modification time to its URI.
     *
     * Webview resources are cached by URI, and a rebuild leaves the path unchanged — so the
     * page keeps running the script it loaded the first time, however many times the window
     * is reloaded. That is invisible: the HTML updates and the script does not.
     */
    private scriptUri(scriptPath: vscode.Uri): string {
        const uri = this.panel.webview.asWebviewUri(scriptPath).toString();
        let version = Date.now();
        try {
            version = fs.statSync(scriptPath.fsPath).mtimeMs;
        } catch {
            // Falling back to now only costs a reload that could have been avoided.
        }
        return `${uri}?v=${Math.trunc(version)}`;
    }
}
