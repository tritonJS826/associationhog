.PHONY: init parse parse-halooglasi parse-kupujemprodajem parse-telegram enrich-telegram recheck sql-overview clean

MAKEFLAGS += -j

DB = data/associationhog.sqlite

HALOOGLASI_PSI_URL = https://www.halooglasi.com/kucni-ljubimci/psi?poklanjam_b=true
HALOOGLASI_MACKE_URL = https://www.halooglasi.com/kucni-ljubimci/macke?poklanjam_b=true
KUPUJEMPRODAJEM_URL = https://www.kupujemprodajem.com/kucni-ljubimci/udomljavanje-zivotinja/grupa/14/1984/1
TELEGRAM_CHANNEL = kuce_beograd

init:
	@echo "Checking node version..."
	@node --version
	@echo "Installing dependencies..."
	@npm install
	@mkdir -p data
	@echo "Initializing database..."
	@node -e "import('./parse/lib/db.js').then(() => console.log('DB ready: $(DB)'))"

parse: parse-halooglasi parse-kupujemprodajem parse-telegram

parse-halooglasi:
	@node parse/halooglasi/index.js --url "$(HALOOGLASI_PSI_URL)" --source halooglasi-psi
	@node parse/halooglasi/index.js --url "$(HALOOGLASI_MACKE_URL)" --source halooglasi-macke

parse-kupujemprodajem:
	@node parse/kupujemprodajem/index.js --url "$(KUPUJEMPRODAJEM_URL)"

parse-telegram:
	@. ./.env 2>/dev/null; export TELEGRAM_API_ID TELEGRAM_API_HASH; node parse/telegram/index.js --channel "$(TELEGRAM_CHANNEL)"

enrich-telegram:
	@node parse/telegram/enrich.js --channel "$(TELEGRAM_CHANNEL)"

recheck:
	@node parse/recheck.js

enrich:
	@node parse/kupujemprodajem/enrich.js --source kupujemprodajem

sql-overview:
	sqlite3 $(DB) < sqliteScripts/overview.sql

clean:
	@rm -f $(DB) $(DB)-wal $(DB)-shm
	@echo "Removed $(DB)"
