import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { dropRecent, pushRecent } from "./core/recent";

const KEY = "mokep.recent";
const ci = process.platform === "win32";

/** Recently opened .pen files, newest first. Backs the Mokep sidebar view. */
export class RecentFiles implements vscode.TreeDataProvider<string> {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private store: vscode.Memento) {}

  list(): string[] { return this.store.get<string[]>(KEY, []); }

  async add(file: string) {
    await this.store.update(KEY, pushRecent(this.list(), file, ci));
    this.changed.fire();
  }

  async remove(file: string) {
    await this.store.update(KEY, dropRecent(this.list(), file, ci));
    this.changed.fire();
  }

  getChildren() { return this.list(); }

  getTreeItem(file: string) {
    const item = new vscode.TreeItem(basename(file));
    item.description = dirname(file);
    item.tooltip = file;
    item.iconPath = new vscode.ThemeIcon("file");
    item.contextValue = "mokep.recent";
    item.command = { command: "mokep.openRecent", title: "Open", arguments: [file] };
    return item;
  }
}
