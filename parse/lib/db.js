import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    description_hash TEXT,
    city                      TEXT,
    price                     TEXT,
    images                    TEXT,
    raw                       TEXT,
    closed_by                 TEXT NOT NULL DEFAULT 'not_closed_yet',
    date_closed               TEXT,
    first_seen                TEXT NOT NULL,
    last_seen                 TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_posts_source ON posts (source);
`);

// Migrations for databases created before a given column existed.
const columns = db.prepare("PRAGMA table_info(posts)").all().map((c) => c.name);
if (!columns.includes('description_hash')) {
  db.exec('ALTER TABLE posts ADD COLUMN description_hash TEXT');
}
if (!columns.includes('closed_by')) {
  db.exec("ALTER TABLE posts ADD COLUMN closed_by TEXT NOT NULL DEFAULT 'not_closed_yet'");
}
if (!columns.includes('date_closed')) {
  db.exec('ALTER TABLE posts ADD COLUMN date_closed TEXT');
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

export function normalizeForHash(value) {
  return (value ?? '')
    .toString()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function descriptionHash(description, title = '') {
  const input = normalizeForHash(description || title);
  if (!input) return null;
  return createHash('sha256').update(input).digest('hex');
}

// Migrate NULL images to an empty JSON array.
db.exec("UPDATE posts SET images = '[]' WHERE images IS NULL");

// Backfill hashes for rows that predate the description_hash column.
const rowsWithoutHash = db.prepare(`
  SELECT id, description, title FROM posts WHERE description_hash IS NULL
`).all();
for (const row of rowsWithoutHash) {
  const hash = descriptionHash(row.description, row.title);
  db.prepare('UPDATE posts SET description_hash = ? WHERE id = ?').run(hash, row.id);
}

const INSERT_POST = db.prepare(`
  INSERT INTO posts (id, source, url, title, description, description_hash, city, price, images, raw, closed_by, date_closed, first_seen, last_seen)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    url = excluded.url,
    title = excluded.title,
    description = excluded.description,
    description_hash = excluded.description_hash,
    city = excluded.city,
    price = excluded.price,
    images = excluded.images,
    raw = excluded.raw,
    closed_by = excluded.closed_by,
    date_closed = excluded.date_closed,
    last_seen = excluded.last_seen
`);

const FIND_BY_HASH = db.prepare(`
  SELECT id FROM posts WHERE source = ? AND description_hash = ?
`);

const UPDATE_EXISTING_BY_HASH = db.prepare(`
  UPDATE posts SET last_seen = ? WHERE source = ? AND description_hash = ?
`);

const MARK_CLOSED = db.prepare(`
  UPDATE posts
  SET closed_by = ?, date_closed = ?, last_seen = ?
  WHERE id = ?
`);

export function upsertPost(post) {
  const now = new Date().toISOString();
  const hash = post.description_hash ?? descriptionHash(post.description, post.title);
  const closedBy = post.closed_by ?? 'not_closed_yet';

  if (hash) {
    const existing = FIND_BY_HASH.get(post.source, hash);
    if (existing) {
      UPDATE_EXISTING_BY_HASH.run(now, post.source, hash);
      return { inserted: false, duplicate: true, id: existing.id };
    }
  }

  INSERT_POST.run(
    post.id,
    post.source,
    post.url ?? null,
    post.title ?? null,
    post.description ?? null,
    hash,
    post.city ?? null,
    post.price ?? null,
    post.images ?? '[]',
    post.raw ?? null,
    closedBy,
    post.date_closed ?? null,
    post.first_seen ?? now,
    now
  );

  return { inserted: true, duplicate: false, id: post.id };
}

export function markClosed(id, closedBy, dateClosed = null) {
  const now = new Date().toISOString();
  MARK_CLOSED.run(closedBy ?? 'not_closed_yet', dateClosed ?? null, now, id);
}

export function listOpenPosts(source = null) {
  if (source) {
    return db.prepare("SELECT id, source, url FROM posts WHERE closed_by = 'not_closed_yet' AND source = ?").all(source);
  }
  return db.prepare("SELECT id, source, url FROM posts WHERE closed_by = 'not_closed_yet'").all();
}

export function countPosts(source = null) {
  if (source) {
    return db.prepare('SELECT COUNT(*) AS n FROM posts WHERE source = ?').get(source).n;
  }
  return db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
}

export { db, DB_PATH };