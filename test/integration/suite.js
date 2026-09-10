// Runs inside VS Code's extension host. Switching between source and preview
// must keep exactly one tab for the file, in both directions, whatever state the source tab was in.
const vscode = require("vscode");
const path = require("node:path");
const assert = require("node:assert/strict");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWTYPE = "redline.preview";

function tabsFor(uri) {
  return vscode.window.tabGroups.all.flatMap((g) => g.tabs)
    .filter((t) => t.input && t.input.uri && t.input.uri.toString() === uri.toString())
    .map((t) => (t.input instanceof vscode.TabInputCustom ? `custom:${t.input.viewType}` : t.input instanceof vscode.TabInputText ? "text" : "other"));
}

async function closeAll() {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await sleep(300);
}

async function toPreview(uri, showOptions) {
  await closeAll();
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, showOptions);
  await sleep(300);
  await vscode.commands.executeCommand("redline.openPreview", uri);
  await sleep(1500);
  return tabsFor(uri);
}

async function backToSource(uri) {
  await closeAll();
  await vscode.commands.executeCommand("vscode.openWith", uri, VIEWTYPE);
  await sleep(1500);
  await vscode.commands.executeCommand("redline.openSource", uri);
  await sleep(1000);
  return tabsFor(uri);
}

/** Tabs of the active group in order, as "name[kind]" with a star on the active one. */
function groupLayout() {
  return vscode.window.tabGroups.activeTabGroup.tabs.map((t) => {
    const kind = t.input instanceof vscode.TabInputCustom ? "preview" : t.input instanceof vscode.TabInputText ? "text" : "other";
    return `${path.basename(t.input.uri.path)}[${kind}]${t.isActive ? "*" : ""}`;
  });
}

/**
 * Round trip with neighbours on both sides: the tab must keep its place in
 * the row, and the cursor line must survive text → preview → text.
 */
async function roundTrip(ws) {
  await closeAll();
  const open = async (name, options) =>
    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(ws, name))), { preview: false, ...options });
  await open("a.md");
  await open("demo.md");
  await open("b.md");
  const editor = await open("demo.md", { selection: new vscode.Range(120, 0, 120, 0) });
  await sleep(300);
  const before = groupLayout();

  await vscode.commands.executeCommand("redline.openPreview", editor.document.uri);
  await sleep(2500); // the webview renders, scrolls to the line and reports its viewport
  const inPreview = groupLayout();

  await vscode.commands.executeCommand("redline.openSource", editor.document.uri);
  await sleep(1000);
  const back = vscode.window.activeTextEditor;
  return { before, inPreview, after: groupLayout(), line: back ? back.selection.active.line : -1 };
}

exports.run = async () => {
  const ws = process.env.REDLINE_IT_WORKSPACE;
  const uri = vscode.Uri.file(path.join(ws, "demo.md"));
  const results = {};

  results["round trip with neighbours"] = await roundTrip(ws);

  results["preview tab → preview"] = await toPreview(uri, { preview: true });
  results["pinned tab → preview"] = await toPreview(uri, { preview: false });
  results["preview → source"] = await backToSource(uri);
  console.log("\n=== RESULT ===\n" + JSON.stringify(results, null, 2));

  assert.deepEqual(results["preview tab → preview"], [`custom:${VIEWTYPE}`], "source (preview tab) must be replaced by the preview");
  assert.deepEqual(results["pinned tab → preview"], [`custom:${VIEWTYPE}`], "source (pinned tab) must be replaced by the preview");
  assert.deepEqual(results["preview → source"], ["text"], "preview must be replaced by the text editor");

  const trip = results["round trip with neighbours"];
  assert.deepEqual(trip.before, ["a.md[text]", "demo.md[text]*", "b.md[text]"]);
  assert.deepEqual(trip.inPreview, ["a.md[text]", "demo.md[preview]*", "b.md[text]"], "the preview must take the source tab's place in the row");
  assert.deepEqual(trip.after, ["a.md[text]", "demo.md[text]*", "b.md[text]"], "the text editor must take the preview's place in the row");
  assert.ok(Math.abs(trip.line - 120) <= 2, `the cursor must come back near line 120, got ${trip.line}`);
  await closeAll();
};
