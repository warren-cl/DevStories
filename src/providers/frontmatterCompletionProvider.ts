/**
 * Completion provider for frontmatter fields in .devstories/ markdown files
 * Provides autocomplete suggestions for:
 * - Enum fields: status, type, size, sprint
 * - Reference fields: epic, dependencies
 * - Wiki-style links: [[ID]]
 */

import * as vscode from 'vscode';
import { ConfigService } from '../core/configService';
import { Store } from '../core/store';
import { isInFrontmatter } from './storyHoverProviderUtils';
import {
  detectFieldAtCursor,
  getStatusCompletions,
  getTypeCompletions,
  getSizeCompletions,
  getSprintCompletions,
  detectEpicField,
  detectThemeField,
  detectDependencyContext,
  detectLinkTrigger,
  getEpicCompletions,
  getThemeCompletions,
  getStoryCompletions,
  getAllIdCompletions,
  CompletionData,
} from './frontmatterCompletionProviderUtils';

export class FrontmatterCompletionProvider implements vscode.CompletionItemProvider {
  constructor(
    private configService: ConfigService,
    private store: Store
  ) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] | null {
    // Only process files in .devstories directory
    if (!document.uri.fsPath.includes('.devstories')) {
      return null;
    }

    const allLines = document.getText().split('\n');
    const line = document.lineAt(position.line).text;

    // Check for [[ID]] link pattern first (can be anywhere in file)
    if (detectLinkTrigger(line, position.character)) {
      const stories = this.store.getStories();
      const epics = this.store.getEpics();
      const themes = this.store.getThemes();
      return this.toCompletionItems(getAllIdCompletions(stories, epics, themes), vscode.CompletionItemKind.Reference);
    }

    // Check if we're in frontmatter for other completions
    const inFrontmatter = isInFrontmatter(allLines, position.line);
    if (!inFrontmatter) {
      return null;
    }

    // Check for theme: field (in epic files)
    if (detectThemeField(line, position.character)) {
      const themes = this.store.getThemes();
      return this.toCompletionItems(getThemeCompletions(themes), vscode.CompletionItemKind.Reference);
    }

    // Check for epic: field
    if (detectEpicField(line, position.character)) {
      const epics = this.store.getEpics();
      return this.toCompletionItems(getEpicCompletions(epics), vscode.CompletionItemKind.Reference);
    }

    // Check for dependencies: array items
    if (detectDependencyContext(allLines, position.line, position.character)) {
      const stories = this.store.getStories();
      return this.toCompletionItems(getStoryCompletions(stories), vscode.CompletionItemKind.Reference);
    }

    // Check for enum fields (status, type, size, sprint)
    const field = detectFieldAtCursor(line, position.character);
    if (!field) {
      return null;
    }

    const completionData = this.getCompletionsForField(field);
    if (!completionData || completionData.length === 0) {
      return null;
    }

    return this.toCompletionItems(completionData, vscode.CompletionItemKind.Value);
  }

  private getCompletionsForField(field: string): CompletionData[] {
    const config = this.configService.config;

    switch (field) {
      case 'status':
        return getStatusCompletions(config.statuses);
      case 'type':
        return getTypeCompletions();
      case 'size':
        return getSizeCompletions(config.sizes);
      case 'sprint':
        return getSprintCompletions(config.sprintSequence);
      default:
        return [];
    }
  }

  private toCompletionItems(data: CompletionData[], kind: vscode.CompletionItemKind): vscode.CompletionItem[] {
    return data.map((d, index) => {
      const item = new vscode.CompletionItem(d.value, kind);
      if (d.detail) {
        item.detail = d.detail;
      }
      // Set sort order to preserve original order
      item.sortText = String(index).padStart(3, '0');
      return item;
    });
  }
}
