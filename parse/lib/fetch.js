import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { setTimeout as sleep } from 'node:timers/promises';

puppeteerExtra.use(StealthPlugin());

let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteerExtra.launch({ headless: true, args: ['--no-sandbox'] });
  }
  return browser;
}

async function waitForCloudflare(p, timeoutMs) {
  const deadline = Date.now() + Math.min(timeoutMs, 30000);
  while (Date.now() < deadline) {
    try {
      const title = await p.title();
      if (!/just a moment/i.test(title)) return true;
    } catch {
      return false;
    }
    await sleep(1000);
  }
  return false;
}

export async function fetchHtml(url, { retries = 4, delayMs = 2000, timeoutMs = 60000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let p;
    try {
      const b = await getBrowser();
      p = await b.newPage();
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      const resolved = await waitForCloudflare(p, timeoutMs);
      if (!resolved) {
        throw new Error(`Cloudflare challenge not resolved for ${url}`);
      }
      const text = await p.content();
      return { text, status: 200, url };
    } catch (err) {
      lastError = err;
      console.warn(`  [fetch] attempt ${attempt + 1}/${retries + 1} failed: ${err.message}`);
      if (attempt === retries) break;
      const backoff = delayMs * Math.pow(2, attempt);
      console.warn(`    retrying in ${backoff}ms`);
      await sleep(backoff);
    } finally {
      if (p) await p.close().catch(() => {});
    }
  }
  throw lastError;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

export async function delay(ms) {
  await sleep(ms);
}
