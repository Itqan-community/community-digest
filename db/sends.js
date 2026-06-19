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

export async function recordSend(email, resendId, runDate) {
  const pool = getPool();
  const [result] = await pool.query(
    'INSERT INTO digest_sends (email, resend_id, run_date) VALUES (?, ?, ?)',
    [email, resendId, runDate]
  );
  return result.affectedRows;
}

export async function recordDelivered(resendId) {
  const pool = getPool();
  const [result] = await pool.query(
    'UPDATE digest_sends SET delivered_at = NOW() WHERE resend_id = ? AND delivered_at IS NULL',
    [resendId]
  );
  return result.affectedRows;
}

export async function recordOpened(resendId) {
  const pool = getPool();
  const [result] = await pool.query(
    'UPDATE digest_sends SET opened_at = COALESCE(opened_at, NOW()), open_count = open_count + 1 WHERE resend_id = ?',
    [resendId]
  );
  return result.affectedRows;
}
