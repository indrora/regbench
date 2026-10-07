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
	# ~1GB) -- the raw source for `build`'s resistor stock (that snapshot
	# has reliable bulk resistor coverage; tools/catalog_sync.py's
	# regulator SKU sync queries JLCPCB's live search API directly
	# instead, since the snapshot has been seen to silently drop
	# real in-stock regulator parts).
	uv run --project updater updater fetch-db

# CI-only: fetchdb (for build's resistor stock) + re-sync data/catalog.json's
# regulator SKUs against live JLCPCB search before building, so each deploy
# reflects current stock instead of whatever was last hand-curated. Too slow
# (multi-GB download) to run on every local `just build`.
ci-build:
	just fetchdb
	python3 tools/catalog_sync.py sync --prune-stale-skus
	just build

gh-deploy: build
	# deploy to github pages
	# TODO...
