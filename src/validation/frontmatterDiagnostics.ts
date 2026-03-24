/**
 * VS Code DiagnosticCollection provider for frontmatter validation
 * Shows red squiggles and warnings for invalid frontmatter
 */

import * as vscode from 'vscode';
import { ConfigService } from '../core/configService';
import { Store } from '../core/store';
import {
  validateFrontmatter,
  validateCrossFile,
  getFileTypeFromPath,
  isDevStoriesFile,
  ValidationError,
  ValidationConfig,
  KnownIds
} from './frontmatterValidator';
import * as path from 'path';

const DEBOUNCE_DELAY = 300;

/**
 * Provider that validates frontmatter and shows diagnostics
 */
/**
 * Link pattern to extract [[ID]] from epic content
 */
const LINK_PATTERN = /\[\[([A-Z]+-(?:\d+|INBOX))\]\]/g;

export class FrontmatterDiagnosticsProvider implements vscode.Disposable {
  private diagnostics: vscode.DiagnosticCollection;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private disposables: vscode.Disposable[] = [];
  private schemasDir: string;

  constructor(
    private configService: ConfigService,
    private store: Store,
    extensionPath: string
  ) {
    this.diagnostics = vscode.languages.createDiagnosticCollection('devstories');
    this.schemasDir = path.join(extensionPath, 'schemas');
  }

