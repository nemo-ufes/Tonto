import { ChildProcessWithoutNullStreams } from "node:child_process";
import * as vscode from "vscode";
import {
    createMessageConnection,
    MessageConnection,
    StreamMessageReader,
    StreamMessageWriter,
} from "vscode-jsonrpc/node.js";
import { AlloyServerLocation, resolveServerLocation, spawnServer } from "./alloyLspProcess.js";
import { AlloyCommand, AlloyInstance, AlloyModules } from "./alloyTypes.js";

export { AlloyCommand, AlloyInstance, AlloyModules };


/**
 * Typed wrapper over the Alloy server's JSON-RPC methods.
 *
 * <p>One server process is shared by every session — it multiplexes them internally — and is
 * started lazily, so a user who never generates instances never pays for a JVM.
 */
export class AlloyLspClient implements vscode.Disposable {

    private process: ChildProcessWithoutNullStreams | undefined;
    private connection: MessageConnection | undefined;
    private starting: Promise<MessageConnection> | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly output: vscode.OutputChannel
    ) { }

    async openSession(modules: AlloyModules, commandName?: string): Promise<AlloyInstance> {
        const connection = await this.connect();
        return connection.sendRequest<AlloyInstance>("alloy/openSession", { ...modules, commandName });
    }

    async nextInstance(sessionId: string): Promise<AlloyInstance> {
        const connection = await this.connect();
        return connection.sendRequest<AlloyInstance>("alloy/nextInstance", { sessionId });
    }

    async listCommands(sessionId: string): Promise<AlloyCommand[]> {
        const connection = await this.connect();
        return connection.sendRequest<AlloyCommand[]>("alloy/listCommands", { sessionId });
    }

    async closeSession(sessionId: string): Promise<void> {
        // Only meaningful while the server is up; if it is not, there is nothing to release.
        if (!this.connection) {
            return;
        }
        await this.connection.sendRequest("alloy/closeSession", { sessionId });
    }

    /** Starts the server if it is not running yet. Concurrent callers share one startup. */
    private async connect(): Promise<MessageConnection> {
        if (this.connection) {
            return this.connection;
        }
        this.starting ??= this.start();
        return this.starting;
    }

    private async start(): Promise<MessageConnection> {
        const location: AlloyServerLocation = resolveServerLocation(this.context);
        this.output.appendLine(`Starting Alloy server (${location.description})`);

        const child = spawnServer(location);
        this.process = child;

        child.stderr.on("data", (chunk: Buffer) => this.output.append(chunk.toString()));
        child.on("exit", (code) => {
            this.output.appendLine(`Alloy server exited with code ${code}`);
            this.forget();
        });
        child.on("error", (error: Error) => {
            this.output.appendLine(`Alloy server failed to start: ${error.message}`);
            this.forget();
        });

        const connection = createMessageConnection(
            new StreamMessageReader(child.stdout),
            new StreamMessageWriter(child.stdin)
        );
        connection.listen();

        this.connection = connection;
        return connection;
    }

    /** Drops the handles after the process is gone, so the next call starts a fresh one. */
    private forget(): void {
        this.connection?.dispose();
        this.connection = undefined;
        this.starting = undefined;
        this.process = undefined;
    }

    /** Asks the server to release everything, then stops it. */
    async shutdown(): Promise<void> {
        const connection = this.connection;
        if (!connection) {
            return;
        }

        try {
            await connection.sendRequest("alloy/shutdown");
        } catch {
            // Shutting down is best effort: the process is about to be killed anyway.
        }

        this.process?.kill();
        this.forget();
    }

    dispose(): void {
        void this.shutdown();
    }
}
