import { describe, it, expect, vi } from 'vitest';
import { TextFilterService } from '../../core/textFilterService';

// ── VS Code mock ───────────────────────────────────────────────────────────────
vi.mock('vscode', () => {
  class EventEmitter {
    private _listeners: Array<(v: unknown) => void> = [];
    get event() {
      return (listener: (v: unknown) => void) => {
        this._listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    fire(value: unknown) {
      for (const l of this._listeners) { l(value); }
    }
    dispose() { this._listeners = []; }
  }
  return { EventEmitter };
});

describe('TextFilterService', () => {
  describe('initial state', () => {
    it('defaults to empty string', () => {
      const svc = new TextFilterService();
      expect(svc.filterText).toBe('');
    });
  });

  describe('setFilter', () => {
    it('updates the filter text', () => {
      const svc = new TextFilterService();
      svc.setFilter('DS-00123');
      expect(svc.filterText).toBe('DS-00123');
    });

    it('fires onDidFilterChange with the new text', () => {
      const svc = new TextFilterService();
      const events: unknown[] = [];
      svc.onDidFilterChange(t => events.push(t));

      svc.setFilter('login');
      expect(events).toHaveLength(1);
      expect(events[0]).toBe('login');
    });

    it('does NOT fire when text is unchanged', () => {
      const svc = new TextFilterService();
      svc.setFilter('test');

      const events: unknown[] = [];
      svc.onDidFilterChange(t => events.push(t));

      svc.setFilter('test'); // same value
      expect(events).toHaveLength(0);
    });

    it('fires when clearing filter back to empty string', () => {
      const svc = new TextFilterService();
      svc.setFilter('something');

      const events: unknown[] = [];
      svc.onDidFilterChange(t => events.push(t));

      svc.setFilter('');
      expect(events).toHaveLength(1);
      expect(events[0]).toBe('');
    });
  });

  describe('dispose', () => {
    it('can be disposed without errors', () => {
      const svc = new TextFilterService();
      expect(() => svc.dispose()).not.toThrow();
    });
  });
});
