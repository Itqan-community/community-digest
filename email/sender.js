import Resend from 'resend';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function sendDigestEmail(recipients, html, subject) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const sent = [];
  const failed = [];

  // Send in batches of 50
  const batchSize = 50;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);

    try {
      const result = await resend.emails.send({
        from: 'Itqan Community <digest@itqan.dev>',
        to: batch,
        subject,
        html
      });

      sent.push(...batch);
      console.log(`Sent batch ${Math.floor(i / batchSize) + 1} (${result.id})`);
    } catch (error) {
      failed.push(...batch);
      console.error(`Failed to send batch ${Math.floor(i / batchSize) + 1}:`, error.message);
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
  if (csvPath && fs.existsSync(csvPath)) {
    const csv = fs.readFileSync(csvPath, 'utf-8');
    const lines = csv.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    lines.forEach(email => emails.add(email));
    console.log(`Loaded ${lines.length} recipients from CSV`);
  }

  return [...emails];
}
