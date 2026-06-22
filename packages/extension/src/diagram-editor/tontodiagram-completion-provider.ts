import {
    TontoDiagramWorkspaceContext,
    collectTontoDiagramWorkspaceContext
} from "tonto-cli";
import * as vscode from "vscode";

const TONTO_DIAGRAM_LANGUAGE_ID = "tontodiagram";

export function registerTontoDiagramCompletionProvider(): vscode.Disposable {
    return vscode.languages.registerCompletionItemProvider(
        { language: TONTO_DIAGRAM_LANGUAGE_ID, scheme: "file" },
        {
            provideCompletionItems: async (document, position) => {
                const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
                const sourceReference = readSourceReference(document.getText());

                let workspaceContext: TontoDiagramWorkspaceContext;
                try {
                    workspaceContext = await collectTontoDiagramWorkspaceContext(sourceReference, document.uri.fsPath);
                } catch {
                    return undefined;
                }

                const importedPackages = readImportedPackages(document.getText());
                const defaultPackageNames = workspaceContext.packages
                    .filter((packageContext) => packageContext.sourcePath === workspaceContext.sourcePath)
                    .map((packageContext) => packageContext.name);
                const visiblePackageNames = new Set(importedPackages.length > 0 ? importedPackages : defaultPackageNames);

                const importMatch = linePrefix.match(/^\s*import\s+([A-Za-z0-9_.-]*)$/);
                if (importMatch) {
                    return workspaceContext.packages.map((packageContext) => createCompletionItem({
                        label: packageContext.name,
                        kind: vscode.CompletionItemKind.Module,
                        detail: packageContext.sourcePath,
                        documentation: "Tonto package",
                        range: createTokenRange(position, importMatch[1] ?? ""),
                    }));
                }

                const includeMatch = linePrefix.match(/^\s*include\s+(.+)$/);
                if (includeMatch) {
                    const token = readTrailingListToken(includeMatch[1] ?? "");
                    return workspaceContext.elements
                        .filter((element) => visiblePackageNames.size === 0 || visiblePackageNames.has(element.packageName))
                        .map((element) => createCompletionItem({
                            label: element.name,
                            kind: element.kind === "class" ? vscode.CompletionItemKind.Class : vscode.CompletionItemKind.Struct,
                            detail: element.qualifiedName,
                            documentation: `${element.kind} from ${element.packageName}`,
                            range: createTokenRange(position, token),
                        }));
                }

                const relationMatch = linePrefix.match(/^\s*relations\s+(.+)$/);
                if (relationMatch) {
                    const token = readTrailingListToken(relationMatch[1] ?? "");
                    return workspaceContext.relations
                        .filter((relation) => visiblePackageNames.size === 0 || visiblePackageNames.has(relation.packageName))
                        .map((relation) => createCompletionItem({
                            label: relation.name ?? relation.id,
                            kind: vscode.CompletionItemKind.Reference,
                            detail: `${relation.source} -> ${relation.target}`,
                            documentation: relation.stereotype ? `@${relation.stereotype}` : "Tonto relation",
                            range: createTokenRange(position, token),
                        }));
                }

                return undefined;
            },
        },
        ".",
        ","
    );
}

function createCompletionItem(input: {
    label: string;
    kind: vscode.CompletionItemKind;
    detail: string;
    documentation: string;
    range: vscode.Range;
}): vscode.CompletionItem {
    const item = new vscode.CompletionItem(input.label, input.kind);
    item.detail = input.detail;
    item.documentation = new vscode.MarkdownString(input.documentation);
    item.range = input.range;
    return item;
}

function createTokenRange(position: vscode.Position, token: string): vscode.Range {
    return new vscode.Range(
        position.line,
        position.character - token.length,
        position.line,
        position.character,
    );
}

function readSourceReference(text: string): string | undefined {
    return text.match(/(^|\n)\s*source\s+["']([^"']+)["']/)?.[2] ?? undefined;
}

function readImportedPackages(text: string): string[] {
    return [...text.matchAll(/(^|\n)\s*import\s+([A-Za-z_][\w.-]*)/g)]
        .map((match) => match[2])
        .filter((value): value is string => Boolean(value));
}

function readTrailingListToken(listText: string): string {
    const trailingSegment = listText.split(",").at(-1) ?? "";
    return trailingSegment.trimStart();
}
