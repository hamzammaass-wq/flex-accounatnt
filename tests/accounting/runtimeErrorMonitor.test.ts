import { describe, expect, it } from 'vitest';
import {
  appendRuntimeErrorEntry,
  type RuntimeErrorEntry,
} from '../../utils/runtimeErrorMonitor';

const makeEntry = (id: string): RuntimeErrorEntry => ({
  id,
  at: '2026-03-23T00:00:00.000Z',
  kind: 'window-error',
  message: `error-${id}`,
});

describe('runtimeErrorMonitor', () => {
  it('appends new entries in order', () => {
    const current = [makeEntry('a'), makeEntry('b')];
    const next = appendRuntimeErrorEntry(current, makeEntry('c'), 10);
    expect(next.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps only the most recent entries when exceeding max', () => {
    const current = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    const next = appendRuntimeErrorEntry(current, makeEntry('d'), 3);
    expect(next.map((entry) => entry.id)).toEqual(['b', 'c', 'd']);
  });
});
