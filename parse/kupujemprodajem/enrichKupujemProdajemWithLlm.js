import { listPostsForLlmEnrichment, markPostLlmEnrichment, countPosts, DB_PATH } from '../lib/db.js';

function parseArgs(argv) {
  const args = { source: null, limit: Infinity, ollamaModel: 'gemma4-14threads:e2b', ollamaUrl: 'http://localhost:11434' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source' && argv[i + 1]) args.source = argv[++i];
    else if (arg === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (arg === '--model' && argv[i + 1]) args.ollamaModel = argv[++i];
    else if (arg === '--ollama-url' && argv[i + 1]) args.ollamaUrl = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const posts = listPostsForLlmEnrichment(args.source);
const toEnrich = args.limit === Infinity ? posts : posts.slice(0, args.limit);

console.log(`[enrich-llm-kupujemprodajem] candidates: ${posts.length}, enriching: ${toEnrich.length}`);
console.log(`[enrich-llm-kupujemprodajem] model: ${args.ollamaModel}, url: ${args.ollamaUrl}`);

if (toEnrich.length === 0) {
  console.log('[enrich-llm-kupujemprodajem] nothing to do');
  process.exit(0);
}

const PROMPT = `Ты анализируешь объявления о животных с сайтов объявлений. Определи:

1. Возраст животного — опиши одним словом ("young", "adult"). Если не понятно — верни "no-info".
2. Породу и тип животного на английском(например: "cat", "dog", "cat:British Shorthair", "dog:sheepdog"). Если не указаны — верни "no-info".

Ответь СТРОГО в формате JSON без лишнего текста:
{"age": "строка или no-info", "breed": "строка или no-info"}

Заголовок:
«{{TITLE}}»

Описание:
«{{DESCRIPTION}}»

JSON-ответ:`;

let enriched = 0;
let failed = 0;

for (const post of toEnrich) {
  const text = [post.title, post.description].filter(Boolean).join('\n');

  if (!text) {
    console.log(`  [enrich-llm] ${post.id}: empty text, skipping`);
    markPostLlmEnrichment(post.id, { age: 'no-info', breed: 'no-info' });
    enriched++;
    continue;
  }

  const prompt = PROMPT.replace('{{TITLE}}', (post.title ?? '').slice(0, 1000)).replace('{{DESCRIPTION}}', (post.description ?? '').slice(0, 2000));
  const body = JSON.stringify({ model: args.ollamaModel, prompt, stream: false, format: 'json' });

  try {
    const res = await fetch(`${args.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`  [enrich-llm] ${post.id}: ollama HTTP ${res.status}: ${errText}`);
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
      age: parsed.age || 'no-info',
      breed: parsed.breed || 'no-info',
    };

    markPostLlmEnrichment(post.id, enrichment);
    enriched++;

    console.log(`  [enrich-llm] ${post.id}: ${enrichment.age} | ${enrichment.breed}`);
  } catch (err) {
    console.error(`  [enrich-llm] ${post.id}: error: ${err.message}`);
    failed++;
  }
}

console.log(`[enrich-llm-kupujemprodajem] done. enriched: ${enriched}, failed: ${failed}, total posts: ${countPosts(args.source)} in ${DB_PATH}`);