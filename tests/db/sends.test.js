import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

vi.mock('mysql2/promise', () => ({
  default: { createPool: vi.fn(() => mockPool) }
}));

vi.mock('dotenv/config', () => ({}));

const { recordSend, recordDelivered, recordOpened } = await import('../../db/sends.js');

describe('sends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DB_HOST', 'localhost');
    vi.stubEnv('DB_PORT', '3306');
    vi.stubEnv('DB_NAME', 'flarum');
    vi.stubEnv('DB_USER', 'root');
    vi.stubEnv('DB_PASS', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('recordSend_insertsRowWithEmailResendIdAndRunDate', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const affected = await recordSend('user@example.com', 'resend-abc-123', '2026-06-20');

    expect(affected).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toMatch(/INSERT INTO digest_sends/i);
    expect(mockQuery.mock.calls[0][1]).toEqual(['user@example.com', 'resend-abc-123', '2026-06-20']);
  });

  it('recordDelivered_updatesDeliveredAt', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const affected = await recordDelivered('resend-abc-123');

    expect(affected).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toMatch(/SET delivered_at/i);
    expect(mockQuery.mock.calls[0][1]).toEqual(['resend-abc-123']);
  });

  it('recordDelivered_unknownResendId_returnsZero', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const affected = await recordDelivered('unknown-id');
    expect(affected).toBe(0);
  });

  it('recordOpened_updatesOpenedAtAndIncrementsCount', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const affected = await recordOpened('resend-abc-123');

    expect(affected).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toMatch(/open_count/i);
    expect(mockQuery.mock.calls[0][1]).toEqual(['resend-abc-123']);
  });
});
