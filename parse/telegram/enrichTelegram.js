import { listTelegramMessagesForEnrichment, markTelegramAdoptionSearch, countTelegramMessages, DB_PATH } from '../lib/db.js';

function parseArgs(argv) {
  const args = { channel: null, limit: Infinity, ollamaModel: 'gemma4:e2b', ollamaUrl: 'http://localhost:11434' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--channel' && argv[i + 1]) args.channel = argv[++i];
    else if (arg === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (arg === '--model' && argv[i + 1]) args.ollamaModel = argv[++i];
    else if (arg === '--ollama-url' && argv[i + 1]) args.ollamaUrl = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const messages = listTelegramMessagesForEnrichment(args.channel);
const toEnrich = args.limit === Infinity ? messages : messages.slice(0, args.limit);

console.log(`[enrich-telegram] candidates: ${messages.length}, enriching: ${toEnrich.length}`);
console.log(`[enrich-telegram] model: ${args.ollamaModel}, url: ${args.ollamaUrl}`);

if (toEnrich.length === 0) {
  console.log('[enrich-telegram] nothing to do');
  process.exit(0);
}

const PROMPT = `Ты анализируешь сообщения из Telegram-канала о животных. Определи, является ли сообщение ПОИСКОМ хозяина (adoption search) — то есть человек ищет, кому приютить (отдать) кошку, собаку или другое животное. Это НЕ объявление о поиске животного для себя, а наоборот — человек хочет отдать животное в добрые руки.

Ответь только "YES" если сообщение о том, что кто-то хочет приютить/отдать животное (adoption search). Ответь "NO" в противном случае.

Сообщение:
«{{TEXT}}»

Ответ (только YES или NO):`;

let enriched = 0;
let failed = 0;

for (const msg of toEnrich) {
  if (!msg.text) {
    console.log(`  [enrich-telegram] ${msg.id}: empty text, skipping`);
    markTelegramAdoptionSearch(msg.id, 0);
    enriched++;
    continue;
  }

  const prompt = PROMPT.replace('{{TEXT}}', msg.text.slice(0, 2000));
  const body = JSON.stringify({ model: args.ollamaModel, prompt, stream: false });

  try {
    const res = await fetch(`${args.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`  [enrich-telegram] ${msg.id}: ollama HTTP ${res.status}: ${errText}`);
      failed++;
      continue;
    }

    const data = await res.json();
    const answer = (data.response ?? '').trim().toUpperCase();
    const isAdoptionSearch = answer === 'YES';
    markTelegramAdoptionSearch(msg.id, isAdoptionSearch);
    enriched++;

    console.log(`  [enrich-telegram] ${msg.id}: ${isAdoptionSearch ? 'YES (adoption search)' : 'NO'}`);
  } catch (err) {
    console.error(`  [enrich-telegram] ${msg.id}: fetch error: ${err.message}`);
    failed++;
  }
}

console.log(`[enrich-telegram] done. enriched: ${enriched}, failed: ${failed}, total messages: ${countTelegramMessages(args.channel)} in ${DB_PATH}`);
