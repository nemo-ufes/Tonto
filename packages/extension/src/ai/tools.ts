import * as vscode from "vscode";
import { TontoAgentHandlers, toolDefinitions, vscodeToolNames } from "tonto-cli/lib/mcp/handlers.js";

async function resolveFolder(input: Record<string, unknown>): Promise<vscode.WorkspaceFolder> {
  const supplied = typeof input.path === "string" ? input.path : undefined;
  const absolute = supplied && /^(\/|[A-Za-z]:[\\/])/.test(supplied) ? vscode.Uri.file(supplied) : undefined;
  const active = vscode.window.activeTextEditor?.document;
  const candidate = absolute ?? (active?.uri.scheme === "file" && active.uri.path.endsWith(".tonto") ? active.uri : undefined);
  const folder = candidate && vscode.workspace.getWorkspaceFolder(candidate);
  if (folder) return folder;
  if (absolute) throw new Error("The supplied model must be inside an open workspace folder.");
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 1) return folders[0];
  const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: "Choose the Tonto project for this tool" });
  if (!picked) throw new Error("A workspace folder is required.");
  return picked;
}

export function registerTontoAgentTools(context: vscode.ExtensionContext): void {
  if (!vscode.lm?.registerTool) return;
  for (const name of vscodeToolNames.filter(name => ["tonto_validate", "tonto_ast", "tonto_apply", "tonto_diff", "tonto_complete"].includes(name))) {
    context.subscriptions.push(vscode.lm.registerTool(name, {
      async invoke(options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>, token: vscode.CancellationToken) {
        const input = { ...options.input };
        const folder = await resolveFolder(input);
        if (folder.uri.scheme !== "file") throw new Error("Tonto agent tools require a local filesystem workspace.");
        const handlers = new TontoAgentHandlers(folder.uri.fsPath);
        for (const document of vscode.workspace.textDocuments) {
          if (document.uri.scheme === "file" && document.uri.path.endsWith(".tonto") && vscode.workspace.getWorkspaceFolder(document.uri)?.uri.toString() === folder.uri.toString()) {
            await handlers.workspace.hold(document.uri.fsPath, document.getText());
          }
        }
        if (input.source === undefined && input.path === undefined) {
          const active = vscode.window.activeTextEditor?.document;
          if (active?.uri.path.endsWith(".tonto") && vscode.workspace.getWorkspaceFolder(active.uri)?.uri.toString() === folder.uri.toString()) input.path = active.uri.fsPath;
        }
        const result = await handlers.invoke(name, input, () => token.isCancellationRequested);
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(result))]);
      },
    }));
  }
}

/** Exported for manifest generation; invocation parses the identical runtime Zod schema. */
export const tontoAgentToolContributions = vscodeToolNames.map(name => ({ name,
  displayName: name.replace("tonto_", "Tonto "), modelDescription: toolDefinitions[name].description,
  canBeReferencedInPrompt: true, toolReferenceName: name.replace("tonto_", "tonto-"),
}));
