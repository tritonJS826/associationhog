import { listOpenPosts, markClosed, DB_PATH } from '../lib/db.js';
import { fetchHtml, closeBrowser, delay } from '../lib/fetch.js';
import { classifyClose } from '../lib/close.js';

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

function detectHaloOglasiClose(html, httpStatus) {
  if (httpStatus !== 200) {
    const closedMarkers = /(oglas (je )?(prodat|istekao|deaktiviran|uklonjen|neaktivan|arhiviran)|ad (has been|is) (sold|expired|deactivated|removed|archived))/i;
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    if (closedMarkers.test(text)) {
      return { closed: true, closedBy: classifyClose(text) ?? 'platform' };
    }
    return { closed: true, closedBy: 'platform' };
  }

  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  const reasonMatch = text.match(/StoppageReasonDescription["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (reasonMatch) {
    return { closed: true, closedBy: classifyClose(reasonMatch[1]) ?? 'platform' };
  }

  const closedMarkers = /(oglas (je )?(prodat|istekao|deaktiviran|uklonjen|neaktivan|arhiviran)|ad (has been|is) (sold|expired|deactivated|removed|archived))/i;
  if (!closedMarkers.test(text)) return { closed: false };

  return { closed: true, closedBy: classifyClose(text) ?? 'platform' };
}

const args = parseArgs(process.argv.slice(2));

const openPosts = listOpenPosts(args.source);
const ho = openPosts.filter(p => p.source.startsWith('halooglasi'));

console.log(`[recheck-halooglasi] open posts: ${ho.length}`);

const limit = args.limit;
const hoPosts = limit === Infinity ? ho : ho.slice(0, limit);

let closed = 0;
const progress = makeProgressLogger('halooglasi', hoPosts.length, args.logEvery);

try {
  for (const post of hoPosts) {
    try {
      console.log(`[recheck] checking ${post.id}: ${post.url}`);
      const res = await fetchHtml(post.url);
      const detected = detectHaloOglasiClose(res.text, res.status);
      if (detected.closed) {
        markClosed(post.id, detected.closedBy);
        closed++;
        console.log(`[recheck] closed ${post.id}: closedBy=${detected.closedBy}`);
      }
    } catch (err) {
      console.warn(`  [recheck] skip ${post.id}: ${err.message}`);
    }
    await delay(args.delayMs);
    progress(closed);
  }
} finally {
  await closeBrowser();
}

console.log(`[recheck-halooglasi] done. closed: ${closed} posts in ${DB_PATH}`);