import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function toArabicDate(date) {
  const day = ARABIC_DAYS[date.getDay()];
  const num = date.getDate();
  const month = ARABIC_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${num} ${month} ${year}`;
}

const SYSTEM_PROMPT = `
Role:
You are a specialized Data Extraction Engine for the "Itqan Community" weekly digest. Your goal is to transform raw forum discussion logs into a highly structured JSON object that will be injected into an HTML email template.

Objective:
Analyze the provided forum data and extract key insights. You must identify:
1. The single most impactful discussion (The "Featured Topic").
2. Major themes or categories of discussion (The "Themes").
3. Unresolved or thought-provoking questions (The "Open Questions").

STRICT CONSTRAINTS:
1. LANGUAGE: Every single string intended for human reading MUST be in professional, eloquent Arabic. Do not use English in any content field.
2. OUTPUT FORMAT: You must return ONLY a valid JSON object. Do not include markdown formatting (no \`\`\`json blocks), no preamble, and no postscript. The output must be parseable by JSON.parse().
3. DATA INTEGRITY: Ensure all URLs and Discussion IDs are extracted accurately from the source text.
4. TONE: The Arabic text should be sophisticated, respectful, and community-centric (suitable for a high-quality religious/technical community).

JSON STRUCTURE SCHEMA:
You must adhere to this exact schema:

{
  "window_label": "String (Use the exact value provided in the DATE CONTEXT section below — do NOT calculate or guess the date)",
  "featured_topic": {
    "title": "String (The headline of the main discussion)",
    "excerpt": "String (A 2-3 sentence summary highlighting the main tension or solution in the discussion)",
    "author_names": ["Array of Strings (Names of the main participants)"],
    "url": "String (The direct link to the discussion)"
  },
  "themes": [
    {
      "title": "String (A short, catchy title for the theme in Arabic)",
      "description": "String (A one-sentence summary of the discussion in Arabic)",
      "url": "String (The direct link to the discussion)",
      "discussion_id": "String (The numeric ID found in the URL)"
    }
  ],
  "open_questions": [
    {
      "question": "String (The question phrased as a compelling discussion starter in Arabic)",
      "url": "String (The direct link to the discussion)",
      "discussion_id": "String (The numeric ID found in the URL)"
    }
  ],
}

Mapping Instructions for Logic:
- Featured Topic Excerpt: In the excerpt, if specific users are mentioned, incorporate them naturally into the Arabic text (e.g., "أشار [Name] إلى...").
- Themes: If multiple posts discuss the same topic, consolidate them into one theme object.
- Discussion ID: Always extract the numeric ID from the end of the URL (e.g., from community.itqan.dev/d/466, the ID is 466).

DATE CONTEXT:
The digest covers the period from {{DATE_FROM}} to {{DATE_TO}}. Use this exact date for the window_label.

Input Data (Raw Forum Logs):
`;

function formatPostsForPrompt(posts) {
  return posts.map(post => {
    return `
Discussion #${post.discussion_id}: ${post.title}
Author: ${post.author_name}
URL: ${post.url}
Body: ${post.body}
Views: ${post.view_count} | Replies: ${post.reply_count} | Likes: ${post.like_count}
Interactions: ${post.interactions}
`;
  }).join('\n---\n');
}

async function loadProvider() {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'openai') {
    const mod = await import('./openai.js');
    return mod.extractInsights;
  }
  const mod = await import('./gemini.js');
  return mod.extractInsights;
}

function parseResponse(text) {
  if (typeof text !== 'string') {
    return text;
  }
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse LLM response as JSON:', cleaned.substring(0, 200));
    throw new Error('LLM returned invalid JSON');
  }
}

export async function extractDigest(posts) {
  const cacheKey = new Date().toISOString().slice(0, 10);
  const cachePath = path.join(process.cwd(), 'outputs', `llm-cache-${cacheKey}.json`);

  if (fs.existsSync(cachePath)) {
    console.log('  [cache hit] Reusing LLM result from earlier today');
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return { digest: cached.digest, model: cached.model, cached: true };
  }

  const extractInsights = await loadProvider();

  const oldestPost = posts.length > 0 ? posts[posts.length - 1] : null;
  const days = oldestPost
    ? Math.max(1, Math.round((Date.now() - new Date(oldestPost.created_at).getTime()) / 86400000))
    : 7;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const toDate = new Date();
  const dateFrom = toArabicDate(fromDate);
  const dateTo = toArabicDate(toDate);

  const prompt = SYSTEM_PROMPT
    .replace('{{DATE_FROM}}', dateFrom)
    .replace('{{DATE_TO}}', dateTo)
    + formatPostsForPrompt(posts);

  const { data, model } = await extractInsights(prompt);
  const digest = parseResponse(data);

  digest.window_label = `ملخص الأسبوع: ${dateFrom} - ${dateTo}`;

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({ digest, model }, null, 2));

  return { digest, model, cached: false };
}
