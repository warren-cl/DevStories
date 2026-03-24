/**
 * TaskWatcher — FileSystemWatcher for task files in storydocs directories.
 *
 * Monitors {storydocsRoot}/stories/STORY-ID/tasks/*.md for create, change, and delete events.
 * Lifecycle: created after ConfigService.initialize(), recreated if storydocsRoot changes.
 */

import * as vscode from 'vscode';

export class TaskWatcher {
  private watcher: vscode.FileSystemWatcher | undefined;
  private _onDidCreate = new vscode.EventEmitter<vscode.Uri>();
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  private _onDidDelete = new vscode.EventEmitter<vscode.Uri>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  readonly onDidCreate = this._onDidCreate.event;
  readonly onDidChange = this._onDidChange.event;
  readonly onDidDelete = this._onDidDelete.event;

  constructor(storydocsRoot: string) {
    this.startWatching(storydocsRoot);
  }

  private startWatching(storydocsRoot: string): void {
    const pattern = new vscode.RelativePattern(
      storydocsRoot,
      'stories/*/tasks/*.md'
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidCreate(uri => this._onDidCreate.fire(uri));

    this.watcher.onDidChange(uri => {
      const key = uri.toString();
      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key)!);
      }
      this.debounceTimers.set(key, setTimeout(() => {
        this.debounceTimers.delete(key);
        this._onDidChange.fire(uri);
      }, 100));
    });

    this.watcher.onDidDelete(uri => this._onDidDelete.fire(uri));
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidCreate.dispose();
    this._onDidChange.dispose();
    this._onDidDelete.dispose();
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
  }
}
