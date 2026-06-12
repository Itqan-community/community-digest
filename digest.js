import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fetchRecentPosts, closePool } from './db/posts.js';
import { extractDigest } from './llm/extract.js';
import { renderEmail } from './email/renderer.js';
import { sendDigestEmail, getRecipients } from './email/sender.js';
import { withRetry, saveFallback, logError } from './utils/fallback.js';

const DRY_RUN = process.env.DRY_RUN === 'true';
const RETRY_COUNT = 3;
const DRY_RUN_PREVIEW_PATH = path.join(process.cwd(), 'outputs', 'digest-preview.html');

async function main() {
  console.log('=== Itqan Community Weekly Digest ===\n');

  // Step 1: Fetch posts from database
  console.log('Step 1: Fetching recent posts...');
  let posts;
  try {
    posts = await withRetry(() => fetchRecentPosts(), RETRY_COUNT);
    console.log(`  Found ${posts.length} posts\n`);

    if (posts.length === 0) {
      console.log('No posts found in the time window. Skipping digest.');
      await closePool();
      process.exit(0);
    }
  } catch (error) {
    logError('Failed to fetch posts', error);
    await saveFallback({ step: 'fetch_posts', error: error.message });
    await closePool();
    process.exit(1);
  }

  // Step 2: Extract insights via LLM
  console.log('Step 2: Extracting insights via LLM...');
  let digest;
  try {
    digest = await withRetry(() => extractDigest(posts), RETRY_COUNT);
    console.log(`  Featured: ${digest.featured_topic?.title || 'N/A'}
  Themes: ${digest.themes?.length || 0}
  Questions: ${digest.open_questions?.length || 0}
  Contributors: ${digest.contributors?.length || 0}\n`);
  } catch (error) {
    logError('Failed to extract insights', error);
    await saveFallback({ step: 'llm_extract', error: error.message, data: posts });
    await closePool();
    process.exit(1);
  }

  // Step 3: Render email
  console.log('Step 3: Rendering email...');
  let html;
  try {
    html = await withRetry(() => renderEmail(digest), RETRY_COUNT);
    console.log('  Email rendered successfully\n');
  } catch (error) {
    logError('Failed to render email', error);
    await saveFallback({ step: 'render_email', error: error.message, data: digest });
    await closePool();
    process.exit(1);
  }

  // Dry run mode
  if (DRY_RUN) {
    console.log('DRY RUN: Saving HTML to outputs/digest-preview.html');
    fs.mkdirSync(path.dirname(DRY_RUN_PREVIEW_PATH), { recursive: true });
    fs.writeFileSync(DRY_RUN_PREVIEW_PATH, html);
    console.log(`  Preview saved to: ${DRY_RUN_PREVIEW_PATH}`);
    await closePool();
    process.exit(0);
  }

  // Step 4: Get recipients
  console.log('Step 4: Fetching recipients...');
  let recipients;
  try {
    recipients = await withRetry(() => getRecipients(), RETRY_COUNT);
    console.log(`  Found ${recipients.length} recipients\n`);

    if (recipients.length === 0) {
      console.log('No recipients found. Skipping email send.');
      await closePool();
      process.exit(0);
    }
  } catch (error) {
    logError('Failed to fetch recipients', error);
    await saveFallback({ step: 'fetch_recipients', error: error.message });
    await closePool();
    process.exit(1);
  }

  // Step 5: Send emails
  console.log('Step 5: Sending emails...');
  try {
    const result = await sendDigestEmail(
      recipients,
      html,
      'الملخص الأسبوعي لمجتمع إتقان'
    );
    console.log(`  Sent: ${result.sent} | Failed: ${result.failed}\n`);
  } catch (error) {
    logError('Failed to send emails', error);
    await saveFallback({ step: 'send_email', error: error.message, data: { html, recipients } });
    await closePool();
    process.exit(1);
  }

  await closePool();
  console.log('=== Digest complete ===');
  process.exit(0);
}

main().catch(error => {
  logError('Unhandled error in main', error);
  closePool().then(() => process.exit(1));
});
