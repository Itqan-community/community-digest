import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendDigestEmail } from '../../email/sender';

vi.mock('resend', () => {
  const mockSend = vi.fn();
  const Resend = vi.fn(function () {
    this.emails = { send: mockSend };
  });
  return { default: Resend, mockSend };
});
import Resend, { mockSend } from 'resend';

describe('sendDigestEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 're_test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends email to all recipients', async () => {
    mockSend.mockResolvedValue({ id: 'test-id' });

    const recipients = ['user1@test.com', 'user2@test.com'];
    const html = '<html>Test</html>';
    const subject = 'Test Subject';

    const result = await sendDigestEmail(recipients, html, subject);

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('handles send failures gracefully', async () => {
    mockSend
      .mockResolvedValueOnce({ id: 'test-id' })
      .mockRejectedValueOnce(new Error('Failed'));

    // 51 recipients: first batch (50) succeeds, second batch (1) fails
    const recipients = Array.from({ length: 51 }, (_, i) => `user${i}@test.com`);
    const html = '<html>Test</html>';
    const subject = 'Test Subject';

    const result = await sendDigestEmail(recipients, html, subject);

    expect(result.sent).toBe(50);
    expect(result.failed).toBe(1);
  });
});
