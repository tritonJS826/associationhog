.PHONY: init parse parse-halooglasi-psi parse-halooglasi-macke parse-kupujemprodajem clean

DB = data/associationhog.sqlite

HALOOGLASI_PSI_URL = https://www.halooglasi.com/kucni-ljubimci/psi?poklanjam_b=true
HALOOGLASI_MACKE_URL = https://www.halooglasi.com/kucni-ljubimci/macke?poklanjam_b=true
KUPUJEMPRODAJEM_URL = https://www.kupujemprodajem.com/kucni-ljubimci/udomljavanje-zivotinja/grupa/14/1984/1

init:
	@echo "Checking node version..."
	@node --version
	@mkdir -p data
	@echo "Initializing database..."
	@node -e "import('./parse/lib/db.js').then(() => console.log('DB ready: $(DB)'))"

parse: parse-halooglasi-psi parse-halooglasi-macke parse-kupujemprodajem

parse-halooglasi-psi:
	@node parse/halooglasi.js --url "$(HALOOGLASI_PSI_URL)" --source halooglasi-psi

parse-halooglasi-macke:
	@node parse/halooglasi.js --url "$(HALOOGLASI_MACKE_URL)" --source halooglasi-macke

parse-kupujemprodajem:
	@node parse/kupujemprodajem.js --url "$(KUPUJEMPRODAJEM_URL)"

clean:
	@rm -f $(DB) $(DB)-wal $(DB)-shm
	@echo "Removed $(DB)"
