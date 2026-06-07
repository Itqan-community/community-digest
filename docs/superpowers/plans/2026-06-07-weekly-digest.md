# Weekly Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated weekly email digest that fetches Flarum posts from PostgreSQL, extracts insights via LLM (Gemini/OpenAI), renders an HTML email, and sends it to community members via Resend.

**Architecture:** Single entry point (`digest.js`) orchestrates a linear pipeline: DB → LLM → Template → Email. Each stage is a separate module with one responsibility. Failure at any stage triggers retries, then falls back to saving artifacts to disk.

**Tech Stack:** Node.js 18+, `pg` (PostgreSQL), `@google/genai` (Gemini), `openai` (OpenAI), `resend` (Email), `dotenv` (Config), `vitest` (Testing)

---

## File Structure

```
community-digest/
├── digest.js                 # Entry point, orchestrates pipeline
├── .env.example              # Config template
├── db/
│   └── posts.js              # PostgreSQL queries
├── llm/
│   ├── extract.js            # Provider abstraction
│   ├── gemini.js             # Gemini implementation
│   └── openai.js             # OpenAI implementation
├── email/
│   ├── renderer.js           # Template injection
│   └── sender.js             # Resend delivery
├── utils/
│   └── fallback.js           # Retry + artifact saving
├── template-itqan-digest.html
├── outputs/                  # Fallback artifact storage (gitignored)
├── logs/                     # Error logs (gitignored)
└── tests/
    ├── db/
    │   └── posts.test.js
    ├── llm/
    │   └── extract.test.js
    ├── email/
    │   ├── renderer.test.js
    │   └── sender.test.js
    └── utils/
        └── fallback.test.js
```

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`

- [ ] **Step 1: Initialize project and install dependencies**

Run:
```bash
cd /home/muhammad/Work/itqan/community-digest
npm init -y
npm install pg @google/genai openai resend dotenv
npm install --save-dev vitest @vitest/coverage-v8
```

- [ ] **Step 2: Update package.json with scripts**

Edit `package.json` to add:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "digest": "node digest.js",
  "digest:dry-run": "DRY_RUN=true node digest.js"
}
```

- [ ] **Step 3: Create .gitignore**

Create `.gitignore`:
```
node_modules/
.env
outputs/
logs/
```

- [ ] **Step 4: Create .env.example**

Create `.env.example`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flarum
DB_USER=postgres
DB_PASS=change_me

LLM_PROVIDER=gemini
LLM_API_KEY=your_api_key_here
LLM_MODEL=gemini-2.0-flash

RESEND_API_KEY=re_your_key_here

DIGEST_POSTS_COUNT=30
DIGEST_WINDOW_DAYS=7
FORUM_BASE_URL=https://community.itqan.dev
RECIPIENTS_CSV=
```

- [ ] **Step 5: Create directory structure**

Run:
```bash
mkdir -p db llm email utils tests/{db,llm,email,utils} outputs logs
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example
git commit -m "feat: initialize project with dependencies and config"
```

---

### Task 2: Database Layer — Fetch Posts

**Files:**
- Create: `db/posts.js`
- Test: `tests/db/posts.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/db/posts.test.js`:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRecentPosts } from '../../db/posts';

// Mock pg
vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: vi.fn(),
    end: vi.fn()
  }))
}));
import { Pool } from 'pg';

describe('fetchRecentPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns posts with required fields', async () => {
    const mockRows = [
      {
        discussion_id: '123',
        title: 'Test Discussion',
        post_body: 'Test body content',
        author_name: 'Test User',
        url: 'https://community.itqan.dev/d/123',
        view_count: 100,
        reply_count: 10,
        like_count: 5
      }
    ];

    const PoolMock = Pool;
    PoolMock.prototype.query = vi.fn().mockResolvedValue({ rows: mockRows });
    PoolMock.prototype.end = vi.fn().mockResolvedValue(undefined);

    vi.stubEnv('DB_HOST', 'localhost');
    vi.stubEnv('DB_PORT', '5432');
    vi.stubEnv('DB_NAME', 'test');
    vi.stubEnv('DB_USER', 'test');
    vi.stubEnv('DB_PASS', 'test');
    vi.stubEnv('DIGEST_WINDOW_DAYS', '7');
    vi.stubEnv('DIGEST_POSTS_COUNT', '30');
    vi.stubEnv('FORUM_BASE_URL', 'https://community.itqan.dev');

    const result = await fetchRecentPosts();

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('discussion_id');
    expect(result[0]).toHaveProperty('title');
    expect(result[0]).toHaveProperty('author_name');
    expect(result[0]).toHaveProperty('url');
  });

  it('returns empty array when no posts exist', async () => {
    const PoolMock = Pool;
    PoolMock.prototype.query = vi.fn().mockResolvedValue({ rows: [] });
    PoolMock.prototype.end = vi.fn().mockResolvedValue(undefined);

    vi.stubEnv('DB_HOST', 'localhost');
    vi.stubEnv('DB_PORT', '5432');
    vi.stubEnv('DB_NAME', 'test');
    vi.stubEnv('DB_USER', 'test');
    vi.stubEnv('DB_PASS', 'test');
    vi.stubEnv('DIGEST_WINDOW_DAYS', '7');
    vi.stubEnv('DIGEST_POSTS_COUNT', '30');
    vi.stubEnv('FORUM_BASE_URL', 'https://community.itqan.dev');

    const result = await fetchRecentPosts();
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/posts.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement db/posts.js**

Create `db/posts.js`:
```javascript
import { Pool } from 'pg';
import 'dotenv/config';

