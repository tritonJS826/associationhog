import { listPostsForEnrichment, enrichPost, DB_PATH, countPosts } from '../lib/db.js';
import { classifyClose, toDateOnly } from '../lib/close.js';

const BASE_URL = 'https://www.kupujemprodajem.com';

function stripHtml(str) {
  return (str ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArgs(argv) {
  const args = { source: null, limit: Infinity, delayMs: 30000, retries: 3 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source' && argv[i + 1]) args.source = argv[++i];
    else if (arg === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (arg === '--delay' && argv[i + 1]) args.delayMs = parseInt(argv[++i], 10);
    else if (arg === '--retries' && argv[i + 1]) args.retries = parseInt(argv[++i], 10);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const posts = listPostsForEnrichment(args.source);
const toEnrich = args.limit === Infinity ? posts : posts.slice(0, args.limit);

console.log(`[enrich] candidates: ${posts.length}, enriching: ${toEnrich.length}, delay: ${args.delayMs}ms`);

if (toEnrich.length === 0) {
  console.log('[enrich] nothing to do');
  process.exit(0);
}

const puppeteerExtra = (await import('puppeteer-extra')).default;
const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());

const browser = await puppeteerExtra.launch({ headless: true, args: ['--no-sandbox'] });

let enriched = 0;
let failed = 0;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  for (const post of toEnrich) {
    const adId = post.id;
    let success = false;

    for (let attempt = 1; attempt <= args.retries && !success; attempt++) {
      try {
        console.log(`[enrich] checking ${adId}: ${post.url}`);
        await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 3000));

        const detail = await page.evaluate((id) => {
          const nextData = window.__NEXT_DATA__;
          const byId = nextData?.props?.initialReduxState?.ad?.byId ?? {};
          const d = byId[id];

          if (d) return { type: 'nextData', detail: d };

          // DOM fallback
          const titleEl = document.querySelector('h1');
          const descEl = document.querySelector('[class*=description] p, [class*=adDescription]');
          const priceEl = document.querySelector('[class*=price]');
          const imgs = [...document.querySelectorAll('img[src*="kupujemprodajem"]')].map(i => i.src);

          return {
            type: 'dom',
            title: titleEl?.textContent?.trim(),
            description: descEl?.textContent?.trim(),
            price: priceEl?.textContent?.trim(),
            images: imgs,
          };
        }, adId);

        if (detail.type === 'nextData' && detail.detail) {
          const d = detail.detail;
          const desc = stripHtml(d.description);
          const images = [];
          if (d.image) images.push(d.image);
          if (Array.isArray(d.photos)) {
            for (const p of d.photos) {
              if (p.original) images.push(p.original);
              else if (p.thumbnail) images.push(p.thumbnail);
            }
          }
          if (d.photosBig) images.push(d.photosBig);

          enrichPost(post.id, {
            title: d.name || undefined,
            description: desc || undefined,
            price: d.priceText || d.priceDisplay || undefined,
            images: images.length ? JSON.stringify([...new Set(images)]) : undefined,
          });
          enriched++;
          success = true;
        } else if (detail.type === 'dom') {
          const desc = stripHtml(detail.description);
          enrichPost(post.id, {
            title: detail.title || undefined,
            description: desc || undefined,
            price: detail.price || undefined,
            images: detail.images?.length ? JSON.stringify(detail.images) : undefined,
          });
          enriched++;
          success = true;
        } else {
          // still mark as fetched so we don't retry forever
          enrichPost(post.id, {});
          enriched++;
          success = true;
        }
      } catch (err) {
        if (attempt === args.retries) {
          console.warn(`  [enrich] ${post.id} failed after ${args.retries} attempts: ${err.message}`);
          failed++;
        } else {
          const backoff = args.delayMs * 2 ** attempt;
          console.warn(`  [enrich] ${post.id} attempt ${attempt}/${args.retries} failed, retrying in ${Math.round(backoff / 1000)}s`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    if (success) {
      await new Promise((r) => setTimeout(r, args.delayMs));
    }
  }
} finally {
  await browser.close();
}

console.log(`[enrich] done. enriched: ${enriched}, failed: ${failed}, total posts: ${countPosts(args.source)} in ${DB_PATH}`);