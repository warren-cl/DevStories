/**
 * ConfigService - Live reload service for config.json and templates
 *
 * Watches .devstories/config.json and .devstories/templates/ for changes,
 * parses content, and emits events when config updates.
 */

import * as vscode from 'vscode';
import { getLogger } from './logger';
import {
  ConfigData,
  TemplateData,
  parseConfigJsonContent,
  parseTemplateFile,
  mergeConfigWithDefaults,
  validateSprintConfig,
  DEFAULT_CONFIG,
  computeConfigUpgrade,
} from './configServiceUtils';
import { showConfigErrorNotification, showSprintValidationErrorNotification } from './configServiceNotifications';

const CONFIG_DEBOUNCE_MS = 100;
const TEMPLATE_DEBOUNCE_MS = 100;

export class ConfigService implements vscode.Disposable {
  private _config: ConfigData = DEFAULT_CONFIG;
  private _templates: TemplateData[] = [];
  private _lastGoodConfig: ConfigData = DEFAULT_CONFIG;
  private _extensionVersion: string;

  private configWatcher: vscode.FileSystemWatcher | undefined;
  private templateWatcher: vscode.FileSystemWatcher | undefined;

  private configDebounceTimer: NodeJS.Timeout | undefined;
  private templateDebounceTimer: NodeJS.Timeout | undefined;

  private _onDidConfigChange = new vscode.EventEmitter<ConfigData>();
  private _onDidTemplatesChange = new vscode.EventEmitter<TemplateData[]>();
  private _onParseError = new vscode.EventEmitter<Error>();

  readonly onDidConfigChange = this._onDidConfigChange.event;
  readonly onDidTemplatesChange = this._onDidTemplatesChange.event;
  readonly onParseError = this._onParseError.event;

  constructor(extensionVersion: string) {
    this._extensionVersion = extensionVersion;
  }

  /**
   * Get current config (synchronous)
   */
  get config(): ConfigData {
    return this._config;
  }

  /**
   * Get current templates (synchronous)
   */
  get templates(): TemplateData[] {
    return this._templates;
  }

  /**
   * Initialize the service - load config and start watching
   */
  async initialize(): Promise<void> {
    await this.loadConfig();
    await this.loadTemplates();
    this.startWatching();
  }

  /**
   * Load config.json from workspace
   */
  private async loadConfig(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this._config = DEFAULT_CONFIG;
      return;
    }

    const configUri = vscode.Uri.joinPath(
      workspaceFolder.uri,
      '.devstories',
      'config.json'
    );

