.PHONY: init parse parse-halooglasi parse-kupujemprodajem enrich recheck sql-overview clean

MAKEFLAGS += -j

DB = data/associationhog.sqlite

HALOOGLASI_PSI_URL = https://www.halooglasi.com/kucni-ljubimci/psi?poklanjam_b=true
HALOOGLASI_MACKE_URL = https://www.halooglasi.com/kucni-ljubimci/macke?poklanjam_b=true
KUPUJEMPRODAJEM_URL = https://www.kupujemprodajem.com/kucni-ljubimci/udomljavanje-zivotinja/grupa/14/1984/1

init:
	@echo "Checking node version..."
	@node --version
	@echo "Installing dependencies..."
	@npm install
	@mkdir -p data
	@echo "Initializing database..."
	@node -e "import('./parse/lib/db.js').then(() => console.log('DB ready: $(DB)'))"

parse: parse-halooglasi parse-kupujemprodajem

parse-halooglasi:
	@node parse/halooglasi.js --url "$(HALOOGLASI_PSI_URL)" --source halooglasi-psi
	@node parse/halooglasi.js --url "$(HALOOGLASI_MACKE_URL)" --source halooglasi-macke

parse-kupujemprodajem:
	@node parse/kupujemprodajem.js --url "$(KUPUJEMPRODAJEM_URL)"

recheck:
	@node parse/recheck.js

enrich:
	@node parse/enrich.js --source kupujemprodajem

sql-overview:
	sqlite3 $(DB) < sqliteScripts/overview.sql

clean:
	@rm -f $(DB) $(DB)-wal $(DB)-shm
	@echo "Removed $(DB)"
