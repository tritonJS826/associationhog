import { listTelegramMessagesForEnrichment, markTelegramEnrichment, countTelegramMessages, DB_PATH } from '../lib/db.js';

function parseArgs(argv) {
  const args = { channel: null, limit: Infinity, ollamaModel: 'gemma4-14threads:e2b', ollamaUrl: 'http://localhost:11434' };
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

const PROMPT = `Ты анализируешь сообщения из Telegram-канала о животных. Определи:

1. Является ли сообщение призывом о помощи для животного, например ПОИСКОМ хозяина (adoption search) — человек хочет отдать кошку, собаку или другое животное в добрые руки.
2. Возраст животного — опиши одним словом ("young", "adult"). Если не понятно — верни "no-info".
3. Породу и тип животного на английском(например: "cat", "dog", "cat:British Shorthair", "dog:sheepdog"). Если не указаны — верни "no-info".
4. Город, где находится животное (на сербском, например: Beograd, Novi Sad, Subotica, Zrenjanin, Niš, Kragujevac, Mladenovac, Pančevo, Kruševac, Čačak, Valjevo, Šabac, Obrenovac, Leskovac, Kraljevo). Если не указан — верни "no-info".

Ответь СТРОГО в формате JSON без лишнего текста:
{"is_adoption_search": true или false, "age": "строка или no-info", "breed": "строка или no-info", "city": "строка или no-info"}

Сообщение:
«{{TEXT}}»

JSON-ответ:`;

let enriched = 0;
let failed = 0;

for (const msg of toEnrich) {
  if (!msg.text) {
    console.log(`  [enrich-telegram] ${msg.id}: empty text, skipping`);
    markTelegramEnrichment(msg.id, { isAdoptionSearch: false, age: 'no-info', breed: 'no-info', city: 'no-info' });
    enriched++;
    continue;
  }

  const prompt = PROMPT.replace('{{TEXT}}', msg.text.slice(0, 2000));
  const body = JSON.stringify({ model: args.ollamaModel, prompt, stream: false, format: 'json' });

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
    const answer = (data.response ?? '').trim();

    let parsed;
    try {
      parsed = JSON.parse(answer);
    } catch {
      const clean = answer.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    }

    const enrichment = {
      isAdoptionSearch: !!parsed.is_adoption_search,
      age: parsed.age || 'no-info',
      breed: parsed.breed || 'no-info',
      city: parsed.city || 'no-info',
    };

    markTelegramEnrichment(msg.id, enrichment);
    enriched++;

    console.log(`  [enrich-telegram] ${msg.id}: ${enrichment.isAdoptionSearch ? 'YES' : 'NO'} | ${enrichment.age} | ${enrichment.breed} | ${enrichment.city}`);
  } catch (err) {
    console.error(`  [enrich-telegram] ${msg.id}: error: ${err.message}`);
    failed++;
  }
}

console.log(`[enrich-telegram] done. enriched: ${enriched}, failed: ${failed}, total messages: ${countTelegramMessages(args.channel)} in ${DB_PATH}`);
