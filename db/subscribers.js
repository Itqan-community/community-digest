import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
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

/**
 * Idempotent upsert. Creates a row with a fresh UUID token if the email is not yet tracked.
 * Returns {email, token, subscribed}.
 */
export async function ensureSubscriberExists(email, userId = null) {
  const pool = getPool();
  const token = randomUUID();

  await pool.query(
    `INSERT IGNORE INTO digest_subscribers (user_id, email, token)
     VALUES (?, ?, ?)`,
    [userId, email, token]
  );

  const [rows] = await pool.query(
    'SELECT email, token, subscribed FROM digest_subscribers WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

/**
 * Returns [{email, token}] for all subscribed recipients.
 *
 * In SEND_MODE=test: short-circuits to only the TEST_RECIPIENT_EMAIL — no full-list query.
 * In SEND_MODE=prod:
 *   1. Bootstrap: insert any users not yet in digest_subscribers (default subscribed=1).
 *   2. Return only subscribed rows.
 */
export async function fetchSubscribedRecipients() {
  if (process.env.SEND_MODE !== 'prod') {
    const email = process.env.TEST_RECIPIENT_EMAIL;
    if (!email) throw new Error('TEST_RECIPIENT_EMAIL not set');
    const row = await ensureSubscriberExists(email);
    return [{ email: row.email, token: row.token }];
  }

  const pool = getPool();

  // Bootstrap: insert Flarum users not yet tracked
  await pool.query(`
    INSERT IGNORE INTO digest_subscribers (user_id, email, token)
    SELECT u.id, u.email, UUID()
    FROM users u
    LEFT JOIN digest_subscribers s ON s.email = u.email
    WHERE u.email IS NOT NULL
      AND u.email != ''
      AND s.email IS NULL
  `);

  const [rows] = await pool.query(
    'SELECT email, token FROM digest_subscribers WHERE subscribed = 1'
  );
  return rows.map(r => ({ email: r.email, token: r.token }));
}

/**
 * Look up a subscriber by their unsubscribe token.
 * Returns {email, token, subscribed} or null if not found.
 */
export async function getSubscriberByToken(token) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT email, token, subscribed FROM digest_subscribers WHERE token = ?',
    [token]
  );
  return rows[0] || null;
}

/**
 * Set the subscribed flag for a given token.
 * Returns the number of affected rows (0 = token not found).
 */
export async function setSubscribed(token, subscribed) {
  const pool = getPool();
  const [result] = await pool.query(
    'UPDATE digest_subscribers SET subscribed = ? WHERE token = ?',
    [subscribed, token]
  );
  return result.affectedRows;
}

/**
 * Set the subscribed flag by email address.
 * Used by bounce/complaint webhooks where the token is not available.
 * Returns the number of affected rows (0 = email not found).
 */
export async function setSubscribedByEmail(email, subscribed) {
  const pool = getPool();
  const [result] = await pool.query(
    'UPDATE digest_subscribers SET subscribed = ? WHERE email = ?',
    [subscribed, email]
  );
  return result.affectedRows;
}