export async function fetchRecentPosts() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS
  });

  const days = parseInt(process.env.DIGEST_WINDOW_DAYS || '7');
  const limit = parseInt(process.env.DIGEST_POSTS_COUNT || '30');
  const baseUrl = process.env.FORUM_BASE_URL || 'https://community.itqan.dev';

  const query = `
    SELECT DISTINCT ON (d.discussion_id)
      d.discussion_id,
      d.title,
      p.text as post_body,
      u.username as author_name,
      d.slug,
      d.state,
      d.hidden_at,
      d.stuck,
      d.pinned,
      d.created_at,
      d.last_post_at,
      d.comment_count as reply_count,
      d.participant_count,
      d.view_count,
      COALESCE(
        (SELECT COUNT(*) FROM flarum_likes WHERE discussion_id = d.discussion_id),
        0
      ) as like_count
    FROM flarum_discussions d
    JOIN flarum_posts p ON p.discussion_id = d.discussion_id AND p.number = 1
    JOIN flarum_users u ON u.id = p.user_id
    WHERE d.created_at >= NOW() - INTERVAL '${days} days'
      AND d.state = 'public'
      AND d.hidden_at IS NULL
    ORDER BY d.discussion_id, d.created_at DESC
    LIMIT ${limit}
  `;

  try {
    const { rows } = await pool.query(query);

    return rows.map(row => ({
      discussion_id: String(row.discussion_id),
      title: row.title,
      body: row.post_body,
      author_name: row.author_name,
      url: `${baseUrl}/d/${row.discussion_id}`,
      created_at: row.created_at,
      view_count: row.view_count || 0,
      reply_count: row.reply_count || 0,
      like_count: row.like_count || 0,
      interactions: (row.view_count || 0) + (row.reply_count || 0) + (row.like_count || 0)
    }));
  } finally {
    await pool.end();
  }
}

