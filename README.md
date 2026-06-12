# Itqan Community Weekly Digest

Automated weekly email digest for the Itqan Community forum. Every week, it scans recent discussions, extracts the most impactful topics and questions, and sends a beautifully formatted email to subscribers.

## How It Works

1. **Fetch** — Pulls recent discussions from the MySQL database (Flarum forum).
2. **Analyze** — Sends the raw discussion data to an LLM (Gemini or OpenAI) to extract key insights: featured topic, discussion themes, open questions, and top contributors.
3. **Render** — Injects the extracted data into an HTML email template using Handlebars, then inlines all CSS for email client compatibility.
4. **Send** — Delivers the email via Resend in batches.

## Setup

1. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Run in dry-run mode (renders the email and saves it to `outputs/digest-preview.html` without sending):

```bash
DRY_RUN=true node digest.js
```

4. Run for real (sends emails to subscribers):

```bash
node digest.js
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | Yes | MySQL host |
| `DB_PORT` | Yes | MySQL port (default: 3306) |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASS` | Yes | Database password |
| `LLM_PROVIDER` | No | `gemini` (default) or `openai` |
| `RESEND_API_KEY` | No | Resend API key (required for sending) |
| `FORUM_BASE_URL` | No | Base URL of the community forum |
| `DIGEST_WINDOW_DAYS` | No | How many days back to fetch posts (default: 7) |
| `DIGEST_POSTS_COUNT` | No | Max number of posts to fetch (default: 30) |
| `RECIPIENTS_CSV` | No | Path to a CSV file with additional recipient emails |

## Project Structure

```
db/          — Database queries (posts, recipients)
email/       — Email rendering and sending logic
llm/         — LLM provider integrations (Gemini, OpenAI)
utils/       — Shared utilities (retry logic, fallbacks)
outputs/     — Generated email previews (dry-run)
logs/        — Error logs
template-itqan-digest.html — Email HTML template
digest.js    — Main entry point
```

## Running in Production

This is designed to run as a cron job (e.g., every Monday at 9 AM). The script exits cleanly after completing all steps, so no lingering processes.

```bash
# Add to crontab
0 9 * * 1 cd /path/to/community-digest && node digest.js >> /path/to/logs/cron.log 2>&1
```

## Testing

```bash
npm test
```

## Notes

- The email template uses inline CSS for maximum email client compatibility (Gmail, Outlook, Apple Mail, etc.).
- The LLM prompt enforces Arabic-only output for all human-readable content.
- All database connections are properly closed on exit to support cron execution.
