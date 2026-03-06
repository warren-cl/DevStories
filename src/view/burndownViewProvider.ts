/**
 * Burndown chart WebviewView provider.
 *
 * Renders a sprint burndown chart as an inline SVG inside the DevStories
 * sidebar, below the existing Stories tree view.  The chart shows:
 *   - Black dashed ideal burndown line (linear, total planned → 0)
 *   - Red solid actual burndown line (remaining points per day up to today)
 *
 * The chart follows the sidebar sprint filter.  When no specific sprint is
 * selected (All Sprints / Backlog) it falls back to config.json's
 * sprints.current.  When burndown config is incomplete (missing sprintLength
 * or firstSprintStartDate) it shows a placeholder message.
 *
 * Re-renders on:
 *   - Store update (story status / completed_on changes)
 *   - Config change (sprint settings, statuses, sizes, storypoints)
 *   - Sprint filter change (user picks a different sprint)
 */

import * as vscode from 'vscode';
import { Store } from '../core/store';
import { ConfigService } from '../core/configService';
import { SprintFilterService } from '../core/sprintFilterService';
import {
  isBurndownConfigured,
  getSprintDateRange,
  calculateBurndown,
} from './burndownUtils';
import {
  renderBurndownHtml,
  renderPlaceholderHtml,
} from './burndownSvgRenderer';

export class BurndownViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'devstories.views.burndown';

  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: Store,
    private readonly configService: ConfigService,
    private readonly sprintFilterService: SprintFilterService,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: false,
    };

    // Initial render
    this._refresh();

    // Subscribe to data changes
    this._disposables.push(
      this.store.onDidUpdate(() => this._refresh()),
      this.configService.onDidConfigChange(() => this._refresh()),
      this.sprintFilterService.onDidSprintChange(() => this._refresh()),
    );

    // Clean up when the view is disposed
    webviewView.onDidDispose(() => {
      for (const d of this._disposables) {
        d.dispose();
      }
      this._disposables = [];
      this._view = undefined;
    });
  }

  /** Force a re-render (called externally if needed). */
  refresh(): void {
    this._refresh();
  }

  private _refresh(): void {
    if (!this._view) {
      return;
    }

    const config = this.configService.config;

    // Check if burndown is configured
    if (!isBurndownConfigured(config)) {
      this._view.webview.html = renderPlaceholderHtml(
        'Configure sprints.length and sprints.firstSprintStartDate in config.json',
      );
      return;
    }

    // Determine which sprint to show
    const selectedSprint = this._resolveSprintName();
    if (!selectedSprint) {
      this._view.webview.html = renderPlaceholderHtml('No sprint selected');
      return;
    }

    // Get sprint date range
    const dateRange = getSprintDateRange(
      selectedSprint,
      config.sprintSequence,
      config.firstSprintStartDate!,
      config.sprintLength!,
    );
    if (!dateRange) {
      this._view.webview.html = renderPlaceholderHtml(
        `Sprint "${selectedSprint}" not found in sequence`,
      );
      return;
    }

    // Filter stories for this sprint
    const allStories = this.store.getStories();
    const sprintStories = allStories.filter(s => s.sprint === selectedSprint);

    if (sprintStories.length === 0) {
      this._view.webview.html = renderPlaceholderHtml(
        `No stories in ${selectedSprint}`,
      );
      return;
    }

    // Calculate burndown
    const dataPoints = calculateBurndown(
      sprintStories,
      dateRange.start,
      config.sprintLength!,
      config.statuses,
      config.sizes,
      config.storypoints,
    );

    // Render
    this._view.webview.html = renderBurndownHtml(dataPoints, selectedSprint, vscode.env.language);
  }

  /**
   * Resolve which sprint to display.
   * Priority: sidebar filter → config.json currentSprint → null.
   * Returns null for 'backlog' or when no sprint can be determined.
   */
  private _resolveSprintName(): string | null {
    const filter = this.sprintFilterService.currentSprint;

    // If a real sprint is selected (not null, not 'backlog'), use it
    if (filter && filter !== 'backlog') {
      return filter;
    }

    // Fall back to config.json's current sprint
    return this.configService.config.currentSprint ?? null;
  }
}
