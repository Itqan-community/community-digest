import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';
import 'dotenv/config';
import { getSubscriberByToken, setSubscribed, setSubscribedByEmail } from './db/subscribers.js';
import { recordDelivered, recordOpened } from './db/sends.js';

const BRAND = '#3d6052';
const SAGE = '#7ba38f';
const LIGHT = '#f0f4f2';
const LOGO = 'https://pub-9ee413c8af4041c6bd5223d08f5d0f0f.r2.dev/static/logo/logo.png';
const FORUM = process.env.FORUM_BASE_URL || 'https://community.itqan.dev';

function page(title, heading, body) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'IBM Plex Sans Arabic', Arial, sans-serif; background: #fcfcfc; min-height: 100vh; display: flex; flex-direction: column; }
  .brand-header { background: ${BRAND}; padding: 32px; text-align: center; }
  .brand-header img { display: block; margin: 0 auto 12px; width: 52px; height: 52px; filter: brightness(0) invert(1); opacity: 0.9; }
  .brand-header span { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); letter-spacing: 0.1em; }
  .card { max-width: 480px; margin: 0 auto; padding: 48px 32px; text-align: center; flex: 1; }
  .icon { width: 56px; height: 56px; background: ${LIGHT}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 24px; color: ${BRAND}; }
  h2 { font-size: 24px; font-weight: 700; color: ${BRAND}; margin-bottom: 12px; }
  .sub { font-size: 14px; color: #6b7280; line-height: 1.7; margin-bottom: 8px; }
  .hint { font-size: 13px; color: #9ca3af; margin-bottom: 32px; }
  .btn { display: inline-block; background: ${SAGE}; color: #fff; font-size: 14px; font-weight: 700; padding: 14px 40px; border-radius: 12px; text-decoration: none; box-shadow: 0 4px 14px rgba(123,163,143,0.3); }
  .footer-link { display: block; margin-top: 20px; padding-top: 20px; border-top: 1px solid #f3f4f6; font-size: 12px; font-weight: 600; color: rgba(61,96,82,0.5); text-decoration: none; }
</style>
</head>
<body>
<div class="brand-header">
  <img src="${LOGO}" width="52" height="52" alt="Itqan">
  <span>مجتمع إتقان</span>
</div>
<div class="card">
  ${body}
  <a href="${FORUM}" class="footer-link">العودة للمجتمع ←</a>
</div>
</body>
</html>`;
}

function unsubscribePage(token) {
  return page(
    'تم إلغاء الاشتراك',
    'تم إلغاء الاشتراك',
    `<div class="icon">✓</div>
    <h2>تم إلغاء اشتراكك</h2>
    <p class="sub">لن يصلك الملخص الأسبوعي لمجتمع إتقان بعد الآن.</p>
    <p class="hint">تغيّر رأيك؟ يمكنك إعادة الاشتراك في أي وقت.</p>
    <a href="/resubscribe?token=${encodeURIComponent(token)}" class="btn">إعادة الاشتراك</a>`
  );
}

function resubscribePage() {
  return page(
    'تم تجديد الاشتراك',
    'تم تجديد الاشتراك',
    `<div class="icon">✓</div>
    <h2>تم تجديد اشتراكك</h2>
    <p class="sub">سيصلك الملخص الأسبوعي لمجتمع إتقان مجدداً.</p>
    <p class="hint">يسعدنا عودتك!</p>`
  );
}

function notFoundPage() {
  return page(
    'رابط غير صالح',
    'رابط غير صالح',
    `<div class="icon">✗</div>
    <h2>رابط غير صالح</h2>
    <p class="sub">الرابط غير صحيح أو منتهي الصلاحية.</p>`
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyWebhookSignature(rawBody, headers, secret) {
  const msgId = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const sigHeader = headers['svix-signature'];

  if (!msgId || !timestamp || !sigHeader) return false;

  const tsNum = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - tsNum) > 300) return false;

  const key = Buffer.from(secret.replace('whsec_', ''), 'base64');
  const toSign = `${msgId}.${timestamp}.${rawBody}`;
  const computed = crypto.createHmac('sha256', key).update(toSign).digest('base64');

  return sigHeader.split(' ').some(part => {
    const [, sig] = part.split(',');
    return sig === computed;
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');

    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }

    if (pathname === '/unsubscribe') {
      const token = searchParams.get('token');
      const subscriber = token ? await getSubscriberByToken(token) : null;

      if (!subscriber) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(notFoundPage());
      }

      await setSubscribed(token, 0);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(unsubscribePage(token));
    }

    if (pathname === '/resubscribe') {
      const token = searchParams.get('token');
      const subscriber = token ? await getSubscriberByToken(token) : null;

      if (!subscriber) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(notFoundPage());
      }

      await setSubscribed(token, 1);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(resubscribePage());
    }

    if (pathname === '/resend-webhook' && req.method === 'POST') {
      const rawBody = await readBody(req);
      const secret = process.env.RESEND_WEBHOOK_SECRET;

      if (!secret || !verifyWebhookSignature(rawBody, req.headers, secret)) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        return res.end('unauthorized');
      }

      const event = JSON.parse(rawBody.toString());
      const email = event?.data?.to?.[0]?.email;
      const resendId = event?.data?.email_id;

      if (event.type === 'email.bounced' && event?.data?.bounce?.type === 'hard') {
        if (email) await setSubscribedByEmail(email, 0);
      } else if (event.type === 'email.complained') {
        if (email) await setSubscribedByEmail(email, 0);
      } else if (event.type === 'email.delivered') {
        if (resendId) await recordDelivered(resendId);
      } else if (event.type === 'email.opened') {
        if (resendId) await recordOpened(resendId);
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
}

// Start when run directly (argv check) or when PM2/production spawns us (DIGEST_SERVER=1)
if (process.env.DIGEST_SERVER === '1' || process.argv[1] === new URL(import.meta.url).pathname) {
  const port = parseInt(process.env.PORT || '3000');
  const server = createServer();
  server.listen(port, () => {
    console.log(`Digest server listening on port ${port}`);
  });
}
