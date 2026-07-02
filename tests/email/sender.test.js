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

    // Default ML API sequence: GET /groups → POST /groups → POST /subscribers → GET /campaigns (none) → POST /campaigns → POST /schedule
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })                                                                             // GET /groups (empty)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'grp-1', name: 'staging-community-digest' } }) })                             // POST /groups
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'sub-1', email: 'bakasa@gmail.com' } }) })                                    // POST /subscribers
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })                                                                             // GET /campaigns?filter[status]=draft (none)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'camp-1', name: '[TEST] Weekly Digest - 2026-07-01', status: 'draft' } }) })  // POST /campaigns
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: {} }) });                                                                            // POST /schedule
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
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ id: 'grp-99', name: 'staging-community-digest' }] }) }) // GET /groups
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'sub-1' } }) })                                      // POST /subscribers
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })                                                    // GET /campaigns (none)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'camp-1', status: 'draft' } }) })                    // POST /campaigns
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });                                                             // POST /schedule

    await sendCampaign('<html>test</html>', 'Subject');

    expect(mockFetch).toHaveBeenCalledTimes(5);
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

  it('sendCampaign_reusesExistingCampaignOnRetry', async () => {
    // Simulates: campaign created, /schedule blips, retry fires
    // Second attempt must NOT create a second campaign
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T10:00:00Z'));
    mockFetch.mockReset();
    // Code order: GET /groups → POST /subscribers → GET /campaigns → POST /campaigns → POST /schedule
    mockFetch
      // attempt 1
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ id: 'grp-1', name: 'staging-community-digest' }] }) }) // GET /groups
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'sub-1' } }) })                                      // POST /subscribers
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })                                                    // GET /campaigns (none)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'camp-1', name: '[TEST] Weekly Digest - 2026-07-04', status: 'draft' } }) }) // POST /campaigns
      .mockRejectedValueOnce(new Error('network blip'))                                                                                   // POST /schedule → fails
      // attempt 2: finds existing campaign, skips POST /campaigns
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ id: 'grp-1', name: 'staging-community-digest' }] }) }) // GET /groups
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'sub-1' } }) })                                      // POST /subscribers
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ id: 'camp-1', name: '[TEST] Weekly Digest - 2026-07-04', status: 'draft' }] }) }) // GET /campaigns (finds existing)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: {} }) });                                                   // POST /schedule

    // withRetry wrapper
    let result;
    for (let i = 1; i <= 3; i++) {
      try { result = await sendCampaign('<html>test</html>', 'Subject'); break; }
      catch (_) { /* retry */ }
    }

    const campaignCreateCalls = mockFetch.mock.calls.filter(c => {
      try { return JSON.parse(c[1]?.body)?.type === 'regular'; } catch { return false; }
    });
    expect(campaignCreateCalls).toHaveLength(1); // only created once across both attempts
    expect(result.campaignId).toBe('camp-1');
    vi.useRealTimers();
  });
});
