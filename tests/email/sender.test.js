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

function mlResponse(data, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve({ data })
  });
}

describe('sendCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MAILERLITE_API_KEY', 'ml-test-key');
    vi.stubEnv('SEND_MODE', 'test');

    mockFetchRecipients.mockResolvedValue([
      { email: 'bakasa@gmail.com', token: 'tok-a' }
    ]);

    // Default ML API sequence: list groups → create group → POST /subscribers → create campaign → send
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'grp-1', name: 'staging-community-digest' } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'sub-1', email: 'bakasa@gmail.com' } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'camp-1', name: '[TEST] Weekly Digest - 2026-07-01' } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: {} }) }); // POST /campaigns/camp-1/schedule
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sendCampaign_createsGroupIfMissing', async () => {
    await sendCampaign('<html>test {$unsubscribe}</html>', 'Subject');

    const groupCreateCall = mockFetch.mock.calls[1];
    expect(groupCreateCall[0]).toContain('/groups');
    expect(JSON.parse(groupCreateCall[1].body)).toMatchObject({ name: 'staging-community-digest' });
  });

  it('sendCampaign_reusesExistingGroup', async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ id: 'grp-99', name: 'staging-community-digest' }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'sub-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'camp-1' } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    await sendCampaign('<html>test</html>', 'Subject');

    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('sendCampaign_replacesUnsubscribePlaceholder', async () => {
    await sendCampaign('<a href="__UNSUBSCRIBE_PLACEHOLDER__">unsub</a>', 'Subject');

    const campaignCall = mockFetch.mock.calls.find(c => {
      try { return JSON.parse(c[1]?.body)?.type === 'regular'; } catch { return false; }
    });
    const body = JSON.parse(campaignCall[1].body);
    expect(body.emails[0].content).toContain('{$unsubscribe}');
    expect(body.emails[0].content).not.toContain('__UNSUBSCRIBE_PLACEHOLDER__');
  });

  it('sendCampaign_usesStagingGroupInTestMode', async () => {
    await sendCampaign('<html>test</html>', 'Subject');

    const campaignCall = mockFetch.mock.calls.find(c => {
      try { return JSON.parse(c[1]?.body)?.type === 'regular'; } catch { return false; }
    });
    const body = JSON.parse(campaignCall[1].body);
    expect(body.name).toContain('[TEST]');
    expect(body.groups).toContain('grp-1');
  });

  it('sendCampaign_returnsCampaignIdAndRecipientCount', async () => {
    const result = await sendCampaign('<html>test</html>', 'Subject');

    expect(result.campaignId).toBe('camp-1');
    expect(result.recipientCount).toBe(1);
  });

  it('sendCampaign_throwsOnMLApiError', async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ id: 'grp-1', name: 'staging-community-digest' }] }) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ message: 'Unauthorized', status: 401 }) });

    await expect(sendCampaign('<html>test</html>', 'Subject')).rejects.toThrow('401');
  });
});
