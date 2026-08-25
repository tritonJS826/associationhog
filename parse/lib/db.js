import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, 'data');
const DB_PATH = join(DATA_DIR, 'associationhog.sqlite');

mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 30000;

  CREATE TABLE IF NOT EXISTS posts (
    id               TEXT PRIMARY KEY,
    source           TEXT NOT NULL,
    url              TEXT,
    title            TEXT,
    description      TEXT,
    city                      TEXT,
    price                     TEXT,
    images                    TEXT,
    raw                       TEXT,
    closed_by                 TEXT NOT NULL DEFAULT 'not_closed_yet',
    date_closed               TEXT,
    details_fetched           INTEGER NOT NULL DEFAULT 0,
    age                       TEXT,
    breed                     TEXT,
    first_seen                TEXT NOT NULL,
    last_seen                 TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_posts_source ON posts (source);

  CREATE TABLE IF NOT EXISTS telegram_messages (
    id               TEXT PRIMARY KEY,
    channel          TEXT NOT NULL,
    message_id       INTEGER NOT NULL,
    text             TEXT,
    images           TEXT NOT NULL DEFAULT '[]',
    date             TEXT NOT NULL,
    first_seen       TEXT NOT NULL,
    last_seen        TEXT NOT NULL,
is_adoption_search INTEGER,
    age              TEXT,
    breed            TEXT,
    city             TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_telegram_channel ON telegram_messages (channel);
  CREATE INDEX IF NOT EXISTS idx_telegram_adoption ON telegram_messages (is_adoption_search);
`);

// Migrations for databases created before a given column existed.
const columns = db.prepare("PRAGMA table_info(posts)").all().map((c) => c.name);
if (!columns.includes('closed_by')) {
  db.exec("ALTER TABLE posts ADD COLUMN closed_by TEXT NOT NULL DEFAULT 'not_closed_yet'");
}
if (!columns.includes('date_closed')) {
  db.exec('ALTER TABLE posts ADD COLUMN date_closed TEXT');
}
if (!columns.includes('details_fetched')) {
  db.exec('ALTER TABLE posts ADD COLUMN details_fetched INTEGER NOT NULL DEFAULT 0');
}
if (!columns.includes('age')) {
  db.exec('ALTER TABLE posts ADD COLUMN age TEXT');
}
if (!columns.includes('breed')) {
  db.exec('ALTER TABLE posts ADD COLUMN breed TEXT');
}

// Migrate from the old boolean columns (is_closed_by_ad_maker / date_closed_by_ad_maker).
const oldColumns = db.prepare("PRAGMA table_info(posts)").all().map((c) => c.name);
if (oldColumns.includes('is_closed_by_ad_maker')) {
  db.exec(`
    UPDATE posts
      SET closed_by = CASE WHEN is_closed_by_ad_maker = 1 THEN 'author' ELSE 'not_closed_yet' END,
          date_closed = date_closed_by_ad_maker
      WHERE closed_by = 'not_closed_yet' AND date_closed IS NULL;
    ALTER TABLE posts DROP COLUMN is_closed_by_ad_maker;
  `);
}
if (oldColumns.includes('date_closed_by_ad_maker')) {
  db.exec('ALTER TABLE posts DROP COLUMN date_closed_by_ad_maker');
}

// Legacy hash-based dedup column is no longer used.
const dedupColumns = db.prepare("PRAGMA table_info(posts)").all().map((c) => c.name);
if (dedupColumns.includes('description_hash')) {
  db.exec('ALTER TABLE posts DROP COLUMN description_hash');
}

// Migrate NULL images to an empty JSON array.
db.exec("UPDATE posts SET images = '[]' WHERE images IS NULL");

// Migrations for telegram_messages table
const tgColumns = db.prepare("PRAGMA table_info(telegram_messages)").all().map((c) => c.name);
if (!tgColumns.includes('is_adoption_search')) {
  db.exec("ALTER TABLE telegram_messages ADD COLUMN is_adoption_search INTEGER");
}
if (!tgColumns.includes('age')) {
  db.exec('ALTER TABLE telegram_messages ADD COLUMN age TEXT');
}
if (!tgColumns.includes('breed')) {
  db.exec('ALTER TABLE telegram_messages ADD COLUMN breed TEXT');
}
if (!tgColumns.includes('city')) {
  db.exec('ALTER TABLE telegram_messages ADD COLUMN city TEXT');
}
if (!tgColumns.includes('images')) {
  db.exec("ALTER TABLE telegram_messages ADD COLUMN images TEXT NOT NULL DEFAULT '[]'");
}

const INSERT_POST = db.prepare(`
  INSERT INTO posts (id, source, url, title, description, city, price, images, raw, closed_by, date_closed, first_seen, last_seen)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    url = excluded.url,
    title = excluded.title,
    description = CASE WHEN posts.details_fetched = 1 THEN posts.description ELSE excluded.description END,
    city = excluded.city,
    price = excluded.price,
    images = excluded.images,
    raw = excluded.raw,
    closed_by = excluded.closed_by,
    date_closed = excluded.date_closed,
    last_seen = excluded.last_seen
`);

const FIND_BY_ID = db.prepare(`
  SELECT id FROM posts WHERE id = ?
`);

const MARK_CLOSED = db.prepare(`
  UPDATE posts
  SET closed_by = ?, date_closed = ?, last_seen = ?
  WHERE id = ?
`);

export function upsertPost(post) {
  const now = new Date().toISOString();
  const closedBy = post.closed_by ?? 'not_closed_yet';

  const existing = FIND_BY_ID.get(post.id);

  INSERT_POST.run(
    post.id,
    post.source,
    post.url ?? null,
    post.title ?? null,
    post.description ?? null,
    post.city ?? null,
    post.price ?? null,
    post.images ?? '[]',
    post.raw ?? null,
    closedBy,
    post.date_closed ?? null,
    post.first_seen ?? now,
    now
  );

  if (existing) return { inserted: false, duplicate: true, id: existing.id };
  return { inserted: true, duplicate: false, id: post.id };
}

export function markClosed(id, closedBy, dateClosed = null) {
  const now = new Date().toISOString();
  MARK_CLOSED.run(closedBy ?? 'not_closed_yet', dateClosed ?? null, now, id);
}

export function enrichPost(id, { title, description, price, images } = {}) {
  const now = new Date().toISOString();

  const sets = ['details_fetched = 1', 'last_seen = ?'];
  const params = [now];

  if (title !== undefined && title !== null) {
    sets.push('title = ?');
    params.push(title);
  }
  if (description !== undefined && description !== null) {
    sets.push('description = ?');
    params.push(description);
  }
  if (price !== undefined && price !== null) {
    sets.push('price = ?');
    params.push(price);
  }
  if (images !== undefined && images !== null) {
    sets.push('images = ?');
    params.push(images);
  }

  params.push(id);
  db.prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function listOpenPosts(source = null) {
  if (source) {
    return db.prepare("SELECT id, source, url FROM posts WHERE closed_by = 'not_closed_yet' AND source = ?").all(source);
  }
  return db.prepare("SELECT id, source, url FROM posts WHERE closed_by = 'not_closed_yet'").all();
}

export function listPostsForEnrichment(source = null) {
  if (source) {
    return db.prepare("SELECT id, source, url FROM posts WHERE closed_by = 'not_closed_yet' AND details_fetched = 0 AND source = ?").all(source);
  }
  return db.prepare("SELECT id, source, url FROM posts WHERE closed_by = 'not_closed_yet' AND details_fetched = 0").all();
}

export function countPosts(source = null) {
  if (source) {
    return db.prepare('SELECT COUNT(*) AS n FROM posts WHERE source = ?').get(source).n;
  }
  return db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
}

export function listPostsForLlmEnrichment(source = null) {
  if (source) {
    return db.prepare("SELECT id, source, url, title, description FROM posts WHERE closed_by = 'not_closed_yet' AND details_fetched = 1 AND (age IS NULL OR breed IS NULL) AND source = ?").all(source);
  }
  return db.prepare("SELECT id, source, url, title, description FROM posts WHERE closed_by = 'not_closed_yet' AND details_fetched = 1 AND (age IS NULL OR breed IS NULL)").all();
}

const MARK_POST_LLM = db.prepare(`
  UPDATE posts
  SET age = ?, breed = ?
  WHERE id = ?
`);

export function markPostLlmEnrichment(id, { age, breed } = {}) {
  MARK_POST_LLM.run(
    age ?? null,
    breed ?? null,
    id
  );
}

const INSERT_TELEGRAM_MSG = db.prepare(`
  INSERT INTO telegram_messages (id, channel, message_id, text, images, date, first_seen, last_seen)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    text = excluded.text,
    images = excluded.images,
    last_seen = excluded.last_seen
`);

const FIND_TELEGRAM_BY_ID = db.prepare(`
  SELECT id FROM telegram_messages WHERE id = ?
`);

function upsertTelegramMessage(msg) {
  const now = new Date().toISOString();
  const existing = FIND_TELEGRAM_BY_ID.get(msg.id);

  INSERT_TELEGRAM_MSG.run(
    msg.id,
    msg.channel,
    msg.messageId,
    msg.text ?? null,
    msg.images ?? '[]',
    msg.date ?? now,
    now,
    now
  );

  if (existing) return { inserted: false, duplicate: true, id: existing.id };
  return { inserted: true, duplicate: false, id: msg.id };
}

function listTelegramMessagesForEnrichment(channel = null) {
  if (channel) {
    return db.prepare("SELECT id, channel, message_id, text, date FROM telegram_messages WHERE is_adoption_search IS NULL AND channel = ?").all(channel);
  }
  return db.prepare("SELECT id, channel, message_id, text, date FROM telegram_messages WHERE is_adoption_search IS NULL").all();
}

const MARK_TELEGRAM_ENRICHMENT = db.prepare(`
  UPDATE telegram_messages
  SET is_adoption_search = ?, age = ?, breed = ?, city = ?
  WHERE id = ?
`);

function markTelegramEnrichment(id, { isAdoptionSearch, age, breed, city } = {}) {
  MARK_TELEGRAM_ENRICHMENT.run(
    isAdoptionSearch ? 1 : 0,
    age ?? null,
    breed ?? null,
    city ?? null,
    id
  );
}

function countTelegramMessages(channel = null) {
  if (channel) {
    return db.prepare('SELECT COUNT(*) AS n FROM telegram_messages WHERE channel = ?').get(channel).n;
  }
  return db.prepare('SELECT COUNT(*) AS n FROM telegram_messages').get().n;
}

export {
  db,
  DB_PATH,
  upsertTelegramMessage,
  listTelegramMessagesForEnrichment,
  markTelegramEnrichment,
  countTelegramMessages,
};