import 'dotenv/config';
import { fetchSubscribedRecipients } from '../db/subscribers.js';

const MS_API = 'https://api.mailersend.com/v1';
const SEND_CONCURRENCY = 20;

export async function sendCampaign(templateHtml, subject) {
  const baseUrl = process.env.UNSUBSCRIBE_BASE_URL || 'https://digest.itqan.dev';
  const recipients = await fetchSubscribedRecipients();

  console.log(`  Sending to ${recipients.length} recipient(s)...`);

  let sent = 0;
  const failures = [];

  for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
    const batch = recipients.slice(i, i + SEND_CONCURRENCY);
    await Promise.all(batch.map(async ({ email, token }) => {
      const html = templateHtml.replace(
        /__UNSUBSCRIBE_PLACEHOLDER__/g,
        `${baseUrl}/unsubscribe?token=${token}`
      );
      const res = await fetch(`${MS_API}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MAILERSEND_API_KEY}`
        },
        body: JSON.stringify({
          from: { email: process.env.FROM_EMAIL || 'tools@itqan.dev', name: 'مجتمع إتقان' },
          to: [{ email }],
          subject,
          html
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        failures.push({ email, error: JSON.stringify(err) });
      } else {
        sent++;
      }
    }));
  }

  if (sent === 0 && failures.length > 0) {
    throw new Error(`All sends failed. First error: ${failures[0].error}`);
  }

  if (failures.length > 0) {
    console.warn(`  Warning: ${failures.length} send(s) failed`);
  }

  return { sent, failed: failures.length, recipientCount: recipients.length };
}
