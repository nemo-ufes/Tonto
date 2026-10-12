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
    assert.equal(vscode.lm.tools.filter(tool => tool.name.startsWith("tonto_")).length, 14);
    findings.push("14 chat tools registered");
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
    const formatted = await invoke("tonto_format", { path: modelPath });
    assert.equal(formatted.saved, false);
    findings.push("chat validation, unsaved AST and format previews");
    const registered = await vscode.commands.getCommands(true);
    assert.ok(!registered.some(command => command.startsWith("tonto.diagram.plantuml.")));
    assert.deepEqual(extension.packageJSON.contributes.customEditors.map(editor => editor.viewType), ["tonto.view.editor"]);
    await vscode.commands.executeCommand("tonto.diagram.open", document.uri);
    const viewPath = path.join(root, "views", "model.tontoview");
    const view = await vscode.workspace.openTextDocument(viewPath);
    const json = JSON.parse(view.getText());
    assert.equal(json.version, 1); assert.equal(json.source, "../model.tonto");
    await vscode.commands.executeCommand("vscode.openWith", view.uri, "tonto.view.editor");
    assert.ok(vscode.window.tabGroups.all.flatMap(group => group.tabs).some(tab => tab.input instanceof vscode.TabInputCustom && tab.input.uri.fsPath === viewPath));
    findings.push("version-1 JSON creation and custom editor opening");
    await fs.writeFile(path.join(root, "AGENTS.md"), "Preserve these existing instructions.\n");
    await fs.writeFile(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers: { unrelated: { command: "example" } } }));
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("notifications.clearAll"));
    const dismiss = setInterval(() => { void vscode.commands.executeCommand("notifications.clearAll"); }, 300);
    try {
      await vscode.commands.executeCommand("tonto.setupAgents");
      const claude = JSON.parse(await fs.readFile(path.join(root, ".mcp.json"), "utf8"));
      assert.equal(claude.mcpServers.unrelated.command, "example");
      assert.ok(claude.mcpServers.tonto.args[0].endsWith("/runtime/mcp.mjs"));
      assert.ok((await fs.readFile(path.join(root, "AGENTS.md"), "utf8")).startsWith("Preserve these existing instructions."));
      const codex = await fs.readFile(path.join(root, ".codex", "config.toml"), "utf8");
      assert.ok(codex.includes("[mcp_servers.tonto]"));
      await vscode.commands.executeCommand("tonto.setupAgents");
      assert.equal(await fs.readFile(path.join(root, ".codex", "config.toml"), "utf8"), codex);
      findings.push("stable runtime staging, preserved configuration and idempotent setup");
    } finally { clearInterval(dismiss); }

    const report = { passed: true, vscode: vscode.version, findings, extensionPath: extension.extensionPath };
    if (process.env.TONTO_TEST_REPORT) await fs.writeFile(process.env.TONTO_TEST_REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    if (process.env.TONTO_TEST_REPORT) await fs.writeFile(process.env.TONTO_TEST_REPORT, JSON.stringify({ passed: false, vscode: vscode.version, findings, error: error.stack }, null, 2));
    throw error;
  }
};