    try {
      const content = await vscode.workspace.fs.readFile(configUri);
      const contentStr = new TextDecoder().decode(content);
      const parsed = parseConfigJsonContent(contentStr);
      const merged = mergeConfigWithDefaults(parsed);

      // Validate sprint config
      const validation = validateSprintConfig(merged);
      if (!validation.valid) {
        void showSprintValidationErrorNotification(validation.error || 'Invalid sprint configuration');
      }

      this._config = merged;
      this._lastGoodConfig = this._config;
    } catch (err) {
      // File doesn't exist or can't be read - use defaults
      this._config = this._lastGoodConfig;
    }
  }

  /**
   * Load templates from .devstories/templates/
   */
  private async loadTemplates(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this._templates = [];
      return;
    }

    const templatesUri = vscode.Uri.joinPath(
      workspaceFolder.uri,
      '.devstories',
      'templates'
    );

    try {
      const entries = await vscode.workspace.fs.readDirectory(templatesUri);
      const templates: TemplateData[] = [];

      for (const [filename, fileType] of entries) {
        if (fileType === vscode.FileType.File && filename.endsWith('.md')) {
          try {
            const fileUri = vscode.Uri.joinPath(templatesUri, filename);
            const content = new TextDecoder().decode(
              await vscode.workspace.fs.readFile(fileUri)
            );
            templates.push(parseTemplateFile(filename, content));
          } catch (error) {
            // Template file unreadable - skip and log
            getLogger().debug(`Skipping unreadable template: ${filename}`, error);
          }
        }
      }

      this._templates = templates;
    } catch {
      // Templates folder doesn't exist - expected scenario, use empty list
      this._templates = [];
    }
  }

  /**
   * Start watching config.json and templates/
   */
  private startWatching(): void {
    // Watch config.json
    this.configWatcher = vscode.workspace.createFileSystemWatcher(
      '**/.devstories/config.json'
    );

    this.configWatcher.onDidCreate(() => this.debouncedConfigReload());
    this.configWatcher.onDidChange(() => this.debouncedConfigReload());
    this.configWatcher.onDidDelete(() => this.onConfigDeleted());

    // Watch templates folder
    this.templateWatcher = vscode.workspace.createFileSystemWatcher(
      '**/.devstories/templates/*.md'
    );

    this.templateWatcher.onDidCreate(() => this.debouncedTemplateReload());
    this.templateWatcher.onDidChange(() => this.debouncedTemplateReload());
    this.templateWatcher.onDidDelete(() => this.debouncedTemplateReload());
  }

  /**
   * Debounced config reload
   */
  private debouncedConfigReload(): void {
    if (this.configDebounceTimer) {
      clearTimeout(this.configDebounceTimer);
    }
    this.configDebounceTimer = setTimeout(async () => {
      await this.reloadConfig();
    }, CONFIG_DEBOUNCE_MS);
  }

  /**
   * Debounced template reload
   */
  private debouncedTemplateReload(): void {
    if (this.templateDebounceTimer) {
      clearTimeout(this.templateDebounceTimer);
    }
    this.templateDebounceTimer = setTimeout(async () => {
      await this.reloadTemplates();
    }, TEMPLATE_DEBOUNCE_MS);
  }

  /**
   * Reload config and emit event if changed
   */
  private async reloadConfig(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const configUri = vscode.Uri.joinPath(
      workspaceFolder.uri,
      '.devstories',
      'config.json'
    );

    try {
      const content = await vscode.workspace.fs.readFile(configUri);
      const contentStr = new TextDecoder().decode(content);
      const parsed = parseConfigJsonContent(contentStr);

      // Check for parse errors in critical fields
      if (Object.keys(parsed).length === 0 && contentStr.trim().length > 0) {
        const error = new Error('Failed to parse config.json');
        this._onParseError.fire(error);
        void showConfigErrorNotification();
        return;
      }

      const merged = mergeConfigWithDefaults(parsed);

      // Validate sprint config
      const validation = validateSprintConfig(merged);
      if (!validation.valid) {
        void showSprintValidationErrorNotification(validation.error || 'Invalid sprint configuration');
      }

      this._config = merged;
      this._lastGoodConfig = this._config;
      this._onDidConfigChange.fire(this._config);
    } catch (err) {
      // File read error - keep using current config
      const error = err instanceof Error ? err : new Error('Unknown error reading config');
      this._onParseError.fire(error);
    }
  }

  /**
   * Reload templates and emit event if changed
   */
  private async reloadTemplates(): Promise<void> {
    await this.loadTemplates();
    this._onDidTemplatesChange.fire(this._templates);
  }

  /**
   * Update sprints.current in config.json and persist to disk.
   * The existing file watcher will detect the change and reload _config automatically.
   * @param sprint - Sprint name to set as current (e.g. 'sprint-4')
   */
  async updateCurrentSprint(sprint: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const configUri = vscode.Uri.joinPath(
      workspaceFolder.uri,
      '.devstories',
      'config.json'
    );

    try {
      const content = await vscode.workspace.fs.readFile(configUri);
      const contentStr = new TextDecoder().decode(content);
      const raw: Record<string, unknown> = JSON.parse(contentStr);

      if (!raw.sprints || typeof raw.sprints !== 'object') {
        raw.sprints = {};
      }
      (raw.sprints as Record<string, unknown>).current = sprint;

      const updated = JSON.stringify(raw, null, 2);
      await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(updated));
      // File watcher will detect the write and call reloadConfig() → emit onDidConfigChange
    } catch (err) {
      getLogger().error('Failed to update current sprint in config.json', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Handle config.json deletion
   */
  private onConfigDeleted(): void {
    this._config = DEFAULT_CONFIG;
    this._onDidConfigChange.fire(this._config);
  }

  /**
   * Upgrade config.json to the current schema version if needed.
   * Creates a .bak backup before writing changes.
   * Returns list of fields added, or empty array if no upgrade was needed.
   */
  async upgradeConfigIfNeeded(): Promise<string[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    const configUri = vscode.Uri.joinPath(
      workspaceFolder.uri,
      '.devstories',
      'config.json'
    );

    try {
      const content = await vscode.workspace.fs.readFile(configUri);
      const contentStr = new TextDecoder().decode(content);
      const raw: Record<string, unknown> = JSON.parse(contentStr);

      const result = computeConfigUpgrade(raw, this._extensionVersion);
      if (!result) {
        return [];
      }

      // Create backup before modifying
      const backupUri = vscode.Uri.joinPath(
        workspaceFolder.uri,
        '.devstories',
        'config.json.bak'
      );
      await vscode.workspace.fs.writeFile(backupUri, content);

      // Write upgraded config
      const upgraded = JSON.stringify(result.upgraded, null, 2);
      await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(upgraded));

      getLogger().info(
        `Config upgraded to v${this._extensionVersion}. Fields added: ${result.fieldsAdded.join(', ')}`
      );

      // Reload config so the in-memory state reflects the upgrade
      await this.reloadConfig();

      return result.fieldsAdded;
    } catch (err) {
      getLogger().error(
        'Failed to upgrade config.json',
        err instanceof Error ? err.message : String(err)
      );
      return [];
    }
  }

  dispose(): void {
    if (this.configDebounceTimer) {
      clearTimeout(this.configDebounceTimer);
    }
    if (this.templateDebounceTimer) {
      clearTimeout(this.templateDebounceTimer);
    }
    this.configWatcher?.dispose();
    this.templateWatcher?.dispose();
    this._onDidConfigChange.dispose();
    this._onDidTemplatesChange.dispose();
    this._onParseError.dispose();
  }
}
