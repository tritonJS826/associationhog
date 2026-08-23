# associationhog

Scrape internet resources and store posts into a local SQLite database.

## Scripts and resources

- `parse:halooglasi:psi`
  - https://www.halooglasi.com/kucni-ljubimci/psi?poklanjam_b=true
- `parse:halooglasi:macke`
  - https://www.halooglasi.com/kucni-ljubimci/macke?poklanjam_b=true

Planned (no script yet):

- https://www.kupujemprodajem.com/kucni-ljubimci/udomljavanje-zivotinja/grupa/14/1984/1

## Requirements

- Node.js >= 22 (uses built-in `fetch` and `node:sqlite`)
- make (optional, for convenience scripts)

No npm dependencies are required.

## Installation

```bash
# 1. Initialize the SQLite database (creates data/associationhog.sqlite)
make init

# 2. Parse the default resource (halooglasi "psi poklanjam")
make parse

# Or test with a single page first
make parse-halooglasi-test
```

## Usage

```bash
# Parse each resource
npm run parse:halooglasi:psi
npm run parse:halooglasi:macke

# Or run directly with a custom URL / limits
node parse/halooglasi.js --url "https://www.halooglasi.com/kucni-ljubimci/macke?poklanjam_b=true" --max-pages 3
```

The database is stored at `data/associationhog.sqlite` (table `posts`).

## Deduplication

Each post is fingerprinted with a `description_hash` (SHA-256 of the normalized
description, falling back to the title). Re-running a scraper does not create
duplicate rows: when a post with the same `description_hash` already exists for
the same `source`, only its `last_seen` timestamp is refreshed.

```bash
# Inspect the stored posts and their hashes
sqlite3 data/associationhog.sqlite "SELECT source, COUNT(*) FROM posts GROUP BY source;"
sqlite3 data/associationhog.sqlite "SELECT id, title, description_hash FROM posts LIMIT 5;"
```
