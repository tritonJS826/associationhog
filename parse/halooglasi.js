import { scrapeHaloOglasi } from './lib/halooglasi.js';
import { countPosts, DB_PATH } from './lib/db.js';

function parseArgs(argv) {
  const args = {
    url: null,
    source: 'halooglasi',
    maxPages: Infinity,
    delayMs: 2000,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url' && argv[i + 1]) args.url = argv[++i];
    else if (arg === '--source' && argv[i + 1]) args.source = argv[++i];
    else if (arg === '--max-pages' && argv[i + 1]) args.maxPages = parseInt(argv[++i], 10);
    else if (arg === '--delay' && argv[i + 1]) args.delayMs = parseInt(argv[++i], 10);
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.url) {
  console.error('[halooglasi] --url is required');
  process.exit(1);
}

console.log(`[halooglasi] url: ${args.url}`);
console.log(`[halooglasi] source: ${args.source}`);

try {
  const result = await scrapeHaloOglasi(args);
  console.log(`[halooglasi] saved ${result.saved} ads, ${result.duplicates} duplicates (total on site: ${result.totalCount})`);
  console.log(`[db] total posts in ${DB_PATH}: ${countPosts(args.source)}`);
} catch (err) {
  console.error(`[halooglasi] error: ${err.message}`);
  process.exit(1);
}