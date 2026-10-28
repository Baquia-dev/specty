// SPDX-License-Identifier: Apache-2.0
// The VS Code extension (ARCHITECTURE §18, F4): the folder's change in the status bar, and the
// local UI one click away.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Lang } from "@baquia-dev/specty-core";
import * as vscode from "vscode";
import { readStatus, type StatusRead, startUi, type UiServer } from "./specty";
import { langOf, notices, statusView } from "./view";

const OPEN_UI = "specty.openUi";

/** Starts in the first folder of the window with Specty; in a window without it, does nothing. */
export function activate(context: Pick<vscode.ExtensionContext, "subscriptions">): void {
  const folder = vscode.workspace.workspaceFolders
    ?.map((open) => open.uri.fsPath)
    .find((path) => existsSync(join(path, ".specty", "config.yaml")));
  if (folder === undefined) return;
  const window = new SpectyWindow(folder);
  context.subscriptions.push(window, ...window.listeners());
  // The command shows in the palette only where it works.
  void vscode.commands.executeCommand("setContext", "specty.active", true);
  window.refresh();
}

/** The `specty` to run: `specty.path`, a setting of the machine and never of a repository. */
function command(): string {
  return vscode.workspace.getConfiguration("specty").get<string>("path", "specty");
}

function lang(): Lang {
  return langOf(vscode.env.language);
}

/** The extension in one window: its status bar, its readings of the status and the UI's server. */
class SpectyWindow {
  private readonly folder: string;
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  /** The last reading, and whether another was asked for while one runs. */
  private last: StatusRead | undefined;
  private reading = false;
  private again = false;
  /** The UI's server, running or starting. */
  private ui: Promise<UiServer | undefined> | undefined;

  constructor(folder: string) {
    this.folder = folder;
    this.item.name = "Specty";
    this.item.command = OPEN_UI;
  }

  /** What makes the bar read the status again, and the command that opens the UI. */
  listeners(): vscode.Disposable[] {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.folder, ".specty/changes/*/state.json"),
    );
    const refresh = () => this.refresh();
    return [
      watcher,
      watcher.onDidChange(refresh),
      watcher.onDidCreate(refresh),
      watcher.onDidDelete(refresh),
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) this.refresh();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("specty.path")) return;
        this.stopUi();
        this.refresh();
      }),
      vscode.commands.registerCommand(OPEN_UI, () => this.openUi()),
    ];
  }

  /** Reads the status again; asked while reading, it reads once more afterwards. */
  refresh(): void {
    if (this.reading) {
      this.again = true;
      return;
    }
    this.reading = true;
    void readStatus(command(), this.folder).then((read) => {
      this.last = read;
      this.show(read);
      this.reading = false;
      if (!this.again) return;
      this.again = false;
      this.refresh();
    });
  }

  private show(read: StatusRead): void {
    const view = statusView(read, lang());
    this.item.text = view.text;
    this.item.tooltip = view.tooltip;
    this.item.backgroundColor = view.warning
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
    this.item.show();
  }

  /** Opens the UI in the browser, starting its server the first time. */
  async openUi(): Promise<void> {
    const say = notices(lang());
    if (this.last?.kind === "outdated") return this.offerSettings(say.outdated);
    const ui = this.ui ?? this.startServer();
    this.ui = ui;
    const server = await ui;
    if (server === undefined) {
      if (this.ui === ui) this.ui = undefined;
      return;
    }
    const link = await vscode.env.asExternalUri(vscode.Uri.parse(server.link));
    await vscode.env.openExternal(link);
  }

  private async startServer(): Promise<UiServer | undefined> {
    const say = notices(lang());
    const started = await startUi(command(), this.folder);
    switch (started.kind) {
      case "started": {
        const ui = this.ui;
        // A server that ends on its own starts again with the next click.
        void started.server.exited.then(() => {
          if (this.ui === ui) this.ui = undefined;
        });
        return started.server;
      }
      case "missing":
        await this.offerSettings(say.missing);
        return undefined;
      case "failed":
        void vscode.window.showErrorMessage(say.uiFailed(started.message));
        return undefined;
    }
  }

  /** Says what is wrong with `specty` and offers its setting. */
  private async offerSettings(message: string): Promise<void> {
    const open = notices(lang()).openSettings;
    if ((await vscode.window.showWarningMessage(message, open)) !== open) return;
    await vscode.commands.executeCommand("workbench.action.openSettings", "specty.path");
  }

  private stopUi(): void {
    const ui = this.ui;
    this.ui = undefined;
    void ui?.then((server) => server?.stop());
  }

  dispose(): void {
    this.stopUi();
    this.item.dispose();
  }
}