  /**
   * Register all document listeners and return disposables
   */
  register(): vscode.Disposable[] {
    // Validate on document open
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        this.validateDocumentIfDevStories(doc);
      })
    );

    // Validate on document change (debounced)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.debouncedValidate(event.document);
      })
    );

    // Validate on document save (immediate)
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this.validateDocumentIfDevStories(doc);
      })
    );

    // Clear diagnostics when document closes
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.clearDiagnostics(doc.uri);
        this.clearDebounceTimer(doc.uri.toString());
      })
    );

    // Re-validate all open documents when config changes
    this.disposables.push(
      this.configService.onDidConfigChange(() => {
        this.validateAllOpenDocuments();
      })
    );

    // Re-validate all open documents when store updates (cross-file references may change)
    this.disposables.push(
      this.store.onDidUpdate(() => {
        this.validateAllOpenDocuments();
      })
    );

    // Validate already-open documents
    this.validateAllOpenDocuments();

    return this.disposables;
  }

  /**
   * Validate document if it's a devstories file
   */
  private validateDocumentIfDevStories(doc: vscode.TextDocument): void {
    const fileType = getFileTypeFromPath(doc.uri.fsPath);
    // Tasks live outside .devstories/ (in storydocs), so check fileType directly
    if (!fileType || (!isDevStoriesFile(doc.uri.fsPath) && fileType !== 'task')) {
      return;
    }

    this.validateDocument(doc, fileType);
  }

  /**
   * Debounced validation for typing
   */
  private debouncedValidate(doc: vscode.TextDocument): void {
    const fileType = getFileTypeFromPath(doc.uri.fsPath);
    if (!fileType || (!isDevStoriesFile(doc.uri.fsPath) && fileType !== 'task')) {
      return;
    }

    const uri = doc.uri.toString();

    // Clear existing timer
    this.clearDebounceTimer(uri);

    // Set new timer
    const timer = setTimeout(() => {
      this.validateDocument(doc, fileType);
      this.debounceTimers.delete(uri);
    }, DEBOUNCE_DELAY);

    this.debounceTimers.set(uri, timer);
  }

  /**
   * Validate a single document
   */
  private validateDocument(doc: vscode.TextDocument, fileType: 'story' | 'epic' | 'theme' | 'task'): void {
    const content = doc.getText();

    // Build config from ConfigService
    const config: ValidationConfig = {
      statuses: this.configService.config.statuses.map(s => s.id),
      sizes: this.configService.config.sizes
    };

    // Schema validation
    const schemaErrors = validateFrontmatter(content, fileType, config, this.schemasDir);

    // Cross-file validation
    const knownIds = this.buildKnownIds();
    const currentId = this.extractIdFromContent(content);
    const crossFileErrors = validateCrossFile(content, fileType, currentId, knownIds);

    // Combine errors
    const allErrors = [...schemaErrors, ...crossFileErrors];
    const diagnostics = allErrors.map(error => this.errorToDiagnostic(error, doc));

    this.diagnostics.set(doc.uri, diagnostics);
  }

  /**
   * Build KnownIds from Store
   */
  private buildKnownIds(): KnownIds {
    const stories = new Set<string>();
    const epics = new Set<string>();
    const themes = new Set<string>();
    const epicStoryMap = new Map<string, Set<string>>();
    const themeEpicMap = new Map<string, Set<string>>();

    // Collect all story IDs
    for (const story of this.store.getStories()) {
      stories.add(story.id);
    }

    // Collect all epic IDs and extract [[links]] from their content
    for (const epic of this.store.getEpics()) {
      epics.add(epic.id);

      // Extract story IDs mentioned in epic's content (## Stories section)
      const storyLinks = new Set<string>();
      let match;
      LINK_PATTERN.lastIndex = 0;
      while ((match = LINK_PATTERN.exec(epic.content)) !== null) {
        const id = match[1];
        // Only include story-like IDs (not EPIC-* or THEME-*)
        if (!id.startsWith('EPIC-') && !id.startsWith('THEME-')) {
          storyLinks.add(id);
        }
      }
      epicStoryMap.set(epic.id, storyLinks);
    }

    // Collect all theme IDs and extract [[EPIC-*]] links from their content
    for (const theme of this.store.getThemes()) {
      themes.add(theme.id);

      // Extract epic IDs mentioned in theme's content (## Epics section)
      const epicLinks = new Set<string>();
      let match;
      LINK_PATTERN.lastIndex = 0;
      while ((match = LINK_PATTERN.exec(theme.content)) !== null) {
        const id = match[1];
        if (id.startsWith('EPIC-')) {
          epicLinks.add(id);
        }
      }
      themeEpicMap.set(theme.id, epicLinks);
    }

    // Collect all task IDs
    const tasks = new Set<string>();
    for (const task of this.store.getTasks()) {
      tasks.add(task.id);
    }

    return { stories, epics, themes, tasks, epicStoryMap, themeEpicMap };
  }

  /**
   * Extract ID from frontmatter content
   */
  private extractIdFromContent(content: string): string | undefined {
    const match = content.match(/^id:\s*(.+)$/m);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Convert ValidationError to VS Code Diagnostic
   */
  private errorToDiagnostic(error: ValidationError, doc: vscode.TextDocument): vscode.Diagnostic {
    const line = error.line - 1; // VS Code uses 0-indexed lines
    const startCol = error.column;
    const endCol = error.endColumn ?? error.column + 1;

    // Clamp to document bounds
    const lineCount = doc.lineCount;
    const clampedLine = Math.min(Math.max(0, line), lineCount - 1);
    const lineText = doc.lineAt(clampedLine).text;
    const clampedEndCol = Math.min(endCol, lineText.length);

    const range = new vscode.Range(
      clampedLine,
      Math.min(startCol, lineText.length),
      clampedLine,
      clampedEndCol
    );

    const severity = error.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning;

    const diagnostic = new vscode.Diagnostic(range, error.message, severity);
    diagnostic.source = 'DevStories';

    return diagnostic;
  }

  /**
   * Validate all currently open documents
   */
  private validateAllOpenDocuments(): void {
    for (const doc of vscode.workspace.textDocuments) {
      this.validateDocumentIfDevStories(doc);
    }
  }

  /**
   * Clear diagnostics for a URI
   */
  clearDiagnostics(uri: vscode.Uri): void {
    this.diagnostics.delete(uri);
  }

  /**
   * Clear debounce timer for a URI
   */
  private clearDebounceTimer(uri: string): void {
    const timer = this.debounceTimers.get(uri);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(uri);
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Dispose diagnostic collection
    this.diagnostics.dispose();

    // Dispose all listeners
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
