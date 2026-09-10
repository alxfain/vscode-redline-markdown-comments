/**
 * The `redline.preview` custom editor.
 *
 * The host owns the document: it reads the text, parses the comments and
 * hands the webview clean markdown plus the comment list. Every change
 * coming back from the webview goes through commentStore, is applied as a
 * minimal WorkspaceEdit and **saves the file immediately** — the whole point
 * of the extension.
 */

import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { deleteComment, insertComment, parseComments, stripComments } from "./commentStore.js";
import { updateComment } from "./commentStore.js";
import { isWebviewMessage } from "./messages.js";
import { resolveAppearance, type Appearance, type ColorThemeKind } from "./theme.js";
import type { ExtensionToWebview, WebviewToExtension } from "./types.js";
import { buildWebviewHtml } from "./webviewHtml.js";

export class RedlineEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = "redline.preview";

  /** Open panels by document URI — for the navigation commands and export. */
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  /** Panels whose script has posted `ready`. */
  private readonly ready = new Set<string>();
  /** Export renders waiting for the webview's reply, by request id. */
  private readonly pendingExports = new Map<string, (html: string) => void>();
  /** Source line at the top of each preview, as last reported by its webview. */
  private readonly viewport = new Map<string, number>();
  /** Cursor lines handed over by Open Preview, consumed when the editor for that document resolves. */
  private readonly pendingLines = new Map<string, number>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const key = document.uri.toString();
    this.panels.set(key, panel);

    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, "media");
    const documentDir = vscode.Uri.joinPath(document.uri, "..");

    // Least privilege: the extension's own assets and the document's folder. Not the workspace.
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot, documentDir],
    };

    // First load: the cursor line from the text editor. Reloads (CSP change): where the preview was scrolled to.
    let initialLine = this.pendingLines.get(key);
    this.pendingLines.delete(key);

    const loadHtml = () => {
      this.ready.delete(key);
      panel.webview.html = buildWebviewHtml({
        ...(initialLine !== undefined ? { initialLine } : {}),
        cspSource: panel.webview.cspSource,
        nonce: randomBytes(16).toString("base64"),
        scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "webview.js")).toString(),
        styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "webview.css")).toString(),
        appearance: this.currentAppearance(),
        remoteImages: remoteImagesAllowed(),
      });
      initialLine = this.viewport.get(key);
    };
    loadHtml();

    const post = (message: ExtensionToWebview) => void panel.webview.postMessage(message);
    const pushUpdate = () => post(this.buildUpdate(document, panel.webview));

    const subscriptions: vscode.Disposable[] = [
      // Live update while an agent edits the file.
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== key) return;
        pushUpdate();

        // Cmd+Z in the preview is VS Code's own undo; its result must reach the disk too.
        const undoRedo =
          event.reason === vscode.TextDocumentChangeReason.Undo ||
          event.reason === vscode.TextDocumentChangeReason.Redo;
        if (undoRedo && panel.active) void document.save();
      }),
      vscode.window.onDidChangeActiveColorTheme(pushUpdate),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("redline.theme")) pushUpdate();
        // The CSP lives in the HTML shell — it has to be rebuilt to change img-src.
        if (event.affectsConfiguration("redline.allowRemoteImages")) loadHtml();
      }),
      panel.webview.onDidReceiveMessage((message: unknown) => {
        if (!isWebviewMessage(message)) return; // wrong shape — ignore, never act
        if (message.type === "ready") this.ready.add(key);
        this.handle(document, message, pushUpdate).catch((error: unknown) => {
          void vscode.window.showErrorMessage(`Redline: ${error instanceof Error ? error.message : String(error)}`);
        });
      }),
    ];

    panel.onDidDispose(() => {
      this.panels.delete(key);
      this.ready.delete(key);
      this.viewport.delete(key);
      for (const subscription of subscriptions) subscription.dispose();
    });
  }

  /**
   * Render the document for export through the webview — the same markdown-it
   * and the same DOMPurify that the preview uses. Opens the preview if needed.
   * Fails closed: no reply, no export.
   */
  async renderForExport(document: vscode.TextDocument, baseUri: string): Promise<string> {
    const key = document.uri.toString();
    if (!this.panels.has(key)) {
      await vscode.commands.executeCommand("vscode.openWith", document.uri, RedlineEditorProvider.viewType);
    }
    await waitUntil(() => this.ready.has(key), 5000, "Redline: the preview did not open.");
    const panel = this.panels.get(key) as vscode.WebviewPanel;

    const requestId = randomBytes(8).toString("hex");
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingExports.delete(requestId);
        reject(new Error("Redline: the preview did not respond."));
      }, 10_000);
      this.pendingExports.set(requestId, (html) => {
        clearTimeout(timer);
        this.pendingExports.delete(requestId);
        resolve(html);
      });
      void panel.webview.postMessage({
        type: "renderForExport",
        requestId,
        markdown: stripComments(document.getText()),
        baseUri,
      } satisfies ExtensionToWebview);
    });
  }

  /** Whether a preview of this document is open (its panel resolved and not disposed). */
  isOpen(uri: vscode.Uri): boolean {
    return this.panels.has(uri.toString());
  }

  /** Line the next preview of this document starts at; it goes into the HTML shell, so the first frame is already in place. */
  setInitialLine(uri: vscode.Uri, line: number): void {
    this.pendingLines.set(uri.toString(), line);
  }

  /** Source line the preview of this document is currently scrolled to, if known. */
  viewportLine(uri: vscode.Uri): number | undefined {
    return this.viewport.get(uri.toString());
  }

  /** Scroll the preview of this document to the block holding `line`, once the webview is ready. */
  async reveal(uri: vscode.Uri, line: number): Promise<void> {
    const key = uri.toString();
    await waitUntil(() => this.ready.has(key), 5000, "Redline: the preview did not open.");
    void this.panels.get(key)?.webview.postMessage({ type: "reveal", line } satisfies ExtensionToWebview);
  }

  /** Post a message to the panel of the active document (navigation commands). */
  postToActive(message: ExtensionToWebview): void {
    for (const panel of this.panels.values()) {
      if (panel.active) {
        void panel.webview.postMessage(message);
        return;
      }
    }
  }

  private async handle(document: vscode.TextDocument, message: WebviewToExtension, pushUpdate: () => void): Promise<void> {
    const text = document.getText();

    switch (message.type) {
      case "ready":
        pushUpdate();
        return;
      case "pickTheme":
        await pickTheme();
        return;
      case "exportHtml":
        this.pendingExports.get(message.requestId)?.(message.html);
        return;
      case "viewport":
        this.viewport.set(document.uri.toString(), message.line);
        return;
      case "export": {
        const kind = await vscode.window.showQuickPick(
          [
            { label: "$(file-code) Export to HTML", description: "Standalone file, images inlined", value: "html" },
            { label: "$(file-pdf) Export to PDF", description: "Opens in your browser — press Cmd+P → Save as PDF", value: "pdf" },
          ],
          { placeHolder: "Redline: Export", title: "Redline: Export" },
        );
        if (kind) await vscode.commands.executeCommand(kind.value === "pdf" ? "redline.exportPdf" : "redline.exportHtml", document.uri);
        return;
      }
      case "addComment": {
        const { text: next } = insertComment(text, {
          line: message.line,
          anchor: message.anchor,
          comment: message.comment,
          date: new Date().toISOString(),
        });
        await this.apply(document, next);
        return;
      }
      case "updateComment":
        await this.apply(document, updateComment(text, message.id, message.comment));
        return;
      case "deleteComment":
        await this.apply(document, deleteComment(text, message.id));
        return;
    }
  }

  /**
   * Minimal edit + immediate save.
   *
   * The replaced range is what lies between the common prefix and suffix of
   * the old and new text. commentStore stays a plain string → string
   * function, the document receives the smallest possible edit, and undo
   * stays granular.
   */
  private async apply(document: vscode.TextDocument, next: string): Promise<void> {
    const prev = document.getText();
    if (prev === next) return;

    let start = 0;
    const minLength = Math.min(prev.length, next.length);
    while (start < minLength && prev[start] === next[start]) start++;

    let prevEnd = prev.length;
    let nextEnd = next.length;
    while (prevEnd > start && nextEnd > start && prev[prevEnd - 1] === next[nextEnd - 1]) {
      prevEnd--;
      nextEnd--;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(start), document.positionAt(prevEnd)),
      next.slice(start, nextEnd),
    );

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      void vscode.window.showErrorMessage("Redline: could not apply the change to the document.");
      return;
    }

    const saved = await document.save();
    if (!saved) {
      void vscode.window.showErrorMessage("Redline: the comment was added, but the file could not be saved.");
    }
  }

  private buildUpdate(document: vscode.TextDocument, webview: vscode.Webview): ExtensionToWebview {
    const text = document.getText();
    const documentDir = vscode.Uri.joinPath(document.uri, "..");
    const baseUri = webview.asWebviewUri(documentDir).toString().replace(/\/?$/, "/");

    const appearance = this.currentAppearance();
    return {
      type: "update",
      markdown: stripComments(text),
      comments: parseComments(text),
      baseUri,
      theme: appearance.palette,
      vscodeColors: appearance.vscodeColors,
      remoteImages: remoteImagesAllowed(),
      fileName: document.uri.path.split("/").pop() ?? document.uri.path,
    };
  }

  private currentAppearance(): Appearance {
    return currentAppearance();
  }
}

