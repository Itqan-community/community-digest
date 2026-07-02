import 'dotenv/config';
import { fetchSubscribedRecipients } from '../db/subscribers.js';

const ML_API = 'https://connect.mailerlite.com/api';
const PROD_GROUP = 'community-digest';
const TEST_GROUP = 'staging-community-digest';

async function mlFetch(method, path, body) {
  const res = await fetch(`${ML_API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function ensureGroup(name) {
  const { data: groups } = await mlFetch('GET', '/groups?limit=100');
  const found = groups.find(g => g.name === name);
  if (found) return found.id;
  const { data: created } = await mlFetch('POST', '/groups', { name });
  console.log(`  Created ML group "${name}" (id: ${created.id})`);
  return created.id;
}

const SYNC_CONCURRENCY = 20;

async function syncToGroup(emails, groupId) {
  for (let i = 0; i < emails.length; i += SYNC_CONCURRENCY) {
    const batch = emails.slice(i, i + SYNC_CONCURRENCY);
    await Promise.all(batch.map(({ email }) =>
      mlFetch('POST', '/subscribers', { email, groups: [groupId] })
    ));
  }
}

export async function sendCampaign(templateHtml, subject) {
  const isProd = process.env.SEND_MODE === 'prod';
  const groupName = isProd ? PROD_GROUP : TEST_GROUP;
  const runDate = new Date().toISOString().slice(0, 10);
  const groupId = await ensureGroup(groupName);

  const recipients = await fetchSubscribedRecipients();
  const emails = recipients.map(r => ({ email: r.email }));
  console.log(`  Syncing ${emails.length} subscriber(s) to ML group "${groupName}"...`);
  await syncToGroup(emails, groupId);
  console.log('  Sync complete.\n');

  const content = templateHtml.replace(/__UNSUBSCRIBE_PLACEHOLDER__/g, '{$unsubscribe}');
  const campaignName = `${isProd ? '' : '[TEST] '}Weekly Digest - ${runDate}`;

  // Idempotency: reuse existing draft campaign with same name to prevent duplicate sends on retry
  const { data: existingCampaigns } = await mlFetch('GET', `/campaigns?filter[name]=${encodeURIComponent(campaignName)}&limit=10`);
  const existing = existingCampaigns.find(c => c.name === campaignName);

  let campaign;
  if (existing && existing.status === 'sent') {
    console.log(`  Campaign "${campaignName}" already sent (id: ${existing.id}) — skipping`);
    return { campaignId: existing.id, recipientCount: emails.length };
  } else if (existing) {
    campaign = existing;
    console.log(`  Reusing existing campaign "${campaignName}" (id: ${campaign.id}, status: ${campaign.status})`);
  } else {
    const { data: created } = await mlFetch('POST', '/campaigns', {
      name: campaignName,
      type: 'regular',
      emails: [{
        subject,
        from: process.env.FROM_EMAIL || 'tools@itqan.dev',
        from_name: 'مجتمع إتقان',
        content
      }],
      groups: [groupId]
    });
    campaign = created;
  }

  await mlFetch('POST', `/campaigns/${campaign.id}/schedule`, { delivery: 'instant' });
  console.log(`  Campaign "${campaignName}" sent (id: ${campaign.id})`);

  return { campaignId: campaign.id, recipientCount: emails.length };
}
