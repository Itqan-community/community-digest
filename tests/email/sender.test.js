import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendCampaign } from '../../email/sender.js';

const hoisted = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockFetchRecipients: vi.fn()
}));

vi.stubGlobal('fetch', hoisted.mockFetch);

vi.mock('../../db/subscribers.js', () => ({
  fetchSubscribedRecipients: hoisted.mockFetchRecipients,
  ensureSubscriberExists: vi.fn()
}));

const { mockFetch, mockFetchRecipients } = hoisted;

function msOk() {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}

function msError(body) {
  return Promise.resolve({ ok: false, json: () => Promise.resolve(body) });
}

describe('sendCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MAILERSEND_API_KEY', 'ms-test-key');
    vi.stubEnv('SEND_MODE', 'test');
    vi.stubEnv('UNSUBSCRIBE_BASE_URL', 'https://digest.itqan.dev');

    mockFetchRecipients.mockResolvedValue([
      { email: 'bakasa@gmail.com', token: 'tok-abc' }
    ]);

    mockFetch.mockResolvedValue(msOk());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sendCampaign_postsToMailerSendPerRecipient', async () => {
    await sendCampaign('<html>test</html>', 'Subject');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.mailersend.com/v1/email');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.to[0].email).toBe('bakasa@gmail.com');
    expect(body.subject).toBe('Subject');
  });

  it('sendCampaign_usesBearerToken', async () => {
    await sendCampaign('<html>test</html>', 'Subject');

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer ms-test-key');
  });

  it('sendCampaign_replacesUnsubscribePlaceholder', async () => {
    await sendCampaign('<a href="__UNSUBSCRIBE_PLACEHOLDER__">unsub</a>', 'Subject');

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.html).toContain('https://digest.itqan.dev/unsubscribe?token=tok-abc');
    expect(body.html).not.toContain('__UNSUBSCRIBE_PLACEHOLDER__');
  });

  it('sendCampaign_returnsCountAndSent', async () => {
    const result = await sendCampaign('<html>test</html>', 'Subject');

    expect(result.sent).toBe(1);
    expect(result.recipientCount).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('sendCampaign_throwsWhenAllFail', async () => {
    mockFetch.mockResolvedValue(msError({ message: 'Unauthorized', status: 401 }));

    await expect(sendCampaign('<html>test</html>', 'Subject')).rejects.toThrow('All sends failed');
  });

  it('sendCampaign_sendsMultipleRecipientsInBatches', async () => {
    mockFetchRecipients.mockResolvedValue([
      { email: 'a@test.com', token: 'tok-a' },
      { email: 'b@test.com', token: 'tok-b' },
      { email: 'c@test.com', token: 'tok-c' }
    ]);

    const result = await sendCampaign('<html>test</html>', 'Subject');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.sent).toBe(3);
    expect(result.recipientCount).toBe(3);
  });
});
