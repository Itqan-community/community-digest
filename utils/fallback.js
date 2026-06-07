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
