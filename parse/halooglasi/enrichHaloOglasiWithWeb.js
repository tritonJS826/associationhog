import { listPostsForEnrichment, enrichPost, DB_PATH, countPosts } from '../lib/db.js';
import { fetchHtml, closeBrowser, delay } from '../lib/fetch.js';

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

function extractDetailData(html) {
  const result = { description: null, images: [] };

  const metaDesc = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (metaDesc) result.description = stripHtml(metaDesc[1]);

  const descMatch = html.match(/data-field-name="opis_s"\s+data-field-value="([^"]*)"/i);
  if (descMatch) {
    const val = descMatch[1];
    if (val && !/^\s*$/.test(val)) {
      result.description = stripHtml(val);
    }
  }

  const imgMatches = html.matchAll(/<img\s+[^>]*src="(https:\/\/slike\.halooglasi\.com\/[^"]+)"[^>]*>/gi);
  for (const m of imgMatches) {
    result.images.push(m[1]);
  }

  return result;
}

function parseArgs(argv) {
  const args = { source: null, limit: Infinity, delayMs: 3000, retries: 3 };
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

console.log(`[enrich-web-halooglasi-${args.source}] candidates: ${posts.length}, enriching: ${toEnrich.length}, delay: ${args.delayMs}ms`);

if (toEnrich.length === 0) {
  console.log(`[enrich-web-halooglasi-${args-source}] nothing to do`);
  process.exit(0);
}

let enriched = 0;
let failed = 0;

try {
  for (const post of toEnrich) {
    let success = false;

    for (let attempt = 1; attempt <= args.retries && !success; attempt++) {
      try {
        console.log(`[enrich-web-halooglasi-${args.source}] checking ${post.id}: ${post.url}`);
        const res = await fetchHtml(post.url);
        const detail = extractDetailData(res.text);

        enrichPost(post.id, {
          description: detail.description || undefined,
          images: detail.images.length ? JSON.stringify(detail.images) : undefined,
        });
        enriched++;
        success = true;
      } catch (err) {
        if (attempt === args.retries) {
          console.warn(`  [enrich-web-halooglasi-${args.source}] ${post.id} failed after ${args.retries} attempts: ${err.message}`);
          enrichPost(post.id, {});
          enriched++;
          success = true;
        } else {
          const backoff = args.delayMs * 2 ** attempt;
          console.warn(`  [enrich-web-halooglasi-${args.source}] ${post.id} attempt ${attempt}/${args.retries} failed, retrying in ${Math.round(backoff / 1000)}s`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    if (success) {
      await delay(args.delayMs);
    }
  }
} finally {
  await closeBrowser();
}

console.log(`[enrich-web-halooglasi-${args.source}] done. enriched: ${enriched}, failed: ${failed}, total posts: ${countPosts(args.source)} in ${DB_PATH}`);
