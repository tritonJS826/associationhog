import { scrapeTelegramChannel } from '../lib/telegram.js';
import { countTelegramMessages, DB_PATH } from '../lib/db.js';

function parseArgs(argv) {
  const args = { channel: null, apiId: null, apiHash: null, maxMessages: Infinity };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--channel' && argv[i + 1]) args.channel = argv[++i];
    else if (arg === '--api-id' && argv[i + 1]) args.apiId = parseInt(argv[++i], 10);
    else if (arg === '--api-hash' && argv[i + 1]) args.apiHash = argv[++i];
    else if (arg === '--max-messages' && argv[i + 1]) args.maxMessages = parseInt(argv[++i], 10);
  }

  // Fall back to env vars
  if (!args.apiId && process.env.TELEGRAM_API_ID) args.apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
  if (!args.apiHash && process.env.TELEGRAM_API_HASH) args.apiHash = process.env.TELEGRAM_API_HASH;

  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.channel) {
  console.error('[telegram] --channel is required');
  process.exit(1);
}
if (!args.apiId || !args.apiHash) {
  console.error('[telegram] --api-id and --api-hash required (args or TELEGRAM_API_ID / TELEGRAM_API_HASH env vars). Get them at https://my.telegram.org/apps');
  process.exit(1);
}

console.log(`[telegram] channel: ${args.channel}`);
console.log(`[telegram] max-messages: ${args.maxMessages}`);

try {
  const result = await scrapeTelegramChannel(args);
  console.log(`[telegram] saved ${result.saved} messages, ${result.duplicates} duplicates`);
  console.log(`[db] total messages in ${DB_PATH}: ${countTelegramMessages(args.channel)}`);
} catch (err) {
  console.error(`[telegram] error: ${err.message}`);
  process.exit(1);
}