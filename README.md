# associationhog

A custom Node.js parser/aggregator that scrapes internet resources and stores
posts into a local SQLite database.

## Parsers

- `parse/halooglasi.js` — parses halooglasi.com listing pages.
- `parse/kupujemprodajem.js` — parses kupujemprodajem.com listing pages.

Both write into the same `posts` table, so the project works as an aggregator
across multiple sources. The target URL is always passed as a parameter (there
are no hardcoded default resources).

## Requirements

- Node.js >= 22 (uses built-in `node:sqlite`)
- `curl` (used by the fetcher to bypass Cloudflare bot checks)
- make (optional, for convenience scripts)

No npm dependencies are required.

## Installation

```bash
# 1. Initialize the SQLite database (creates data/associationhog.sqlite)
make init

# 2. Parse a resource by passing its URL
make parse-halooglasi URL="https://www.halooglasi.com/kucni-ljubimci/psi?poklanjam_b=true"
make parse-kupujemprodajem URL="https://www.kupujemprodajem.com/kucni-ljubimci/udomljavanje-zivotinja/grupa/14/1984/1"
```

## Usage

```bash
# halooglasi
node parse/halooglasi.js --url "https://www.halooglasi.com/kucni-ljubimci/psi?poklanjam_b=true"

# kupujemprodajem
node parse/kupujemprodajem.js --url "https://www.kupujemprodajem.com/kucni-ljubimci/udomljavanje-zivotinja/grupa/14/1984/1"
```

### Common options

| Option         | Default | Description                                        |
| -------------- | ------- | -------------------------------------------------- |
| `--url`        | (none)  | Required. The listing page to parse.               |
| `--source`     | per-script | Label stored in the `source` column.           |
| `--max-pages`  | all     | Limit the number of pages to fetch (useful for testing). |
| `--delay`      | `2000`  | Delay in ms between page fetches.                  |

kupujemprodajem only:

| Option         | Description                                        |
| -------------- | -------------------------------------------------- |
| `--no-details` | Skip per-ad detail pages (faster; stores only the list snippet as description). |

```bash
# Test on a single page
node parse/halooglasi.js --url "..." --max-pages 1
node parse/kupujemprodajem.js --url "..." --max-pages 1 --no-details
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
