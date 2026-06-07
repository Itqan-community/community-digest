import fs from 'fs/promises';
import path from 'path';

const OUTPUTS_DIR = path.join(process.cwd(), 'outputs');
const LOGS_DIR = path.join(process.cwd(), 'logs');

const BACKOFF_BASE_MS = 1000;
const BACKOFF_EXPONENT = 2;

export async function withRetry(fn, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt}/${retries} failed:`, error.message);

      if (attempt < retries) {
        const delay = Math.pow(BACKOFF_EXPONENT, attempt) * BACKOFF_BASE_MS; // 2s, 4s, 8s
        console.log(`Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export async function saveFallback(artifacts) {
  await fs.mkdir(OUTPUTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `fallback-${timestamp}.json`;
  const filepath = path.join(OUTPUTS_DIR, filename);

  const data = {
    step: artifacts.step,
    timestamp: artifacts.timestamp || new Date().toISOString(),
    error: artifacts.error,
    data: artifacts.data
  };

  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  console.log(`Fallback saved to: ${filepath}`);

  return filepath;
}

export function logError(message, error = null) {
  const errorMessage = error?.message ?? String(error);
  const entry = `[${new Date().toISOString()}] ERROR: ${message} — ${errorMessage}`;

  fs.mkdir(LOGS_DIR, { recursive: true }).catch(() => {});
  fs.appendFile(path.join(LOGS_DIR, 'digest.log'), `${entry}\n`).catch(() => {});
  console.error(entry);
}
