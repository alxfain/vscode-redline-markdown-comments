/**
 * Entry point. Registers the custom editor, the commands, and keeps the
 * `redline.openByDefault` setting in sync with `workbench.editorAssociations`.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { currentAppearance, globalSetting, RedlineEditorProvider } from "./editorProvider.js";
import { buildExportHtml } from "./exporter.js";
import { resolveImageInside } from "./safePath.js";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new RedlineEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(RedlineEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand("redline.openPreview", (uri?: vscode.Uri) => openPreview(provider, uri)),
    vscode.commands.registerCommand("redline.openSource", (uri?: vscode.Uri) => openSource(provider, uri)),

    vscode.commands.registerCommand("redline.nextComment", () => provider.postToActive({ type: "navigate", direction: "next" })),
    vscode.commands.registerCommand("redline.prevComment", () => provider.postToActive({ type: "navigate", direction: "prev" })),

    vscode.commands.registerCommand("redline.exportHtml", (uri?: vscode.Uri) => exportDocument(context, provider, "html", uri)),
    vscode.commands.registerCommand("redline.exportPdf", (uri?: vscode.Uri) => exportDocument(context, provider, "pdf", uri)),

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("redline.openByDefault")) void syncEditorAssociation();
    }),
  );
}

export function deactivate(): void {}

/** The tab showing `uri` as a text editor or as the Redline editor, searching the active group first. */
function findTab(uri: vscode.Uri, kind: "text" | "redline"): vscode.Tab | undefined {
  const groups = [vscode.window.tabGroups.activeTabGroup, ...vscode.window.tabGroups.all];
  for (const group of groups) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (kind === "text" && input instanceof vscode.TabInputText && input.uri.toString() === uri.toString()) return tab;
      if (
        kind === "redline" &&
        input instanceof vscode.TabInputCustom &&
        input.viewType === RedlineEditorProvider.viewType &&
        input.uri.toString() === uri.toString()
      )
        return tab;
    }
  }
  return undefined;
}

/**
 * Text → preview, in the same tab.
 *
 * VS Code replaces an editor in place through `reopenActiveEditorWith`, the
 * command behind its own "Reopen Editor With..." menu. It only acts on the
 * active editor and is not part of the public API, so when it is unavailable
 * or the source is not the active tab, the preview is opened next to the
 * source tab and the source tab is closed (`vscode.openWith` always adds a
 * second tab, see test/integration). The cursor line travels along either way.
 */
async function openPreview(provider: RedlineEditorProvider, uri?: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const target = uri ?? editor?.document.uri;
  if (!target) {
    void vscode.window.showInformationMessage("Redline: open a Markdown file first.");
    return;
  }

  const fromEditor = editor && editor.document.uri.toString() === target.toString() ? editor : undefined;
  const line = fromEditor ? fromEditor.selection.active.line + 1 : undefined;
  if (fromEditor?.document.isDirty) await fromEditor.document.save(); // the file on disk is the source of truth

  const wasOpen = provider.isOpen(target);
  if (line !== undefined) provider.setInitialLine(target, line);

  const sourceTab = findTab(target, "text");
  if (isActive(sourceTab)) await tryCommand("reopenActiveEditorWith", RedlineEditorProvider.viewType);
  if (!findTab(target, "redline")) await vscode.commands.executeCommand("vscode.openWith", target, RedlineEditorProvider.viewType);

  const leftover = findTab(target, "text");
  if (leftover) await vscode.window.tabGroups.close(leftover, true);
  // An already open preview does not resolve again, so the line has to be sent.
  if (wasOpen && line !== undefined) void provider.reveal(target, line).catch(() => undefined);
}

/** Preview → text, in the same tab, with the cursor on the line the preview was scrolled to. */
async function openSource(provider: RedlineEditorProvider, uri?: vscode.Uri): Promise<void> {
  const target = uri ?? activeRedlineDocument();
  if (!target) return;

  const line = Math.max((provider.viewportLine(target) ?? 1) - 1, 0);
  const previewTab = findTab(target, "redline");

  let editor: vscode.TextEditor | undefined;
  if (isActive(previewTab) && (await tryCommand("workbench.action.reopenTextEditor"))) {
    editor = await textEditorFor(target, 2000);
  }
  if (!editor) {
    const document = await vscode.workspace.openTextDocument(target);
    editor = await vscode.window.showTextDocument(document, { preview: false });
  }

  const position = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);

  const leftover = findTab(target, "redline");
  if (leftover) await vscode.window.tabGroups.close(leftover, true);
}

/** The tab the in-place commands would act on: active in the active group. */
function isActive(tab: vscode.Tab | undefined): tab is vscode.Tab {
  return tab !== undefined && tab.isActive && tab.group.isActive;
}

/** Runs a command that may not exist in this VS Code version. False when it is missing or fails. */
async function tryCommand(command: string, ...args: unknown[]): Promise<boolean> {
  try {
    await vscode.commands.executeCommand(command, ...args);
    return true;
  } catch {
    return false;
  }
}