/**
 * Security-relevant settings are read from the user's global settings only.
 * A workspace (a cloned repo with a `.vscode/settings.json`) must not be able
 * to switch on network access or hijack how `.md` files open.
 */
export function globalSetting(key: string, fallback: boolean): boolean {
  const info = vscode.workspace.getConfiguration("redline").inspect<boolean>(key);
  return info?.globalValue ?? info?.defaultValue ?? fallback;
}

function remoteImagesAllowed(): boolean {
  return globalSetting("allowRemoteImages", false);
}

async function waitUntil(condition: () => boolean, timeoutMs: number, failure: string): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error(failure);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Appearance from the setting and the active VS Code theme — shared by the preview and the exporter. */
export function currentAppearance(): Appearance {
  const setting = vscode.workspace.getConfiguration("redline").get<string>("theme");
  return resolveAppearance(setting, toKind(vscode.window.activeColorTheme.kind));
}

/** Theme list behind the Theme button; the choice is written to the setting, which stays the source of truth. */
async function pickTheme(): Promise<void> {
  const config = vscode.workspace.getConfiguration("redline");
  const current = config.get<string>("theme") ?? "auto";
  const options: Array<{ value: string; label: string; description: string }> = [
    { value: "auto", label: "Auto", description: "Light or dark, following VS Code" },
    { value: "light", label: "Light", description: "" },
    { value: "dark", label: "Dark", description: "" },
    { value: "dark-dimmed", label: "Dark dimmed", description: "Soft grey-blue, closest to One Dark" },
    { value: "dark-high-contrast", label: "Dark high contrast", description: "" },
    { value: "light-colorblind", label: "Light colorblind", description: "Colorblind-friendly palette" },
    { value: "dark-colorblind", label: "Dark colorblind", description: "Colorblind-friendly palette" },
    { value: "vscode", label: "VS Code theme", description: "Colours of the active VS Code theme" },
  ];

  const picked = await vscode.window.showQuickPick(
    options.map((option) => ({
      ...option,
      label: option.value === current ? `$(check) ${option.label}` : `$(blank) ${option.label}`,
    })),
    { placeHolder: "Redline theme", title: "Redline: Theme" },
  );
  if (!picked || picked.value === current) return;

  await config.update("theme", picked.value, vscode.ConfigurationTarget.Global);
}

function toKind(kind: vscode.ColorThemeKind): ColorThemeKind {
  switch (kind) {
    case vscode.ColorThemeKind.Light:
      return "light";
    case vscode.ColorThemeKind.HighContrastLight:
      return "hc-light";
    case vscode.ColorThemeKind.HighContrast:
      return "hc-dark";
    default:
      return "dark";
  }
}
