import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { getLanguage, setLanguage } from './language';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('language helpers', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { dispatchEvent: vi.fn(() => true) },
      configurable: true,
    });
    (globalThis as any).CustomEvent = class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
  });

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(window.dispatchEvent).mockClear();
  });

  it('defaults to English', () => {
    expect(getLanguage()).toBe('en');
  });

  it('persists Albanian selection', () => {
    setLanguage('sq');
    expect(getLanguage()).toBe('sq');
    expect(window.dispatchEvent).toHaveBeenCalled();
  });
});
