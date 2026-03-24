import * as vscode from "vscode";
import { localToday } from "../utils/dateUtils";
import type { ConfigService } from "./configService";

export class AutoTimestamp {
  private disposable: vscode.Disposable;
  private configService?: ConfigService;

  constructor(configService?: ConfigService) {
    this.configService = configService;
    this.disposable = vscode.workspace.onWillSaveTextDocument(this.onWillSave);
  }

  dispose() {
    this.disposable.dispose();
  }

  private isDevStoriesFile(fileName: string): boolean {
    if (fileName.includes(".devstories")) {
      return true;
    }
    // Also match storydocs task files when storydocs is enabled
    const config = this.configService?.config;
    if (config?.storydocsEnabled && config.storydocsRoot) {
      const normalised = fileName.replace(/\\/g, "/");
      const rootNormalised = config.storydocsRoot.replace(/\\/g, "/");
      if (normalised.includes(rootNormalised)) {
        return true;
      }
    }
    return false;
  }

  private onWillSave = (e: vscode.TextDocumentWillSaveEvent) => {
    const doc = e.document;
    // Check if file is in .devstories (or storydocs) and is markdown
    if (!doc.fileName.endsWith(".md") || !this.isDevStoriesFile(doc.fileName)) {
      return;
    }

    const text = doc.getText();
    // Simple check for frontmatter start
    if (!text.startsWith("---")) {
      return;
    }

    // Find end of frontmatter
    const endOfFrontmatter = text.indexOf("\n---", 3);
    if (endOfFrontmatter === -1) {
      return;
    }

    // Check if we are only changing the updated field (to avoid loops if we were using onDidSave)
    // But here we are in onWillSave, so we are modifying the save operation itself.

    const today = localToday();
    const updatedRegex = /^updated:\s*(.*)$/m;

    const edits: vscode.TextEdit[] = [];
    const frontmatterContent = text.substring(0, endOfFrontmatter);

    if (updatedRegex.test(frontmatterContent)) {
      // Update existing
      const match = updatedRegex.exec(frontmatterContent);
      if (match) {
        const currentVal = match[1].trim();
        if (currentVal === today) {
          return; // Already up to date
        }

        const startOffset = match.index;
        const endOffset = match.index + match[0].length;

        const startPos = doc.positionAt(startOffset);
        const endPos = doc.positionAt(endOffset);
        const range = new vscode.Range(startPos, endPos);

        edits.push(vscode.TextEdit.replace(range, `updated: ${today}`));
      }
    } else {
      // Insert new field before the closing ---
      // Need to insert newline + field since we're inserting at the end of previous line
      const pos = doc.positionAt(endOfFrontmatter);
      edits.push(vscode.TextEdit.insert(pos, `\nupdated: ${today}`));
    }

    if (edits.length > 0) {
      e.waitUntil(Promise.resolve(edits));
    }
  };
}