export async function fetchRecipientEmails() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS
  });

  const query = `
    SELECT email FROM flarum_users
    WHERE email IS NOT NULL
      AND email != ''
      AND active = true
  `;

  try {
    const { rows } = await pool.query(query);
    return rows.map(row => row.email);
  } finally {
    await pool.end();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/posts.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add db/posts.js tests/db/posts.test.js
git commit -m "feat: add database layer for fetching posts and recipients"
```

---

### Task 3: LLM Layer — Provider Abstraction

**Files:**
- Create: `llm/extract.js`, `llm/gemini.js`, `llm/openai.js`
- Test: `tests/llm/extract.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/llm/extract.test.js`:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('LLM extract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extractDigest should return valid JSON structure', async () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_MODEL', 'gemini-2.0-flash');

    // Mock Gemini client
    vi.doMock('llm/gemini', () => ({
      extractInsights: vi.fn().mockResolvedValue({
        window_label: 'ملخص الأسبوع: 1 يونيو 2026',
        featured_topic: {
          title: 'موضوع تجريبي',
          excerpt: 'نص تجريبي',
          author_names: ['مستخدم'],
          url: 'https://community.itqan.dev/d/123'
        },
        themes: [],
        open_questions: [],
        contributors: []
      })
    }));

    const { extractDigest } = await import('../../llm/extract');

    const mockPosts = [
      {
        discussion_id: '123',
        title: 'Test Discussion',
        body: 'Test body',
        author_name: 'Test User',
        url: 'https://community.itqan.dev/d/123',
        interactions: 100
      }
    ];

    const result = await extractDigest(mockPosts);

    expect(result).toHaveProperty('window_label');
    expect(result).toHaveProperty('featured_topic');
    expect(result.featured_topic).toHaveProperty('title');
    expect(result.featured_topic).toHaveProperty('excerpt');
    expect(result.featured_topic).toHaveProperty('author_names');
    expect(result.featured_topic).toHaveProperty('url');
    expect(result).toHaveProperty('themes');
    expect(result).toHaveProperty('open_questions');
    expect(result).toHaveProperty('contributors');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/llm/extract.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create the LLM prompt constant**

Add the prompt to `llm/extract.js` first. Create `llm/extract.js`:
```javascript
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

export async function extractDigest(posts) {
  const extractInsights = await loadProvider();
  const prompt = SYSTEM_PROMPT + formatPostsForPrompt(posts);
  return await extractInsights(prompt);
}
```

- [ ] **Step 4: Create Gemini implementation**

Create `llm/gemini.js`:
```javascript
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

export async function extractInsights(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.LLM_API_KEY });
  const model = process.env.LLM_MODEL || 'gemini-2.0-flash';

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 8192
    }
  });

  const text = response.text;
  // Clean potential markdown code blocks
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse LLM response as JSON:', cleaned.substring(0, 200));
    throw new Error('LLM returned invalid JSON');
  }
}
```

- [ ] **Step 5: Create OpenAI implementation**

Create `llm/openai.js`:
```javascript
import OpenAI from 'openai';
import 'dotenv/config';

export async function extractInsights(prompt) {
  const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined
  });

  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are a data extraction engine. Return only valid JSON.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 8192
  });

  const text = response.choices[0].message.content;

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse LLM response as JSON:', text.substring(0, 200));
    throw new Error('LLM returned invalid JSON');
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/llm/extract.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add llm/ tests/llm/
git commit -m "feat: add LLM abstraction with Gemini and OpenAI providers"
```

---

### Task 4: Email Renderer — Template Injection

**Files:**
- Create: `email/renderer.js`
- Test: `tests/email/renderer.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/email/renderer.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { renderEmail } from '../../email/renderer';

