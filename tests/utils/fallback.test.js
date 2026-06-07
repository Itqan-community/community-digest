import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, saveFallback } from '../../utils/fallback';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, 3);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    const result = await withRetry(fn, 3);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  }, 10000);

  it('throws after all retries fail', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(withRetry(fn, 2)).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('saveFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves artifacts to outputs directory', async () => {
    const artifacts = {
      step: 'llm',
      timestamp: '2026-06-07T12:00:00Z',
      error: 'Test error',
      data: { test: true }
    };

    await saveFallback(artifacts);

    // Verify file was created and contains expected fields
    const fs = await import('fs');
    const outputs = fs.default.readdirSync('outputs');
    expect(outputs.length).toBeGreaterThan(0);

    const saved = JSON.parse(fs.default.readFileSync(`outputs/${outputs[outputs.length - 1]}`, 'utf8'));
    expect(saved.step).toBe('llm');
    expect(saved.error).toBe('Test error');
    expect(saved.data).toEqual({ test: true });
  });
});
