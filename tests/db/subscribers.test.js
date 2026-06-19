import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the mysql pool before importing subscribers
const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

vi.mock('mysql2/promise', () => ({
  default: { createPool: vi.fn(() => mockPool) }
}));

vi.mock('dotenv/config', () => ({}));

const { ensureSubscriberExists, fetchSubscribedRecipients, getSubscriberByToken, setSubscribed } =
  await import('../../db/subscribers.js');

describe('subscribers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SEND_MODE', 'test');
    vi.stubEnv('TEST_RECIPIENT_EMAIL', 'bakasa@gmail.com');
    vi.stubEnv('DB_HOST', 'localhost');
    vi.stubEnv('DB_PORT', '3306');
    vi.stubEnv('DB_NAME', 'flarum');
    vi.stubEnv('DB_USER', 'root');
    vi.stubEnv('DB_PASS', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('ensureSubscriberExists_newEmail_generatesToken', async () => {
    // INSERT IGNORE returns affectedRows=1 for new row
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
    // SELECT returns the new row
    mockQuery.mockResolvedValueOnce([[{ email: 'bakasa@gmail.com', token: 'abc-123', subscribed: 1 }]]);

    const result = await ensureSubscriberExists('bakasa@gmail.com', 1);

    expect(result).toMatchObject({ email: 'bakasa@gmail.com', subscribed: 1 });
    expect(result.token).toBeTruthy();
    // First call should be an INSERT IGNORE
    expect(mockQuery.mock.calls[0][0]).toMatch(/INSERT IGNORE/i);
  });

  it('setSubscribed_validToken_flipsSubscribedFlag', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await setSubscribed('abc-123', 0);

    expect(result).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toMatch(/UPDATE/i);
    expect(mockQuery.mock.calls[0][1]).toEqual(expect.arrayContaining([0, 'abc-123']));
  });

  it('getSubscriberByToken_unknownToken_returnsNull', async () => {
    mockQuery.mockResolvedValueOnce([[]]); // empty result

    const result = await getSubscriberByToken('unknown-token');

    expect(result).toBeNull();
  });

  it('fetchSubscribedRecipients_testMode_returnsOnlyTestRecipient', async () => {
    vi.stubEnv('SEND_MODE', 'test');
    vi.stubEnv('TEST_RECIPIENT_EMAIL', 'bakasa@gmail.com');

    // ensureSubscriberExists: INSERT IGNORE + SELECT
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockQuery.mockResolvedValueOnce([[{ email: 'bakasa@gmail.com', token: 'tok-1', subscribed: 1 }]]);

    const result = await fetchSubscribedRecipients();

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('bakasa@gmail.com');
    expect(result[0].token).toBeTruthy();
    // Must NOT have run a full-list query
    const queries = mockQuery.mock.calls.map(c => c[0]);
    const hasFullListQuery = queries.some(q =>
      typeof q === 'string' && q.includes('SELECT email, token FROM digest_subscribers WHERE subscribed = 1')
      && !q.includes('bakasa@gmail.com')
    );
    expect(hasFullListQuery).toBe(false);
  });

  it('fetchSubscribedRecipients_multipleTestEmails_returnsAllRecipients', async () => {
    vi.stubEnv('SEND_MODE', 'test');
    vi.stubEnv('TEST_RECIPIENT_EMAIL', 'bakasa@gmail.com,m.tareq@itqan.dev');

    // Promise.all fires both INSERTs before either SELECT
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]); // bakasa INSERT
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]); // tareq INSERT
    mockQuery.mockResolvedValueOnce([[{ email: 'bakasa@gmail.com', token: 'tok-1', subscribed: 1 }]]); // bakasa SELECT
    mockQuery.mockResolvedValueOnce([[{ email: 'm.tareq@itqan.dev', token: 'tok-2', subscribed: 1 }]]); // tareq SELECT

    const result = await fetchSubscribedRecipients();

    expect(result).toHaveLength(2);
    expect(result.map(r => r.email)).toContain('bakasa@gmail.com');
    expect(result.map(r => r.email)).toContain('m.tareq@itqan.dev');
  });

  it('fetchSubscribedRecipients_excludesUnsubscribed', async () => {
    vi.stubEnv('SEND_MODE', 'prod');

    // Bootstrap INSERT IGNORE (no new rows)
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);
    // SELECT returns only subscribed=1 rows
    mockQuery.mockResolvedValueOnce([[
      { email: 'a@test.com', token: 'tok-a' },
      { email: 'b@test.com', token: 'tok-b' }
    ]]);

    const result = await fetchSubscribedRecipients();

    expect(result).toHaveLength(2);
    expect(result.every(r => r.email && r.token)).toBe(true);
  });
});
