const vscode = require("vscode");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

/** Run against a packaged extension with isolated user data and a temporary model workspace. */
exports.run = async function () {
  const findings = [];
  try {
    const extension = vscode.extensions.getExtension("lenke.tonto");
    assert.ok(extension, "Packaged Tonto extension is discoverable");
    await extension.activate();
    findings.push("activation");
    assert.equal(vscode.lm.tools.filter(tool => tool.name.startsWith("tonto_")).length, 5);
    findings.push("5 chat tools registered");
    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const modelPath = path.join(root, "model.tonto");
    const document = await vscode.workspace.openTextDocument(modelPath);
    const editor = await vscode.window.showTextDocument(document);
    const invoke = async (name, input) => {
      const result = await vscode.lm.invokeTool(name, { input }, new vscode.CancellationTokenSource().token);
      return JSON.parse(result.content.filter(item => item instanceof vscode.LanguageModelTextPart).map(item => item.value).join(""));
    };
    assert.equal((await invoke("tonto_validate", { path: modelPath })).valid, true);
    const before = await fs.readFile(modelPath, "utf8");
    await editor.edit(edit => edit.insert(new vscode.Position(1, 0), "kind Human\n"));
    const ast = await invoke("tonto_ast", { path: modelPath });
    assert.ok(JSON.stringify(ast.ast).includes("Human"), "Chat sees unsaved buffers");
    assert.equal(await fs.readFile(modelPath, "utf8"), before);
    const formatted = await invoke("tonto_apply", { path: modelPath, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "// preview\n" }] });
    assert.equal(formatted.saved, false);
    findings.push("chat validation, unsaved AST and format previews");
    await vscode.workspace.getConfiguration("tonto").update("features.tontodiagram.enabled", true, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand("tonto.diagram.createFile", document.uri);
    const viewPath = path.join(root, "views", "model.tontoview");
    const view = await vscode.workspace.openTextDocument(viewPath);
    const json = JSON.parse(view.getText());
    assert.equal(json.version, 1); assert.equal(json.source, "../model.tonto");
    await vscode.commands.executeCommand("vscode.openWith", view.uri, "tonto.view.editor");
    assert.ok(vscode.window.tabGroups.all.flatMap(group => group.tabs).some(tab => tab.input instanceof vscode.TabInputCustom && tab.input.uri.fsPath === viewPath));
    findings.push("version-1 JSON creation and custom editor opening");
    const report = { passed: true, vscode: vscode.version, findings, extensionPath: extension.extensionPath };
    if (process.env.TONTO_TEST_REPORT) await fs.writeFile(process.env.TONTO_TEST_REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    if (process.env.TONTO_TEST_REPORT) await fs.writeFile(process.env.TONTO_TEST_REPORT, JSON.stringify({ passed: false, vscode: vscode.version, findings, error: error.stack }, null, 2));
    throw error;
  }
};
