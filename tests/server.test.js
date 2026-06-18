import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';

// Mock subscribers DB before importing server
vi.mock('../db/subscribers.js', () => ({
  getSubscriberByToken: vi.fn(),
  setSubscribed: vi.fn()
}));

vi.mock('dotenv/config', () => ({}));

import { getSubscriberByToken, setSubscribed } from '../db/subscribers.js';
import { createServer } from '../server.js';

let server;
let baseUrl;

beforeAll(async () => {
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
});
