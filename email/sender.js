import Resend from 'resend';
import fs from 'fs/promises';
import 'dotenv/config';

const BATCH_SIZE = 50;
const SENDER_ADDRESS = 'Itqan Community <digest@itqan.dev>';

export async function sendDigestEmail(recipients, html, subject) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const sent = [];
  const failed = [];

  // Send in batches
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    try {
      const result = await resend.emails.send({
        from: SENDER_ADDRESS,
        to: batch,
        subject,
        html
      });

      sent.push(...batch);
      console.log(`Sent batch ${Math.floor(i / BATCH_SIZE) + 1} (${result.id})`);
    } catch (error) {
      failed.push(...batch);
      console.error(`Failed to send batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
    }
  }

  return { sent: sent.length, failed: failed.length };
}

export async function getRecipients() {
  const emails = new Set();

  // Primary: from database
  const { fetchRecipientEmails } = await import('../db/posts.js');
  try {
    const dbEmails = await fetchRecipientEmails();
    dbEmails.forEach(email => emails.add(email));
    console.log(`Loaded ${dbEmails.length} recipients from database`);
  } catch (error) {
    console.error('Failed to fetch recipients from DB:', error.message);
  }

  // Supplemental: from CSV file
  const csvPath = process.env.RECIPIENTS_CSV;
  if (csvPath) {
    try {
      const csv = await fs.readFile(csvPath, 'utf-8');
      const lines = csv.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(l => l && !l.startsWith('#'));
      lines.forEach(email => emails.add(email));
      console.log(`Loaded ${lines.length} recipients from CSV`);
    } catch (error) {
      console.error('Failed to read recipients CSV:', error.message);
    }
  }

  return [...emails];
}
