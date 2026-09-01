_default:
	just --list

test: build
	python3 -m http.server -d dist/  8088

build:
	[[ -d ./dist ]] || mkdir dist/

	cp -r app/* dist/
	# fetch live JLCPCB stock and merge it with data/catalog.json + data/resistor-values.json into dist/data.json
	uv run --project updater updater -d dist/

gh-deploy: build
	# deploy to github pages
	# TODO...
