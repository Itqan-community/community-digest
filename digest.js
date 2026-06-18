import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fetchRecentPosts, fetchContributorActivity, closePool } from './db/posts.js';
import { extractDigest } from './llm/extract.js';
import { renderEmail } from './email/renderer.js';
import { sendDigestEmail, getRecipients } from './email/sender.js';
import { withRetry, saveFallback, logError } from './utils/fallback.js';
import { computeContributors } from './utils/contributors.js';

const DRY_RUN = process.env.DRY_RUN === 'true';
const RETRY_COUNT = 3;
const DRY_RUN_PREVIEW_PATH = path.join(process.cwd(), 'outputs', 'digest-preview.html');
const UNSUBSCRIBE_BASE_URL = process.env.UNSUBSCRIBE_BASE_URL || 'https://digest.community.itqan.dev';

async function main() {
  console.log('=== Itqan Community Weekly Digest ===\n');
  console.log(`  Mode: ${process.env.SEND_MODE === 'prod' ? 'PRODUCTION' : 'TEST (bakasa@gmail.com only)'}\n`);

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
  Questions: ${digest.open_questions?.length || 0}\n`);
  } catch (error) {
    logError('Failed to extract insights', error);
    await saveFallback({ step: 'llm_extract', error: error.message, data: posts });
    await closePool();
    process.exit(1);
  }

  // Step 2b: Compute contributors from DB (weighted, deterministic)
  console.log('Step 2b: Computing weighted contributors from DB...');
  try {
    const activity = await withRetry(() => fetchContributorActivity(), RETRY_COUNT);
    digest.contributors = computeContributors(activity);
    console.log(`  Contributors: ${digest.contributors.length}\n`);
  } catch (error) {
    logError('Failed to compute contributors', error);
    digest.contributors = [];
  }

  // Step 3: Render email (shared template, __UNSUBSCRIBE_PLACEHOLDER__ left in place)
  console.log('Step 3: Rendering email template...');
  let templateHtml;
  try {
    templateHtml = await withRetry(() => renderEmail(digest), RETRY_COUNT);
    console.log('  Email rendered successfully\n');
  } catch (error) {
    logError('Failed to render email', error);
    await saveFallback({ step: 'render_email', error: error.message, data: digest });
    await closePool();
    process.exit(1);
  }

  // Dry run mode — save preview with placeholder visible
  if (DRY_RUN) {
    console.log('DRY RUN: Saving HTML to outputs/digest-preview.html');
    fs.mkdirSync(path.dirname(DRY_RUN_PREVIEW_PATH), { recursive: true });
    fs.writeFileSync(DRY_RUN_PREVIEW_PATH, templateHtml);
    console.log(`  Preview saved to: ${DRY_RUN_PREVIEW_PATH}`);
    console.log('  Note: __UNSUBSCRIBE_PLACEHOLDER__ visible in preview — replaced per-recipient in live sends.');
    await closePool();
    process.exit(0);
  }

  // Step 4: Get recipients [{email, token}]
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

  // Step 5: Send emails — per-recipient with personalized unsubscribe URL
  console.log('Step 5: Sending emails...');
  try {
    // htmlFn injects the per-recipient unsubscribe URL into the shared template
    const htmlFn = (token) =>
      templateHtml.replace(
        /__UNSUBSCRIBE_PLACEHOLDER__/g,
        `${UNSUBSCRIBE_BASE_URL}/unsubscribe?token=${token}`
      );

    const result = await sendDigestEmail(
      recipients,
      htmlFn,
      'الملخص الأسبوعي لمجتمع إتقان'
    );
    console.log(`  Sent: ${result.sent} | Failed: ${result.failed}\n`);
  } catch (error) {
    logError('Failed to send emails', error);
    await saveFallback({ step: 'send_email', error: error.message, data: { recipients } });
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
