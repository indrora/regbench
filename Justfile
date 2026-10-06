_default:
	just --list

test: build
	python3 -m http.server -d dist/  8088

build:
	mkdir -p dist/

	cp -r app/* dist/
	# merge data/catalog.json + data/resistor-values.json with resistor stock
	# read from a local jlcparts snapshot (./db.sqlite3 or ./cache.sqlite3)
	# into dist/data.json -- run `just fetchdb` first if neither exists yet.
	uv run --project updater updater build -d dist/

fetchdb:
	# Fetch + reassemble yaqwsx/jlcparts' cache.sqlite3 snapshot (currently
	# ~1GB) -- the raw source both `build`'s resistor stock and
	# tools/catalog_sync.py's SKU sync ultimately come from.
	uv run --project updater updater fetch-db

# CI-only: fetchdb + re-sync data/catalog.json's SKUs/stock against that
# fresh snapshot before building, so each deploy reflects JLC's current
# stock instead of whatever was last hand-curated. Too slow (multi-GB
# download) to run on every local `just build`.
ci-build:
	just fetchdb
	python3 tools/catalog_sync.py sync --prune-stale-skus
	just build

gh-deploy: build
	# deploy to github pages
	# TODO...
