# Weekly Digest System — Design Specification

**Project:** Itqan Community Digest
**Date:** 2026-06-07
**Author:** Muhammad

## Overview

An automated weekly email digest system for the Itqan Community. The system fetches recent forum discussions from PostgreSQL (Flarum), processes them through an LLM to extract key insights in Arabic, renders the results into an HTML email template, and delivers the digest to all community members.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  System Cron (e.g., every Friday 9:00 AM)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  digest.js (Entry Point)                                     │
│                                                              │
│  1. FetchPosts    →  PostgreSQL (Flarum DB)                  │
│  2. ExtractInsights → LLM (Gemini / OpenAI)                 │
│  3. RenderEmail   →  HTML Template injection                │
│  4. FetchRecipients → PostgreSQL + CSV fallback             │
│  5. SendEmails    →  Resend API                              │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Database Layer (`db/posts.js`)

- Connects to Flarum's PostgreSQL database using raw SQL
- Fetches the **30 most recent posts** from the last **7 days**
- Returns per-post: title, body excerpt, author name, discussion URL, discussion ID, view count, reply count, like count
- Orders results by interaction count (replies + likes) descending to surface popular discussions first
- Connection parameters configured via environment variables

### 2. LLM Layer (`llm/extract.js`)

- Abstracted interface supporting **Google Gemini** and **OpenAI** providers
- Provider selected via `LLM_PROVIDER` environment variable (`gemini` | `openai`)
- Accepts raw post data from the database layer
- Injects data into the specialized Arabic extraction prompt
- Returns a structured JSON object matching the defined schema:
  - `window_label`: Arabic week label
  - `featured_topic`: title, excerpt, author names, URL
  - `themes`: array of title, description, URL, discussion ID
  - `open_questions`: array of question, URL, discussion ID
  - `contributors`: array of name, contribution, discussion IDs
- All human-readable output is in **professional Arabic**
- Uses JSON mode/response format enforcement for parseable output

### 3. Email Renderer (`email/renderer.js`)

- Reads the HTML template from `template-itqan-digest.html`
- Injects LLM-extracted JSON data into template placeholders
- Produces a final HTML string ready for email delivery
- Handles missing/empty fields gracefully with fallback content

### 4. Email Sender (`email/sender.js`)

- Uses **Resend** SDK as the default email delivery provider
- Designed with an interface/abstract class to support swapping to MailerLite or other providers
- Fetches recipient emails from two sources:
  1. **Primary:** Flarum `users` table (all registered users)
  2. **Supplemental:** Optional CSV file path specified in `.env`
- Sends emails in batches (configurable batch size) to respect rate limits
- Marks sent digests to avoid duplicates on retry

### 5. Failure Handler (`utils/fallback.js`)

- Implements exponential backoff retry (3 attempts, 2s → 4s → 8s delays)
- On complete failure: saves all generated artifacts to `outputs/` directory:
  - Raw posts JSON
  - LLM response JSON
  - Rendered HTML
  - Timestamp and error details
- Logs all errors to `logs/digest.log` with timestamps
- Returns non-zero exit code on failure (for cron monitoring)

### 6. Configuration (`.env`)

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flarum
DB_USER=...
DB_PASS=...

LLM_PROVIDER=gemini        # or 'openai'
LLM_API_KEY=...
LLM_MODEL=...              # e.g., 'gemini-2.0-flash' or 'gpt-4o-mini'

RESEND_API_KEY=...

DIGEST_POSTS_COUNT=30
DIGEST_WINDOW_DAYS=7

RECIPIENTS_CSV=            # optional, path to CSV file
FORUM_BASE_URL=https://community.itqan.dev
```

## Data Flow

1. **Trigger:** System cron executes `node digest.js` at a scheduled time (e.g., Friday 9:00 AM)
2. **Fetch:** Query PostgreSQL for the 30 most recent posts within the 7-day window, ordered by interactions
3. **Extract:** Send raw post data to the configured LLM provider with the Arabic extraction prompt
4. **Render:** Inject the LLM's JSON response into the HTML email template
5. **Deliver:** Fetch recipient list, send the rendered HTML email via Resend in batches
6. **Fallback:** On any step failure, retry 3 times; if all retries fail, save artifacts to disk and log the error

## Error Handling

- **Database failure:** Retry connection, then fail with artifact save
- **LLM failure:** Retry with same prompt, then save raw posts for manual processing
- **Email failure:** Retry per-batch, save rendered HTML for manual send
- **Template missing:** Fail immediately with clear error (no fallback)
- **Empty results:** Skip email send if no posts exist in the time window; log a warning

## File Structure

```
community-digest/
├── digest.js                 # Entry point, orchestrates pipeline
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
├── .env.example
├── outputs/                  # Fallback artifact storage
└── logs/                     # Error logs
```

## Testing Strategy

- **Unit tests:** LLM prompt injection, template rendering, JSON schema validation
- **Integration tests:** Database query (with test DB), email sending (with Resend test mode)
- **Manual verification:** Run `node digest.js --dry-run` to generate digest without sending emails

## Future Considerations

- **Opt-in subscriptions:** Add a subscription flag to the users table
- **Digest preview:** HTTP endpoint to view the last generated digest
- **Metrics:** Track open rates, click-through rates via Resend webhooks
- **Multi-language:** Support non-Arabic digests for international members
