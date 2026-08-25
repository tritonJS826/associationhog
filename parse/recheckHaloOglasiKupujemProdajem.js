import { listOpenPosts, markClosed, DB_PATH } from './lib/db.js';
import { fetchHtml, closeBrowser, delay } from './lib/fetch.js';
import { classifyClose, toDateOnly, todayDate } from './lib/close.js';

function parseArgs(argv) {
  const args = { source: null, limit: Infinity, delayMs: 2000, logEvery: 25 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source' && argv[i + 1]) args.source = argv[++i];
    else if (arg === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (arg === '--delay' && argv[i + 1]) args.delayMs = parseInt(argv[++i], 10);
    else if (arg === '--log-every' && argv[i + 1]) args.logEvery = parseInt(argv[++i], 10);
  }
  return args;
}

function makeProgressLogger(source, total, logEvery) {
  let done = 0;
  const start = Date.now();
  return (closed) => {
    done++;
    if (total === 0 || done % logEvery === 0 || done === total) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      const pct = total ? ((done / total) * 100).toFixed(0) : '100';
      const rate = elapsed > 0 ? (done / elapsed).toFixed(2) : '-';
      console.log(`[recheck] ${source}: ${done}/${total} (${pct}%, ${elapsed}s elapsed, ${rate}/s, closed=${closed})`);
    }
  };
}

function detectHaloOglasiClose(html) {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Explicit stoppage reason present on the detail page.
  const reasonMatch = text.match(/StoppageReasonDescription["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (reasonMatch) {
    const reason = reasonMatch[1];
    const closedBy = classifyClose(reason);
    if (closedBy !== null) return { closed: true, closedBy, date: todayDate() };
  }

  // Fallback: recognizable closure messages.
  const closedMarkers = /(oglas (je )?(prodat|istekao|deaktiviran|uklonjen|neaktivan|arhiviran)|ad (has been|is) (sold|expired|deactivated|removed|archived))/i;
  if (!closedMarkers.test(text)) return { closed: false, closedBy: 'not_closed_yet', date: null };

  const closedBy = classifyClose(text);
  if (closedBy === null) return { closed: true, closedBy: 'platform', date: null };
  return { closed: true, closedBy, date: todayDate() };
}

async function recheckKupujemProdajem(posts, delayMs, logEvery) {
  const puppeteerExtra = (await import('puppeteer-extra')).default;
  const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
  puppeteerExtra.use(StealthPlugin());

  const browser = await puppeteerExtra.launch({ headless: true, args: ['--no-sandbox'] });
  let closed = 0;
  const progress = makeProgressLogger('kupujemprodajem', posts.length, logEvery);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    for (const post of posts) {
      const adId = post.id;
      try {
        console.log(`[recheck] checking ${adId}: ${post.url}`);
        await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
        await new Promise(r => setTimeout(r, delayMs));

        const status = await page.evaluate((id) => {
          const nextData = window.__NEXT_DATA__;
          const byId = nextData?.props?.initialReduxState?.ad?.byId ?? {};
          const d = byId[id];
          if (d) {
            return {
              isAdDeleted: d.isAdDeleted === true,
              status: typeof d.status === 'string' ? d.status : null,
              adValidUntil: d.adValidUntil ?? null,
            };
          }
          return null;
        }, adId);

        if (status && (status.isAdDeleted || (status.status && status.status !== 'normal' && status.status !== 'active'))) {
          const closedBy = status.isAdDeleted ? 'author' : (classifyClose(status.status) ?? 'platform');
          const date = closedBy === 'author' ? (toDateOnly(status.adValidUntil) ?? todayDate()) : null;
          markClosed(post.id, closedBy, date);
          closed++;
          console.log(`[recheck] closed ${post.id}: closedBy=${closedBy} date=${date ?? '-'}`);
        }
      } catch (err) {
        console.warn(`  [recheck] skip ${post.id}: ${err.message}`);
      }
      progress(closed);
    }
  } finally {
    await browser.close();
  }

  return closed;
}

async function recheckHaloOglasi(posts, delayMs, logEvery) {
  let closed = 0;
  const progress = makeProgressLogger('halooglasi', posts.length, logEvery);
  for (const post of posts) {
    try {
      console.log(`[recheck] checking ${post.id}: ${post.url}`);
      const res = await fetchHtml(post.url);
      const detected = detectHaloOglasiClose(res.text);
      if (detected.closed) {
        markClosed(post.id, detected.closedBy, detected.date);
        closed++;
        console.log(`[recheck] closed ${post.id}: closedBy=${detected.closedBy} date=${detected.date ?? '-'}`);
      }
    } catch (err) {
      console.warn(`  [recheck] skip ${post.id}: ${err.message}`);
    }
    await delay(delayMs);
    progress(closed);
  }
  return closed;
}

const args = parseArgs(process.argv.slice(2));

const openPosts = listOpenPosts(args.source);
const kp = openPosts.filter(p => p.source.startsWith('kupujemprodajem'));
const ho = openPosts.filter(p => p.source.startsWith('halooglasi'));

console.log(`[recheck] open posts: ${openPosts.length} (kupujemprodajem=${kp.length}, halooglasi=${ho.length})`);

const limit = args.limit;
const kpPosts = limit === Infinity ? kp : kp.slice(0, limit);
const hoPosts = limit === Infinity ? ho : ho.slice(0, limit);

let total = 0;
console.log(`[recheck] checking ${hoPosts.length} halooglasi posts${args.source ? ' (source=' + args.source + ')' : ''}...`);
if (hoPosts.length) {
  total += await recheckHaloOglasi(hoPosts, args.delayMs, args.logEvery);
  await closeBrowser();
}
console.log(`[recheck] checking ${kpPosts.length} kupujemprodajem posts${args.source ? ' (source=' + args.source + ')' : ''}...`);
if (kpPosts.length) {
  total += await recheckKupujemProdajem(kpPosts, args.delayMs, args.logEvery);
}

console.log(`[recheck] done. closed: ${total} posts in ${DB_PATH}`);
