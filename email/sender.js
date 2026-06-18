import { Resend } from 'resend';
import fs from 'fs/promises';
import 'dotenv/config';
import { fetchSubscribedRecipients, ensureSubscriberExists } from '../db/subscribers.js';

const SENDER_ADDRESS = 'Community Digest <digest@newsletter.itqan.dev>';

/**
 * Send the digest to each recipient individually so each gets a unique unsubscribe URL.
 *
 * @param {Array<{email: string, token: string}>} recipients
 * @param {(token: string) => string} htmlFn - called per-recipient to inject unsubscribe URL
 * @param {string} subject
 * @returns {{sent: number, failed: number}}
 */
export async function sendDigestEmail(recipients, htmlFn, subject) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      const html = htmlFn(recipient.token);
      await resend.emails.send({
        from: SENDER_ADDRESS,
        to: [recipient.email],
        subject,
        html
      });
      sent++;
    } catch (error) {
      failed++;
      console.error(`Failed to send to ${recipient.email}:`, error.message);
    }
  }

  return { sent, failed };
}

/**
 * Fetch the recipient list.
 * - SEND_MODE=test: returns only TEST_RECIPIENT_EMAIL (via db/subscribers.js short-circuit).
 * - SEND_MODE=prod: bootstraps digest_subscribers from Flarum users, returns subscribed rows.
 * - CSV supplement (RECIPIENTS_CSV): only used in prod mode; each email is tokenized first.
 */
export async function getRecipients() {
  const recipients = await fetchSubscribedRecipients();
  const emailSet = new Set(recipients.map(r => r.email));

  // Supplemental CSV — ignored in test mode (fetchSubscribedRecipients short-circuits to test email)
  if (process.env.SEND_MODE === 'prod' && process.env.RECIPIENTS_CSV) {
    try {
      const csv = await fs.readFile(process.env.RECIPIENTS_CSV, 'utf-8');
      const lines = csv.split('\n')
        .map(l => l.replace(/\r/g, '').trim())
        .filter(l => l && !l.startsWith('#'));

      for (const email of lines) {
        if (emailSet.has(email)) continue;
        const row = await ensureSubscriberExists(email);
        if (row && row.subscribed) {
          recipients.push({ email: row.email, token: row.token });
          emailSet.add(email);
        }
      }
      console.log(`Loaded ${lines.length} addresses from CSV`);
    } catch (error) {
      console.error('Failed to read recipients CSV:', error.message);
    }
  }

  return recipients;
}
