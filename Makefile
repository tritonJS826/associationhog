.PHONY: init parse parse-halooglasi parse-halooglasi-macke clean

DB = data/associationhog.sqlite

init:
	@echo "Checking node version..."
	@node --version
	@mkdir -p data
	@echo "Initializing database..."
	@node -e "import('./parse/lib/db.js').then(() => console.log('DB ready: $(DB)'))"

parse: parse-halooglasi

parse-halooglasi:
	@node parse/halooglasi.js --url "https://www.halooglasi.com/kucni-ljubimci/psi?poklanjam_b=true"

parse-halooglasi-macke:
	@node parse/halooglasi.js --url "https://www.halooglasi.com/kucni-ljubimci/macke?poklanjam_b=true"

parse-halooglasi-test:
	@node parse/halooglasi.js --url "https://www.halooglasi.com/kucni-ljubimci/psi?poklanjam_b=true" --max-pages 1

clean:
	@rm -f $(DB) $(DB)-wal $(DB)-shm
	@echo "Removed $(DB)"
