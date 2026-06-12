import mysql from 'mysql2/promise';
import 'dotenv/config';

let poolInstance = null;

function getPool() {
  if (!poolInstance) {
    poolInstance = mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      timezone: '+00:00'
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
    SELECT
      d.id,
      d.title,
      p.content as post_body,
      COALESCE(u.nickname, u.username) as author_name,
      d.created_at,
      d.view_count,
      d.comment_count as reply_count,
      COALESCE(
        (SELECT COUNT(*) FROM post_likes WHERE discussion_id = d.id),
        0
      ) as like_count
    FROM discussions d
    JOIN posts p ON p.id = d.first_post_id
    JOIN users u ON u.id = p.user_id
    WHERE d.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      AND d.hidden_at IS NULL
    ORDER BY d.created_at DESC
    LIMIT ?
  `;

  const [rows] = await pool.query(query, [days, limit]);

  return rows.map(row => ({
    discussion_id: String(row.id),
    title: row.title,
    body: row.post_body,
    author_name: row.author_name,
    url: `${baseUrl}/d/${row.id}`,
    created_at: row.created_at,
    view_count: row.view_count || 0,
    reply_count: row.comment_count || 0,
    like_count: row.like_count || 0,
    interactions: (row.view_count || 0) + (row.comment_count || 0) + (row.like_count || 0)
  }));
}

export async function fetchRecipientEmails() {
  const pool = getPool();

  const query = `
    SELECT email FROM users
    WHERE email IS NOT NULL
      AND email != ''
  `;
  // const query = `
  //   SELECT email FROM users
  //   WHERE email = 'm.tareq@itqan.dev'
  // `;


  const [rows] = await pool.query(query);
  return rows.map(row => row.email);
}
