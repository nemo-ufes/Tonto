import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { mergeClaudeConfig, mergeCodexConfig } from "./config.js";

const run = promisify(execFile);
const marker = "## Tonto agent tools";
const instructions = `${marker}\nUse Tonto tools to validate models before suggesting changes. Positions are zero-based UTF-16. Tools return previews and never save model edits. Read tonto_guide, tonto_rules and tonto_patterns for current semantics.\n`;
async function read(uri: vscode.Uri): Promise<string | undefined> {
  try { return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8"); }
  catch (error) { if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return undefined; throw error; }
}

export function registerTontoAgentSetup(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand("tonto.setupAgents", async () => {
    try {
      if (vscode.env.remoteName) throw new Error("Agent setup currently supports local desktop workspaces only.");
      const folders = vscode.workspace.workspaceFolders ?? [];
      const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
      if (!folder) return;
      if (folder.uri.scheme !== "file") throw new Error("Agent setup requires a local filesystem workspace.");
      const configuredNode = vscode.workspace.getConfiguration("tonto").get<string>("agents.nodePath", "node");
      const check = await run(configuredNode, ["-p", "process.execPath"], { timeout: 10000 });
      const node = check.stdout.trim();
      const runtimeVersion = await run(node, ["-p", "process.versions.node"], { timeout: 10000 });
      const [major, minor] = runtimeVersion.stdout.trim().split(".").map(Number);
      if (!Number.isFinite(major) || major < 20 || (major === 20 && minor < 18)) throw new Error("Tonto agents require Node 20.18 or newer.");
      const bundleDirectory = vscode.Uri.joinPath(context.globalStorageUri, "runtime");
      const bundle = vscode.Uri.joinPath(bundleDirectory, "mcp.mjs");
      const root = folder.uri.fsPath;
      const codex = vscode.Uri.joinPath(folder.uri, ".codex", "config.toml");
      const claude = vscode.Uri.joinPath(folder.uri, ".mcp.json");
      // Compute every merge before staging or writing, so conflicts cannot partially overwrite configuration.
      const changes = [{ uri: codex, old: await read(codex), content: "" }, { uri: claude, old: await read(claude), content: "" }];
      changes[0].content = mergeCodexConfig(changes[0].old ?? "", node, bundle.fsPath, root);
      changes[1].content = mergeClaudeConfig(changes[1].old, node, bundle.fsPath, root);
      for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
        const uri = vscode.Uri.joinPath(folder.uri, filename);
        const old = await read(uri);
        changes.push({ uri, old, content: old?.includes(marker) ? old : `${old ?? ""}\n${instructions}` });
      }
      await vscode.workspace.fs.createDirectory(bundleDirectory);
      const oldBundle = await read(bundle);
      const oldHash = context.globalState.get<string>("tonto.agents.runtimeHash");
      if (oldBundle !== undefined && (!oldHash || createHash("sha256").update(oldBundle).digest("hex") !== oldHash)) {
        throw new Error("The staged Tonto runtime has user modifications; preserve or remove it before setup.");
      }
      const staged = vscode.Uri.joinPath(bundleDirectory, `mcp-${randomBytes(4).toString("hex")}.mjs`);
      await vscode.workspace.fs.copy(vscode.Uri.joinPath(context.extensionUri, "pack", "mcp.mjs"), staged, { overwrite: false });
      try { await run(node, ["--check", staged.fsPath], { timeout: 10000 }); }
      catch (error) { await vscode.workspace.fs.delete(staged); throw error; }
      const newBundle = await read(staged);
      if (oldBundle !== undefined && oldBundle !== newBundle) {
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(bundleDirectory, `mcp-backup-${randomBytes(4).toString("hex")}.mjs`), Buffer.from(oldBundle));
      }
      if (await read(bundle) !== oldBundle) {
        await vscode.workspace.fs.delete(staged);
        throw new Error("The staged runtime changed during setup; retry after resolving that change.");
      }
      await vscode.workspace.fs.rename(staged, bundle, { overwrite: true });
      const written: typeof changes = [];
      try {
        for (const change of changes) {
          if (await read(change.uri) !== change.old) throw new Error(`Configuration changed during setup: ${change.uri.fsPath}`);
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(change.uri.fsPath)));
          if (change.old !== undefined && change.old !== change.content) await vscode.workspace.fs.writeFile(vscode.Uri.file(`${change.uri.fsPath}.tonto-backup-${randomBytes(4).toString("hex")}`), Buffer.from(change.old));
          await vscode.workspace.fs.writeFile(change.uri, Buffer.from(change.content));
          written.push(change);
        }
      } catch (error) {
        for (const change of written.reverse()) {
          if (await read(change.uri) !== change.content) continue;
          if (change.old === undefined) await vscode.workspace.fs.delete(change.uri);
          else await vscode.workspace.fs.writeFile(change.uri, Buffer.from(change.old));
        }
        if (await read(bundle) === newBundle) {
          if (oldBundle === undefined) await vscode.workspace.fs.delete(bundle);
          else await vscode.workspace.fs.writeFile(bundle, Buffer.from(oldBundle));
        }
        throw error;
      }
      await context.globalState.update("tonto.agents.runtimeHash", createHash("sha256").update(newBundle ?? "").digest("hex"));
      await vscode.window.showInformationMessage("Tonto agents configured for Codex and Claude. Restart the clients to connect.");
    } catch (error) { await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
  }));
}
