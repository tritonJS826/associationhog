import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { upsertTelegramMessage } from './db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SESSION_PATH = join(ROOT, 'data', 'telegram.session');

function prompt(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (a) => { rl.close(); resolve(a); }));
}

async function getClient(apiId, apiHash) {
  const saved = existsSync(SESSION_PATH) ? readFileSync(SESSION_PATH, 'utf-8').trim() : '';
  const session = new StringSession(saved);
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 2 });

  await client.start({
    phoneNumber: async () => await prompt('Phone (+1234567890): '),
    password: async (hint) => {
      const msg = hint ? `2FA password (hint: ${hint}): ` : '2FA password: ';
      return await prompt(msg);
    },
    phoneCode: async () => await prompt('Code from Telegram: '),
    onError: (err) => console.error('[telegram] auth error:', err),
  });

  if (!saved) {
    const newSession = client.session.save();
    writeFileSync(SESSION_PATH, newSession);
    console.log(`[telegram] session saved to ${SESSION_PATH}`);
  }

  return client;
}

export async function scrapeTelegramChannel({
  channel,
  topic,
  apiId,
  apiHash,
  maxMessages = Infinity,
}) {
  const client = await getClient(apiId, apiHash);

  try {
    const entity = await client.getEntity(channel);
    console.log(`[telegram] connected to ${entity.title || entity.username || channel}`);

    let offsetId = 0;
    let saved = 0;
    let duplicates = 0;

    const params = { limit: 100, offsetId };
    if (topic) {
      params.replyTo = topic;
      console.log(`[telegram] filtering topic: ${topic}`);
    }

    while (saved < maxMessages) {
      const messages = await client.getMessages(entity, params);

      if (!messages || messages.length === 0) break;

      for (const msg of messages) {
        if (!msg.message || msg.message.trim().length === 0) continue;

        const images = [];
        if (msg.photo) {
          images.push(`https://t.me/${channel}/${msg.id}`);
        }

        const dbResult = upsertTelegramMessage({
          id: topic ? `${channel}/${topic}/${msg.id}` : `${channel}/${msg.id}`,
          channel,
          messageId: msg.id,
          text: msg.message.trim(),
          images: JSON.stringify(images),
          date: new Date(msg.date * 1000).toISOString(),
        });
        if (dbResult.duplicate) duplicates++;
        else saved++;
      }

      console.log(`[telegram] batch: ${messages.length} msgs, saved ${saved}, dup ${duplicates}`);

      if (saved >= maxMessages || messages.length < 100) break;

      params.offsetId = messages[messages.length - 1].id;
    }

    console.log(`[telegram] done. saved: ${saved}, duplicates: ${duplicates}`);
    return { saved, duplicates };
  } finally {
    await client.destroy();
  }
}