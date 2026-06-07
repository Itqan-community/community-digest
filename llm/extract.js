import 'dotenv/config';

const SYSTEM_PROMPT = `
Role:
You are a specialized Data Extraction Engine for the "Itqan Community" weekly digest. Your goal is to transform raw forum discussion logs into a highly structured JSON object that will be injected into an HTML email template.

Objective:
Analyze the provided forum data and extract key insights. You must identify:
1. The single most impactful discussion (The "Featured Topic").
2. Major themes or categories of discussion (The "Themes").
3. Unresolved or thought-provoking questions (The "Open Questions").
4. Highly active and helpful users (The "Contributors").

STRICT CONSTRAINTS:
1. LANGUAGE: Every single string intended for human reading MUST be in professional, eloquent Arabic. Do not use English in any content field.
2. OUTPUT FORMAT: You must return ONLY a valid JSON object. Do not include markdown formatting (no \`\`\`json blocks), no preamble, and no postscript. The output must be parseable by JSON.parse().
3. DATA INTEGRITY: Ensure all URLs and Discussion IDs are extracted accurately from the source text.
4. TONE: The Arabic text should be sophisticated, respectful, and community-centric (suitable for a high-quality religious/technical community).

JSON STRUCTURE SCHEMA:
You must adhere to this exact schema:

{
  "window_label": "String (Format: 'ملخص الأسبوع: [Day] [Date] [Month] [Year]' in Arabic)",
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
  "contributors": [
    {
      "name": "String (The user's display name)",
      "contribution": "String (A brief, professional description of their contribution in Arabic, mentioning the discussion ID e.g., 'ساهم في تطوير... (#123)')",
      "discussion_ids": ["Array of Strings (The numeric IDs of the discussions they participated in)"]
    }
  ]
}

Mapping Instructions for Logic:
- Featured Topic Excerpt: In the excerpt, if specific users are mentioned, incorporate them naturally into the Arabic text (e.g., "أشار [Name] إلى...").
- Themes: If multiple posts discuss the same topic, consolidate them into one theme object.
- Contributors: A contributor is someone who provided technical insight, a new tool, or a significant perspective.
- Discussion ID: Always extract the numeric ID from the end of the URL (e.g., from community.itqan.dev/d/466, the ID is 466).

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
  // Providers (gemini, openai) now parse JSON internally and return objects.
  // If we get an object back, pass it through; otherwise treat as string.
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
  const extractInsights = await loadProvider();
  const prompt = SYSTEM_PROMPT + formatPostsForPrompt(posts);
  const rawText = await extractInsights(prompt);
  return parseResponse(rawText);
}
