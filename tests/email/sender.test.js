import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendDigestEmail } from '../../email/sender.js';

const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn(function () {
    this.emails = { send: mockSend };
  })
}));

vi.mock('../../db/subscribers.js', () => ({
  fetchSubscribedRecipients: vi.fn(),
  ensureSubscriberExists: vi.fn()
}));

describe('sendDigestEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('SEND_MODE', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sendDigestEmail_sendsIndividuallyPerRecipient', async () => {
    mockSend.mockResolvedValue({ id: 'msg-1' });

    const recipients = [
      { email: 'a@test.com', token: 'tok-a' },
      { email: 'b@test.com', token: 'tok-b' },
      { email: 'c@test.com', token: 'tok-c' }
    ];
    const htmlFn = (token) => `<html>${token}</html>`;

    const result = await sendDigestEmail(recipients, htmlFn, 'Subject');

    // N recipients → N individual send calls
    expect(mockSend).toHaveBeenCalledTimes(3);
    // Each call has exactly 1 recipient in `to`
    for (const call of mockSend.mock.calls) {
      expect(call[0].to).toHaveLength(1);
    }
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
  });

  it('sendDigestEmail_injectsPerRecipientToken', async () => {
    mockSend.mockResolvedValue({ id: 'msg-1' });

    const recipients = [
      { email: 'a@test.com', token: 'TOKEN_A' },
      { email: 'b@test.com', token: 'TOKEN_B' }
    ];
    const htmlFn = (token) => `<a href="__UNSUBSCRIBE_PLACEHOLDER__">x</a>`.replace(/__UNSUBSCRIBE_PLACEHOLDER__/g, `https://digest.itqan.dev/unsubscribe?token=${token}`);

    await sendDigestEmail(recipients, htmlFn, 'Subject');

    const calls = mockSend.mock.calls;
    expect(calls[0][0].html).toContain('TOKEN_A');
    expect(calls[1][0].html).toContain('TOKEN_B');
    // Ensure tokens don't cross
    expect(calls[0][0].html).not.toContain('TOKEN_B');
    expect(calls[1][0].html).not.toContain('TOKEN_A');
  });

  it('sendDigestEmail_oneFailureDoesNotAbortRest', async () => {
    mockSend
      .mockResolvedValueOnce({ id: 'msg-1' })
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce({ id: 'msg-3' });

    const recipients = [
      { email: 'a@test.com', token: 'tok-a' },
      { email: 'b@test.com', token: 'tok-b' },
      { email: 'c@test.com', token: 'tok-c' }
    ];
    const htmlFn = (token) => `<html>${token}</html>`;

    const result = await sendDigestEmail(recipients, htmlFn, 'Subject');

    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
  });
});
