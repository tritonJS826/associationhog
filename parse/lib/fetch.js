import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const execFileAsync = promisify(execFile);

const HEADERS = [
  'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language: sr,en;q=0.8',
  'Cache-Control: no-cache',
];

function curlArgs(url, timeoutMs) {
  const args = ['-sL', '--compressed', '--connect-timeout', '15', '--max-time', String(timeoutMs)];
  for (const h of HEADERS) args.push('-H', h);
  args.push(url);
  return args;
}

export async function fetchHtml(url, { retries = 4, delayMs = 2000, timeoutMs = 60000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execFileAsync('curl', curlArgs(url, timeoutMs), {
        maxBuffer: 10 * 1024 * 1024,
      });
      const text = stdout;

      if (/<title>Just a moment\.\.\.<\/title>/.test(text)) {
        throw new Error(`Cloudflare challenge detected for ${url}`);
      }

      return { text, status: 200, url };
    } catch (err) {
      lastError = err;
      const stderr = err.stderr ? `\ncurl stderr: ${String(err.stderr).trim()}` : '';
      console.warn(`  [fetch] attempt ${attempt + 1}/${retries + 1} failed: ${err.message}${stderr}`);
      if (attempt === retries) {
        err.message = `${err.message}${stderr}`;
        break;
      }
      const backoff = delayMs * Math.pow(2, attempt);
      console.warn(`    retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastError;
}

export async function delay(ms) {
  await sleep(ms);
}