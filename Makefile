.PHONY: init parse parse-halooglasi parse-kupujemprodajem parse-telegram enrich recheck recheck-halooglasi recheck-kupujemprodajem enrich-with-web enrich-with-web-halooglasi enrich-with-web-kupujemprodajem enrich-with-llm sql-overview clean

MAKEFLAGS += -j

DB = data/associationhog.sqlite

HALOOGLASI_PSI_URL = https://www.halooglasi.com/kucni-ljubimci/psi?poklanjam_b=true
HALOOGLASI_MACKE_URL = https://www.halooglasi.com/kucni-ljubimci/macke?poklanjam_b=true
KUPUJEMPRODAJEM_URL = https://www.kupujemprodajem.com/kucni-ljubimci/udomljavanje-zivotinja/grupa/14/1984/1
TELEGRAM_CHANNEL = kuce_beograd
TELEGRAM_TOPIC = 40554

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
	@node parse/halooglasi/parseHaloOglasi.js --url "$(HALOOGLASI_PSI_URL)" --source halooglasi-psi
	@node parse/halooglasi/parseHaloOglasi.js --url "$(HALOOGLASI_MACKE_URL)" --source halooglasi-macke

parse-kupujemprodajem:
	@node parse/kupujemprodajem/parseKupujemProdajem.js --url "$(KUPUJEMPRODAJEM_URL)"

parse-telegram:
	@. ./.env 2>/dev/null; export TELEGRAM_API_ID TELEGRAM_API_HASH; node parse/telegram/parseTelegram.js --channel "$(TELEGRAM_CHANNEL)" --topic "$(TELEGRAM_TOPIC)"

recheck: recheck-halooglasi recheck-kupujemprodajem

recheck-halooglasi:
	@node parse/halooglasi/recheckHaloOglasi.js

recheck-kupujemprodajem:
	@node parse/kupujemprodajem/recheckKupujemProdajem.js

enrich-with-web: enrich-with-web-halooglasi enrich-with-web-kupujemprodajem

enrich-with-web-halooglasi:
	@node parse/halooglasi/enrichHaloOglasiWithWeb.js --source halooglasi-psi
	@node parse/halooglasi/enrichHaloOglasiWithWeb.js --source halooglasi-macke

enrich-with-web-kupujemprodajem:
	@node parse/kupujemprodajem/enrichKupujemProdajemWithWeb.js --source kupujemprodajem

enrich-with-llm:
	@node parse/telegram/enrichTelegramWithLlm.js --channel "$(TELEGRAM_CHANNEL)"
	@node parse/halooglasi/enrichHaloOglasiWithLlm.js --source halooglasi-psi
	@node parse/halooglasi/enrichHaloOglasiWithLlm.js --source halooglasi-macke
	@node parse/kupujemprodajem/enrichKupujemProdajemWithLlm.js --source kupujemprodajem

sql-overview:
	sqlite3 $(DB) < sqliteScripts/overview.sql

clean:
	@rm -f $(DB) $(DB)-wal $(DB)-shm
	@echo "Removed $(DB)"
