# associationhog

A custom Node.js parser/aggregator that scrapes internet resources and stores
posts into a local SQLite database.

## Requirements

- Node.js >= 22 (uses built-in `node:sqlite`)
- puppeteer (used by the fetcher to bypass Cloudflare bot checks)
- make (optional, for convenience scripts)
- ollama with gemma4:31b:cloud (served) 

## Installation and first parse

```bash
# 1. Install dependencies
npm install

# 2. Initialize the SQLite database (creates data/associationhog.sqlite)
make init

# 3. Parse a resource by passing its URL (short description, previews)
make parse

# 4. Enrich parsed data with specif data from posts 
make enrich-with-web

# 5. Enrich data with llm 
make enrich-with-llm 
```

## Daily usage
```
make recheck && make parse && make enrich-with-web && make enrich-with-llm 
```

### Common options

| Option         | Default | Description                                        |
| -------------- | ------- | -------------------------------------------------- |
| `--url`        | (none)  | Required. The listing page to parse.               |
| `--source`     | per-script | Label stored in the `source` column.           |
| `--max-pages`  | all     | Limit the number of pages to fetch (useful for testing). |
| `--delay`      | `2000`  | Delay in ms between page fetches.                  |

kupujemprodajem only:

| Option      | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `--retries` | Retries per page when the site soft-blocks (default 3).        |

```bash
# Test on a single page
node parse/halooglasi/parseHaloOglasi.js --url "..." --max-pages 1
node parse/kupujemprodajem/parseKupujemProdajem.js --url "..." --max-pages 1
```

The database is stored at `data/associationhog.sqlite` (table `posts`).

## Which script to run and when

| Command | What it does | When to run |
| ------- | ------------ | ----------- |
| `make init` | Installs `node_modules` (via `npm install`) and creates/updates the SQLite DB and its schema. | Once after cloning the repo, and again after pulling changes that touch the schema. |
| `make parse` | Scrapes **both** resources and upserts new posts (runs `parse-halooglasi` and `parse-kupujemprodajem` in parallel). | To (re)collect listings and add new/updated ads. |
| `make parse-halooglasi` | Scrapes halooglasi (psi + macke) only. | When you only want halooglasi data. |
| `make parse-kupujemprodajem` | Scrapes kupujemprodajem listings (list-only: title/city/price/image). | When you want to collect kupujemprodajem ads. |
| `make enrich` | Slowly visits each open kupujemprodajem ad to fill in description + photos. Soft-block safe (skips already-enriched, resumes on re-run). | After `make parse-kupujemprodajem`, when you want full ad details. |
| `make recheck` | Re-visits the URL of every open post (`closed_by = 'not_closed_yet'`) to detect which ads were closed and mark them (`author` vs `platform`). | Periodically after scraping, to keep closure status accurate. Closed ads disappear from listings, so only this pass can catch them. |
| `make sql-overview` | Prints a summary of stored posts. | To inspect the data. |
| `make clean` | Deletes the SQLite database. | To reset everything and start fresh. |

The underlying Node scripts are `parse/halooglasi/parseHaloOglasi.js`, `parse/kupujemprodajem/parseKupujemProdajem.js`
and `parse/recheckHaloOglasiKupujemProdajem.js`. `make recheck` passes no arguments, so to limit it during
development run the script directly:

```bash
# Recheck only halooglasi posts, at most 5 of them, 3s between requests
node parse/recheckHaloOglasiKupujemProdajem.js --source halooglasi-psi --limit 5 --delay 3000
```

Typical workflow: `make init` → `make parse` → `make enrich` → `make recheck` → `make sql-overview`.

## Post lifecycle & closure status

Each post has a `closed_by` column with one of three values:

- `not_closed_yet` — the ad is still open (or its closure hasn't been detected).
- `author` — the ad maker closed it (e.g. sold / deactivated the ad).
- `platform` — the marketplace closed it automatically (e.g. expired).

`date_closed` records when it was closed (`NULL` while `not_closed_yet`). Scraping
only sees listings, so a closed ad simply disappears from results; run
`make recheck` to visit each open post's page and set `closed_by` / `date_closed`.

## Deduplication

Re-running a scraper does not create duplicate rows: posts are keyed by their
marketplace `id`, so a record with the same `id` is updated in place (its
`last_seen` timestamp is refreshed).

```bash
# Inspect the stored posts
sqlite3 data/associationhog.sqlite "SELECT source, COUNT(*) FROM posts GROUP BY source;"
sqlite3 data/associationhog.sqlite "SELECT id, title FROM posts LIMIT 5;"
```
