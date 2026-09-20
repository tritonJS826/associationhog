import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { setTimeout as sleep } from 'node:timers/promises';

puppeteerExtra.use(StealthPlugin());

let browser = null;

const MAX_BROWSER_PAGES = 80;

async function getBrowser() {
  if (browser && browser.connected) {
    try {
      return browser;
    } catch {
      await destroyBrowser();
    }
  }

  await destroyBrowser();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      browser = await puppeteerExtra.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
      return browser;
    } catch (err) {
      console.warn(`  [browser] launch attempt ${attempt + 1}/3 failed: ${err.message}`);
      await sleep(2000);
    }
  }
  throw new Error('Failed to launch browser after 3 attempts');
}

async function destroyBrowser() {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
}

async function maybeRestartBrowser() {
  try {
    const pages = await browser.pages();
    if (pages.length > MAX_BROWSER_PAGES) {
      console.warn(`  [browser] restarting (${pages.length} pages > ${MAX_BROWSER_PAGES})`);
      await destroyBrowser();
    }
  } catch {
    await destroyBrowser();
  }
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
      await maybeRestartBrowser();
      const b = await getBrowser();
      p = await b.newPage();
      const response = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      const httpStatus = response ? response.status() : 0;
      const resolved = await waitForCloudflare(p, timeoutMs);
      if (!resolved) {
        throw new Error(`Cloudflare challenge not resolved for ${url}`);
      }
      const text = await p.content();
      return { text, status: httpStatus, url: p.url() };
    } catch (err) {
      lastError = err;
      console.warn(`  [fetch] attempt ${attempt + 1}/${retries + 1} failed: ${err.message}`);
      const isBrowserError = err.message && (
        /disconnected|closed|Target|Protocol error/i.test(err.message) ||
        err.name === 'ProtocolError' || err.name === 'TargetCloseError'
      );
      if (isBrowserError) {
        console.warn(`  [browser] detected crash, restarting browser`);
        await destroyBrowser();
      }
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
  await destroyBrowser();
}

export async function delay(ms) {
  await sleep(ms);
}