/** The text editor of `uri`, waiting briefly for VS Code to report it as active. */
function textEditorFor(uri: vscode.Uri, timeoutMs: number): Promise<vscode.TextEditor | undefined> {
  const matches = (editor: vscode.TextEditor | undefined) =>
    editor && editor.document.uri.toString() === uri.toString() ? editor : undefined;
  const current = matches(vscode.window.activeTextEditor);
  if (current) return Promise.resolve(current);

  return new Promise((resolve) => {
    const finish = (editor: vscode.TextEditor | undefined) => {
      clearTimeout(timer);
      subscription.dispose();
      resolve(editor);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    const subscription = vscode.window.onDidChangeActiveTextEditor((editor) => {
      const found = matches(editor);
      if (found) finish(found);
    });
  });
}

/** URI of the document in the active Redline tab; keyboard shortcuts pass no URI argument. */
function activeRedlineDocument(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom && input.viewType === RedlineEditorProvider.viewType
    ? input.uri
    : undefined;
}

/** Document to export: the command argument, the active Redline tab, or the active Markdown editor. */
function documentForExport(uri?: vscode.Uri): vscode.Uri | undefined {
  if (uri) return uri;
  const fromRedline = activeRedlineDocument();
  if (fromRedline) return fromRedline;
  const editor = vscode.window.activeTextEditor;
  return editor?.document.languageId === "markdown" ? editor.document.uri : undefined;
}

/**
 * Reads an image for export only if its real path (symlinks resolved) is a
 * regular file inside one of the roots. Anything else throws, and the
 * exporter leaves the image as a link. Fail closed.
 */
async function readImageInside(url: string, roots: vscode.Uri[]): Promise<Uint8Array> {
  const uri = vscode.Uri.parse(url);
  if (uri.scheme !== "file") throw new Error("not a local file");
  for (const root of roots) {
    const real = resolveImageInside(root.fsPath, uri.fsPath);
    if (real) return vscode.workspace.fs.readFile(vscode.Uri.file(real));
  }
  throw new Error("outside the allowed folders");
}

/**
 * Export.
 * The body is rendered and sanitised by the webview (the one DOMPurify in the
 * extension), wrapped here, and images are inlined only after a realpath check.
 * HTML — a save dialog next to the .md. PDF — the same HTML written to a temp
 * file and opened in the system browser: Cmd+P → Save as PDF there.
 * No Puppeteer: it would add 300 MB and a fragile install.
 */
async function exportDocument(
  context: vscode.ExtensionContext,
  provider: RedlineEditorProvider,
  kind: "html" | "pdf",
  uri?: vscode.Uri,
): Promise<void> {
  const target = documentForExport(uri);
  if (!target) {
    void vscode.window.showInformationMessage("Redline: open a Markdown file first.");
    return;
  }

  const document = await vscode.workspace.openTextDocument(target);
  const cssBytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, "media", "webview.css"));
  const fileName = target.path.split("/").pop() ?? "document.md";
  const baseName = fileName.replace(/\.md$/i, "");
  const documentDir = vscode.Uri.joinPath(target, "..");

  let bodyHtml: string;
  try {
    bodyHtml = await provider.renderForExport(document, `${documentDir.toString()}/`);
  } catch (error) {
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Redline: export failed.");
    return;
  }

  // Images may come from the document folder or the open workspace — nowhere else, and only after realpath containment.
  const roots = [documentDir, ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri)].filter(
    (root) => root.scheme === "file",
  );

  const html = await buildExportHtml({
    title: fileName,
    theme: currentAppearance().palette,
    css: new TextDecoder().decode(cssBytes),
    bodyHtml,
    allowedRoots: roots.map((root) => root.toString()),
    readFile: (url) => readImageInside(url, roots),
    forPrint: kind === "pdf",
    remoteImages: globalSetting("allowRemoteImages", false),
  });
  const bytes = new TextEncoder().encode(html);

  if (kind === "html") {
    const destination = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(target, "..", `${baseName}.html`),
      filters: { HTML: ["html"] },
      title: "Redline: Export to HTML",
    });
    if (!destination) return;
    await vscode.workspace.fs.writeFile(destination, bytes);
    const open = await vscode.window.showInformationMessage(`Redline: exported ${baseName}.html`, "Open");
    if (open) void vscode.env.openExternal(destination);
    return;
  }

  // A private, freshly created directory: no predictable name in a shared /tmp for anyone to pre-plant a symlink in.
  const temp = vscode.Uri.file(join(mkdtempSync(join(tmpdir(), "redline-")), `${baseName}.html`));
  await vscode.workspace.fs.writeFile(temp, bytes);
  await vscode.env.openExternal(temp);
  void vscode.window.showInformationMessage("Redline: opened in your browser — press Cmd+P and choose “Save as PDF”.");
}

/**
 * A custom editor's priority is static in the manifest; the only way to flip it
 * at runtime is `workbench.editorAssociations`. The Redline setting is a
 * convenient wrapper over that mechanism.
 */
async function syncEditorAssociation(): Promise<void> {
  const enabled = globalSetting("openByDefault", false); // user settings only — a workspace must not hijack .md files
  const workbench = vscode.workspace.getConfiguration("workbench");
  const associations = { ...(workbench.get<Record<string, string>>("editorAssociations") ?? {}) };

  if (enabled) {
    associations["*.md"] = RedlineEditorProvider.viewType;
  } else if (associations["*.md"] === RedlineEditorProvider.viewType) {
    delete associations["*.md"];
  } else {
    return;
  }

  await workbench.update("editorAssociations", associations, vscode.ConfigurationTarget.Global);
}
