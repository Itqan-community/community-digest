import { Pool } from 'pg';
import 'dotenv/config';

let poolInstance = null;

function getPool() {
  if (!poolInstance) {
    poolInstance = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS
    });
  }
  return poolInstance;
}

export async function closePool() {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

export async function fetchRecentPosts() {
  const pool = getPool();

  const days = parseInt(process.env.DIGEST_WINDOW_DAYS || '7');
  const limit = parseInt(process.env.DIGEST_POSTS_COUNT || '30');
  const baseUrl = process.env.FORUM_BASE_URL || 'https://community.itqan.dev';

  const query = `
    SELECT DISTINCT ON (d.discussion_id)
      d.discussion_id,
      d.title,
      p.text as post_body,
      u.username as author_name,
      d.created_at,
      d.view_count,
      d.comment_count as reply_count,
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
}

export async function fetchRecipientEmails() {
  const pool = getPool();

  const query = `
    SELECT email FROM flarum_users
    WHERE email IS NOT NULL
      AND email != ''
      AND active = true
  `;

  const { rows } = await pool.query(query);
  return rows.map(row => row.email);
}