describe('renderEmail', () => {
  it('injects digest data into HTML template', async () => {
    const mockDigest = {
      window_label: 'ملخص الأسبوع: 1 يونيو 2026',
      featured_topic: {
        title: 'موضوع تجريبي',
        excerpt: 'نص تجريبي',
        author_names: ['مستخدم 1', 'مستخدم 2'],
        url: 'https://community.itqan.dev/d/123'
      },
      themes: [
        {
          title: 'محور 1',
          description: 'وصف محور',
          url: 'https://community.itqan.dev/d/124',
          discussion_id: '124'
        }
      ],
      open_questions: [
        {
          question: 'سؤال مفتوح؟',
          url: 'https://community.itqan.dev/d/125',
          discussion_id: '125'
        }
      ],
      contributors: [
        {
          name: 'مساهم',
          contribution: 'ساهم في تطوير... (#123)',
          discussion_ids: ['123']
        }
      ]
    };

    const html = await renderEmail(mockDigest);

    expect(html).toContain('ملخص الأسبوع: 1 يونيو 2026');
    expect(html).toContain('موضوع تجريبي');
    expect(html).toContain('نص تجريبي');
    expect(html).toContain('محور 1');
    expect(html).toContain('سؤال مفتوح؟');
    expect(html).toContain('مساهم');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/email/renderer.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement email/renderer.js**

Create `email/renderer.js`:
```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, '..', 'template-itqan-digest.html');

export async function renderEmail(digest) {
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Window label
  template = template.replace(
    /ملخص الأسبوع:.*?(?=<\/p>)/,
    digest.window_label || 'ملخص الأسبوع'
  );

  // Featured Topic
  template = template.replace(
    /كيف نتعامل مع الأخطاء التحريفية المنسية في GitHub\؟/,
    digest.featured_topic?.title || 'لا يوجد موضوع مميز'
  );

  template = template.replace(
    /أثارت .*?\..*?المشارiquة\./,
    digest.featured_topic?.excerpt || ''
  );

  // More robust: replace the entire excerpt block
  const excerptMatch = /(<p class="text-gray-700 text-md leading-relaxed">)([\s\S]*?)(<\/p>)/;
  if (excerptMatch.test(template)) {
    const authorText = (digest.featured_topic?.author_names || [])
      .map(name => `<strong>${name}</strong>`)
      .join(' و ');
    const newExcerpt = digest.featured_topic?.excerpt
      ? digest.featured_topic.excerpt
      : `شارك ${authorText} في نقاش مهم هذا الأسبوع.`;
    template = template.replace(excerptMatch, `$1${newExcerpt}$3`);
  }

  // Featured topic URL
  template = template.replace(
    /href="https:\/\/community\.itqan\.dev\/d\/466"/g,
    `href="${digest.featured_topic?.url || '#"}"`
  );

  // Themes — replace first theme
  const theme1 = digest.themes?.[0];
  if (theme1) {
    template = template.replace(
      'أداة "مزمن" لمزامنة الآيات بأسهم لوحة المفاتيح',
      theme1.title
    );
    template = template.replace(
      'أداة جديدة من تطوير ناصر طاهري',
      theme1.description
    );
    template = template.replace(
      'href="https://community.itqan.dev/d/467"',
      `href="${theme1.url}"`
    );
  }

  // Themes — replace second theme
  const theme2 = digest.themes?.[1];
  if (theme2) {
    template = template.replace(
      'تحسين تجربة المستخدم للتنبيهات في تطبيق زاد المؤمن',
      theme2.title
    );
    template = template.replace(
      'نقاش حول ذكاء التنبيهات',
      theme2.description
    );
    template = template.replace(
      'href="https://community.itqan.dev/d/463"',
      `href="${theme2.url}"`
    );
  }

  // Open Questions
  const questions = digest.open_questions || [];
  if (questions.length > 0) {
    const questionItems = questions.map(q =>
      `<li class="text-md font-medium leading-relaxed border-b border-itqan-primary/20 pb-4">\n                        • ${q.question}\n                    </li>`
    ).join('\n');
    // Replace the questions list content
    const questionsBlock = /(<ul class="space-y-6">)([\s\S]*?)(<\/ul>)/;
    template = template.replace(questionsBlock, `$1\n${questionItems}\n                $3`);
  }

  // Contributors
  const contributors = digest.contributors || [];
  if (contributors.length > 0) {
    const initials = (name) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const contributorCards = contributors.map(c => `
                    <div class="flex items-center gap-4 p-5 rounded-3xl bg-itqan-light/30 border border-transparent hover:border-itqan-primary/20 hover:bg-itqan-light/50 transition-all">
                        <div class="w-12 h-12 rounded-2xl bg-itqan-primary flex items-center justify-center text-white font-bold text-lg">${initials(c.name)}</div>
                        <div>
                            <h4 class="text-sm font-bold text-itqan-dark">${c.name}</h4>
                            <p class="text-[11px] text-itqan-dark/60 mt-0.5">${c.contribution}</p>
                        </div>
                    </div>`).join('\n');
    // Replace the contributors grid content
    const contributorsBlock = /(<div class="grid grid-cols-1 gap-4">)([\s\S]*?)(<\/div>)/;
    template = template.replace(contributorsBlock, `$1${contributorCards}                $3`);
  }

  return template;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/email/renderer.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add email/renderer.js tests/email/renderer.test.js
git commit -m "feat: add email template renderer with data injection"
```

---

### Task 5: Email Sender — Resend Delivery

**Files:**
- Create: `email/sender.js`
- Test: `tests/email/sender.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/email/sender.test.js`:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendDigestEmail } from '../../email/sender';

vi.mock('resend', () => ({
  default: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn()
    }
  }))
}));
import Resend from 'resend';

describe('sendDigestEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 're_test');
  });

  it('sends email to all recipients', async () => {
    const ResendMock = Resend;
    ResendMock.prototype.emails.send = vi.fn().mockResolvedValue({ id: 'test-id' });

    const recipients = ['user1@test.com', 'user2@test.com'];
    const html = '<html>Test</html>';
    const subject = 'Test Subject';

    const result = await sendDigestEmail(recipients, html, subject);

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('handles send failures gracefully', async () => {
    const ResendMock = Resend;
    ResendMock.prototype.emails.send = vi.fn()
      .mockResolvedValueOnce({ id: 'test-id' })
      .mockRejectedValueOnce(new Error('Failed'));

    const recipients = ['user1@test.com', 'user2@test.com'];
    const html = '<html>Test</html>';
    const subject = 'Test Subject';

    const result = await sendDigestEmail(recipients, html, subject);

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/email/sender.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement email/sender.js**

Create `email/sender.js`:
```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/email/sender.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add email/sender.js tests/email/sender.test.js
git commit -m "feat: add email sender with Resend and recipient management"
```

---

### Task 6: Failure Handler — Retry & Fallback

**Files:**
- Create: `utils/fallback.js`
- Test: `tests/utils/fallback.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/fallback.test.js`:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, saveFallback } from '../../utils/fallback';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, 3);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    const result = await withRetry(fn, 3);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after all retries fail', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(withRetry(fn, 2)).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('saveFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('saves artifacts to outputs directory', async () => {
    const artifacts = {
      step: 'llm',
      timestamp: '2026-06-07T12:00:00Z',
      error: 'Test error',
      data: { test: true }
    };

    await saveFallback(artifacts);

    // Verify file was created
    const fs = await import('fs');
    const outputs = fs.default.readdirSync('outputs');
    expect(outputs.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/fallback.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement utils/fallback.js**

Create `utils/fallback.js`:
```javascript
import fs from 'fs';
import path from 'path';

const OUTPUTS_DIR = path.join(process.cwd(), 'outputs');
const LOGS_DIR = path.join(process.cwd(), 'logs');

export async function withRetry(fn, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt}/${retries} failed:`, error.message);

      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export async function saveFallback(artifacts) {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `fallback-${timestamp}.json`;
  const filepath = path.join(OUTPUTS_DIR, filename);

  const data = {
    step: artifacts.step,
    timestamp: artifacts.timestamp || new Date().toISOString(),
    error: artifacts.error,
    data: artifacts.data
  };

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`Fallback saved to: ${filepath}`);

  return filepath;
}

export function logError(message, error = null) {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const logFile = path.join(LOGS_DIR, 'digest.log');
  const entry = `[${new Date().toISOString()}] ERROR: ${message}`;
  const detail = error ? ` — ${error.message}` : '';

  fs.appendFileSync(logFile, `${entry}${detail}\n`);
  console.error(entry, detail);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/fallback.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/fallback.js tests/utils/fallback.test.js
git commit -m "feat: add retry logic and fallback artifact saving"
```

---

### Task 7: Main Orchestrator — digest.js

**Files:**
- Create: `digest.js`

- [ ] **Step 1: Create the main entry point**

Create `digest.js`:
```javascript
import 'dotenv/config';
import { fetchRecentPosts } from './db/posts.js';
import { extractDigest } from './llm/extract.js';
import { renderEmail } from './email/renderer.js';
import { sendDigestEmail, getRecipients } from './email/sender.js';
import { withRetry, saveFallback, logError } from './utils/fallback.js';

const DRY_RUN = process.env.DRY_RUN === 'true';

async function main() {
  console.log('=== Itqan Community Weekly Digest ===\n');

  // Step 1: Fetch posts from database
  console.log('Step 1: Fetching recent posts...');
  let posts;
  try {
    posts = await withRetry(() => fetchRecentPosts(), 3);
    console.log(`  Found ${posts.length} posts\n`);

    if (posts.length === 0) {
      console.log('No posts found in the time window. Skipping digest.');
      return;
    }
  } catch (error) {
    logError('Failed to fetch posts', error);
    await saveFallback({ step: 'fetch_posts', error: error.message });
    process.exit(1);
  }

  // Step 2: Extract insights via LLM
  console.log('Step 2: Extracting insights via LLM...');
  let digest;
  try {
    digest = await withRetry(() => extractDigest(posts), 3);
    console.log(`  Featured: ${digest.featured_topic?.title || 'N/A'}
  Themes: ${digest.themes?.length || 0}
  Questions: ${digest.open_questions?.length || 0}
  Contributors: ${digest.contributors?.length || 0}\n`);
  } catch (error) {
    logError('Failed to extract insights', error);
    await saveFallback({ step: 'llm_extract', error: error.message, data: posts });
    process.exit(1);
  }

  // Step 3: Render email
  console.log('Step 3: Rendering email...');
  let html;
  try {
    html = await withRetry(() => renderEmail(digest), 3);
    console.log('  Email rendered successfully\n');
  } catch (error) {
    logError('Failed to render email', error);
    await saveFallback({ step: 'render_email', error: error.message, data: digest });
    process.exit(1);
  }

  // Dry run mode
  if (DRY_RUN) {
    console.log('DRY RUN: Saving HTML to outputs/digest-preview.html');
    const fs = await import('fs');
    const path = await import('path');
    const previewPath = path.default.join(process.cwd(), 'outputs', 'digest-preview.html');
    fs.default.mkdirSync(path.default.dirname(previewPath), { recursive: true });
    fs.default.writeFileSync(previewPath, html);
    console.log(`  Preview saved to: ${previewPath}`);
    return;
  }

  // Step 4: Get recipients
  console.log('Step 4: Fetching recipients...');
  let recipients;
  try {
    recipients = await withRetry(() => getRecipients(), 3);
    console.log(`  Found ${recipients.length} recipients\n`);

    if (recipients.length === 0) {
      console.log('No recipients found. Skipping email send.');
      return;
    }
  } catch (error) {
    logError('Failed to fetch recipients', error);
    await saveFallback({ step: 'fetch_recipients', error: error.message });
    process.exit(1);
  }

  // Step 5: Send emails
  console.log('Step 5: Sending emails...');
  try {
    const result = await sendDigestEmail(
      recipients,
      html,
      digest.window_label || 'ملخص مجتمع إتقان'
    );
    console.log(`  Sent: ${result.sent} | Failed: ${result.failed}\n`);
  } catch (error) {
    logError('Failed to send emails', error);
    await saveFallback({ step: 'send_email', error: error.message, data: { html, recipients } });
    process.exit(1);
  }

  console.log('=== Digest complete ===');
}

main().catch(error => {
  logError('Unhandled error in main', error);
  process.exit(1);
});
```

- [ ] **Step 2: Test the dry-run mode**

Run (with a test .env configured):
```bash
cp .env.example .env
# Edit .env with your credentials
DRY_RUN=true node digest.js
```

Expected: Generates `outputs/digest-preview.html` without sending emails

- [ ] **Step 3: Commit**

```bash
git add digest.js
git commit -m "feat: add main orchestrator with dry-run support"
```

---

### Task 8: Run Full Test Suite & Final Commit

**Files:** All

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Verify file structure**

Run:
```bash
find . -type f -not -path './node_modules/*' -not -path './.git/*' | sort
```

Expected output should match the design spec structure.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete weekly digest system

- Database layer for Flarum PostgreSQL
- LLM abstraction (Gemini + OpenAI)
- Email template renderer
- Resend email delivery
- Retry + fallback handling
- Dry-run mode for testing
- Full test coverage"
```

---

## Setup After Deployment

1. Copy `.env.example` to `.env` and fill in all credentials
2. Test with dry-run: `DRY_RUN=true node digest.js`
3. Set up system cron (e.g., every Friday at 9 AM):
   ```bash
   crontab -e
   # Add: 0 9 * * 5 cd /path/to/community-digest && node digest.js >> logs/cron.log 2>&1
   ```
4. Monitor `logs/digest.log` for errors
5. Check `outputs/` for any fallback artifacts
