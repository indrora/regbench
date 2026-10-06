_default:
	just --list

test: build
	python3 -m http.server -d dist/  8088

build:
	mkdir -p dist/

	cp -r app/* dist/
	# fetch live JLCPCB stock and merge it with data/catalog.json + data/resistor-values.json into dist/data.json
	uv run --project updater updater build -d dist/

fetchdb:
	# Fetch + reassemble yaqwsx/jlcparts' cache.sqlite3 snapshot (several GB) --
	# the raw source tools/catalog_sync.py's data ultimately comes from.
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
