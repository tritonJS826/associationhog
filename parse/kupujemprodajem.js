import { scrapeKupujemProdajem } from './lib/kupujemprodajem.js';
import { countPosts, DB_PATH } from './lib/db.js';

function parseArgs(argv) {
  const args = {
    url: null,
    source: 'kupujemprodajem',
    maxPages: Infinity,
    delayMs: 3000,
    fetchDetails: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url' && argv[i + 1]) args.url = argv[++i];
    else if (arg === '--source' && argv[i + 1]) args.source = argv[++i];
    else if (arg === '--max-pages' && argv[i + 1]) args.maxPages = parseInt(argv[++i], 10);
    else if (arg === '--delay' && argv[i + 1]) args.delayMs = parseInt(argv[++i], 10);
    else if (arg === '--no-details') args.fetchDetails = false;
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.url) {
  console.error('[kupujemprodajem] --url is required');
  process.exit(1);
}

console.log(`[kupujemprodajem] url: ${args.url}`);
console.log(`[kupujemprodajem] source: ${args.source}`);

try {
  const result = await scrapeKupujemProdajem(args);
  console.log(`[kupujemprodajem] saved ${result.saved} ads, ${result.duplicates} duplicates (total on site: ${result.totalCount})`);
  console.log(`[db] total posts in ${DB_PATH}: ${countPosts(args.source)}`);
} catch (err) {
  console.error(`[kupujemprodajem] error: ${err.message}`);
  process.exit(1);
}