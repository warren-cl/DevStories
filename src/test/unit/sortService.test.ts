import { describe, it, expect, vi } from 'vitest';
import { SortService, DEFAULT_SORT_STATE } from '../../core/sortService';

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

describe('SortService', () => {
  describe('initial state', () => {
    it('defaults to priority/asc', () => {
      const svc = new SortService();
      expect(svc.state).toEqual({ key: 'priority', direction: 'asc' });
    });

    it('DEFAULT_SORT_STATE matches initial state', () => {
      expect(DEFAULT_SORT_STATE).toEqual({ key: 'priority', direction: 'asc' });
    });
  });

  describe('setState', () => {
    it('updates the state', () => {
      const svc = new SortService();
      svc.setState({ key: 'date', direction: 'desc' });
      expect(svc.state).toEqual({ key: 'date', direction: 'desc' });
    });

    it('fires onDidSortChange with the new state', () => {
      const svc = new SortService();
      const events: unknown[] = [];
      svc.onDidSortChange(s => events.push(s));

      svc.setState({ key: 'id', direction: 'asc' });
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ key: 'id', direction: 'asc' });
    });

    it('does NOT fire when state is unchanged', () => {
      const svc = new SortService();
      const events: unknown[] = [];
      svc.onDidSortChange(s => events.push(s));

      svc.setState({ key: 'priority', direction: 'asc' }); // same as default
      expect(events).toHaveLength(0);
    });

    it('returns a copy — external mutation does not affect internal state', () => {
      const svc = new SortService();
      const state = svc.state;
      state.key = 'date';
      expect(svc.state.key).toBe('priority');
    });
  });

  describe('dispose', () => {
    it('can be disposed without errors', () => {
      const svc = new SortService();
      expect(() => svc.dispose()).not.toThrow();
    });
  });
});
