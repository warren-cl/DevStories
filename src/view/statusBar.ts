import * as vscode from 'vscode';
import { ConfigService } from '../core/configService';
import { SprintFilterService } from '../core/sprintFilterService';
import { Store } from '../core/store';
import {
  StatusBarStats,
  getStatsFromStories,
  getFormattedStatusBarText,
  buildProgressBar,
  collectAvailableSprints,
  formatTooltipLines,
} from './statusBarUtils';

export { StatusBarStats };

export class StatusBarController implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private visible: boolean = false;

  constructor(
    private store: Store,
    private configService?: ConfigService,
    private sprintFilterService?: SprintFilterService
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.name = 'DevStories Progress';
    // DS-153: Status bar is display-only, use filter icon in tree view title bar

    // Listen for store updates
    this.disposables.push(
      this.store.onDidUpdate(() => this.update())
    );

    // Listen for config changes (sprint config)
    if (this.configService) {
      this.disposables.push(
        this.configService.onDidConfigChange(() => this.update())
      );
    }

    // Listen for sprint filter changes
    if (this.sprintFilterService) {
      this.disposables.push(
        this.sprintFilterService.onDidSprintChange(() => this.update())
      );
    }

    this.update();
    this.show();
  }

  /**
   * Get stats for the current sprint filter
   */
  getStats(sprint?: string): StatusBarStats {
    const sprintFilter = sprint !== undefined ? sprint : this.getCurrentSprintFilter();
    const statuses = this.configService?.config.statuses ?? [];
    const sizes = this.configService?.config.sizes ?? [];
    const storypoints = this.configService?.config.storypoints ?? [];
    return getStatsFromStories(this.store.getStories(), sprintFilter, statuses, sizes, storypoints);
  }

  /**
   * Get the current sprint filter (from filter service, or null for all)
   */
  private getCurrentSprintFilter(): string | null {
    return this.sprintFilterService?.currentSprint ?? null;
  }

  /**
   * Get formatted text for display
   */
  getFormattedText(sprint?: string): string {
    const sprintFilter = sprint !== undefined
      ? (sprint || null)
      : this.getCurrentSprintFilter();
    const statuses = this.configService?.config.statuses ?? [];
    const sizes = this.configService?.config.sizes ?? [];
    const storypoints = this.configService?.config.storypoints ?? [];
    const stats = getStatsFromStories(this.store.getStories(), sprintFilter, statuses, sizes, storypoints);
    return getFormattedStatusBarText(stats.donePoints, stats.totalPoints, sprintFilter);
  }

  /**
   * Build progress bar (exposed for backwards compatibility with tests)
   */
  buildProgressBar(done: number, total: number): string {
    return buildProgressBar(done, total);
  }

  /**
   * Get available sprints for picker
   */
  getAvailableSprints(): string[] {
    return collectAvailableSprints(
      this.store.getStories(),
      this.configService?.config.currentSprint
    );
  }

  /**
   * Get tooltip with detailed stats
   */
  private getTooltip(): vscode.MarkdownString {
    const sprint = this.getCurrentSprintFilter();
    const statuses = this.configService?.config.statuses ?? [];
    const sizes = this.configService?.config.sizes ?? [];
    const storypoints = this.configService?.config.storypoints ?? [];
    const stats = getStatsFromStories(this.store.getStories(), sprint, statuses, sizes, storypoints);
    const lines = formatTooltipLines(stats.donePoints, stats.totalPoints, sprint);
    const md = new vscode.MarkdownString(lines.join('\n'));
    md.isTrusted = true;
    return md;
  }

  private update(): void {
    this.statusBarItem.text = this.getFormattedText();
    this.statusBarItem.tooltip = this.getTooltip();
  }

  /**
   * Get the command registered for click handler
   */
  getCommand(): string | undefined {
    return this.statusBarItem.command as string | undefined;
  }

  /**
   * Check if status bar is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Show the status bar
   */
  show(): void {
    this.statusBarItem.show();
    this.visible = true;
  }

  /**
   * Hide the status bar
   */
  hide(): void {
    this.statusBarItem.hide();
    this.visible = false;
  }

  dispose(): void {
    this.statusBarItem.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
