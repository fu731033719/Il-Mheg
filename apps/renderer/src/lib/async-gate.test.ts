import { describe, expect, it } from 'vitest';
import { AsyncGate } from './async-gate';

describe('AsyncGate', () => {
  it('releases a synchronously completed no-op before the next task', async () => {
    const gate = new AsyncGate();
    const calls: string[] = [];
    await gate.run(() => { calls.push('empty flush'); });
    await gate.run(() => { calls.push('save new node'); });
    expect(calls).toEqual(['empty flush', 'save new node']);
  });

  it('shares one active task with concurrent flush callers', async () => {
    const gate = new AsyncGate();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const first = gate.run(async () => { calls += 1; await waiting; });
    const second = gate.run(() => { calls += 1; });
    expect(first).toBe(second);
    release();
    await second;
    expect(calls).toBe(1);
  });

  it('releases a rejected task so a later save can retry', async () => {
    const gate = new AsyncGate();
    await expect(gate.run(() => { throw new Error('save failed'); })).rejects.toThrow('save failed');
    let retried = false;
    await gate.run(() => { retried = true; });
    expect(retried).toBe(true);
  });
});
