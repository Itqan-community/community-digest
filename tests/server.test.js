import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';

// Mock subscribers DB before importing server
vi.mock('../db/subscribers.js', () => ({
  getSubscriberByToken: vi.fn(),
  setSubscribed: vi.fn(),
  setSubscribedByEmail: vi.fn()
}));

vi.mock('dotenv/config', () => ({}));

import { getSubscriberByToken, setSubscribed, setSubscribedByEmail } from '../db/subscribers.js';
import { createServer } from '../server.js';

const TEST_WEBHOOK_SECRET = 'whsec_dGVzdHNlY3JldGtleWZvcnRlc3Rpbmc='; // base64("testsecretkeyffortesting")

let server;
let baseUrl;

beforeAll(async () => {
  process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  server = createServer();
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

async function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function post(path, body, headers = {}) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers }
    }, (res) => {
      let data = '';
      res.on('data', d => (data += d));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function svixHeaders(bodyStr, secret = TEST_WEBHOOK_SECRET) {
  const msgId = 'msg_test123';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from(secret.replace('whsec_', ''), 'base64');
  const toSign = `${msgId}.${timestamp}.${bodyStr}`;
  const sig = crypto.createHmac('sha256', key).update(toSign).digest('base64');
  return { 'svix-id': msgId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${sig}` };
}

describe('server', () => {
  it('health_returns200', async () => {
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body).toBe('ok');
  });

  it('unsubscribe_validToken_setsSubscribedFalse_andRendersConfirmation', async () => {
    getSubscriberByToken.mockResolvedValue({ email: 'test@test.com', token: 'valid-tok', subscribed: 1 });
    setSubscribed.mockResolvedValue(1);

    const { status, body } = await get('/unsubscribe?token=valid-tok');

    expect(status).toBe(200);
    expect(setSubscribed).toHaveBeenCalledWith('valid-tok', 0);
    expect(body).toContain('تم إلغاء اشتراكك');
    expect(body).toContain('/resubscribe?token=valid-tok');
  });

  it('resubscribe_validToken_setsSubscribedTrue', async () => {
    getSubscriberByToken.mockResolvedValue({ email: 'test@test.com', token: 'valid-tok', subscribed: 0 });
    setSubscribed.mockResolvedValue(1);

    const { status, body } = await get('/resubscribe?token=valid-tok');

    expect(status).toBe(200);
    expect(setSubscribed).toHaveBeenCalledWith('valid-tok', 1);
    expect(body).toContain('تم تجديد اشتراكك');
  });

  it('unsubscribe_missingToken_returns404', async () => {
    getSubscriberByToken.mockResolvedValue(null);

    const { status } = await get('/unsubscribe?token=bad-token');
    expect(status).toBe(404);
  });

  describe('POST /resend-webhook', () => {
    it('resendWebhook_hardBounce_setsSubscribedFalse', async () => {
      setSubscribedByEmail.mockResolvedValue(1);
      const payload = {
        type: 'email.bounced',
        data: { to: [{ email: 'bounce@example.com' }], bounce: { type: 'hard' } }
      };
      const bodyStr = JSON.stringify(payload);
      const { status } = await post('/resend-webhook', bodyStr, svixHeaders(bodyStr));
      expect(status).toBe(200);
      expect(setSubscribedByEmail).toHaveBeenCalledWith('bounce@example.com', 0);
    });

    it('resendWebhook_complaint_setsSubscribedFalse', async () => {
      setSubscribedByEmail.mockResolvedValue(1);
      const payload = {
        type: 'email.complained',
        data: { to: [{ email: 'spam@example.com' }] }
      };
      const bodyStr = JSON.stringify(payload);
      const { status } = await post('/resend-webhook', bodyStr, svixHeaders(bodyStr));
      expect(status).toBe(200);
      expect(setSubscribedByEmail).toHaveBeenCalledWith('spam@example.com', 0);
    });

    it('resendWebhook_softBounce_noAction', async () => {
      setSubscribedByEmail.mockClear();
      const payload = {
        type: 'email.bounced',
        data: { to: [{ email: 'soft@example.com' }], bounce: { type: 'soft' } }
      };
      const bodyStr = JSON.stringify(payload);
      const { status } = await post('/resend-webhook', bodyStr, svixHeaders(bodyStr));
      expect(status).toBe(200);
      expect(setSubscribedByEmail).not.toHaveBeenCalled();
    });

    it('resendWebhook_invalidSignature_returns401', async () => {
      const payload = { type: 'email.bounced', data: { to: [{ email: 'x@x.com' }], bounce: { type: 'hard' } } };
      const bodyStr = JSON.stringify(payload);
      const { status } = await post('/resend-webhook', bodyStr, {
        'svix-id': 'msg_fake',
        'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
        'svix-signature': 'v1,invalidsignature'
      });
      expect(status).toBe(401);
    });

    it('resendWebhook_unknownEvent_returns200', async () => {
      setSubscribedByEmail.mockClear();
      const payload = { type: 'email.sent', data: { to: [{ email: 'x@x.com' }] } };
      const bodyStr = JSON.stringify(payload);
      const { status } = await post('/resend-webhook', bodyStr, svixHeaders(bodyStr));
      expect(status).toBe(200);
      expect(setSubscribedByEmail).not.toHaveBeenCalled();
    });
  });
});
