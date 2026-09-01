"""Builds dist/data.json for the regulator-toy app.

The app needs one JSON file: a curated catalog (regulators, fixed
alternatives, BOM jelly, support parts) plus a resistor stock map (which
LCSC part number stocks a given decade value in a given package). The
catalog is hand-maintained under data/; the stock map changes constantly
because JLCPCB inventory changes constantly, so it's fetched live and never
committed.

Stock data comes from CDFER/jlcpcb-parts-database, a community mirror of
the official JLCPCB catalog (itself built from yaqwsx/jlcparts) published
as a CSV of basic + preferred parts on GitHub Pages. See:
https://github.com/CDFER/jlcpcb-parts-database
"""

import argparse
import csv
import datetime
import io
import json
import sys
import urllib.request
from pathlib import Path

STOCK_CSV_URL = "https://cdfer.github.io/jlcpcb-parts-database/jlcpcb-components-basic-preferred.csv"

# The app's solver only ever asks for four packages; anything else (arrays,
# odd form factors) isn't useful as a discrete divider resistor.
KNOWN_PACKAGES = {"0402", "0603", "0805", "1206"}

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"


def fetch_resistor_stock(csv_url=STOCK_CSV_URL):
    """Returns {value_label: {package: lcsc_code}} for in-stock 1% chip resistors."""
    with urllib.request.urlopen(csv_url) as resp:
        text = io.TextIOWrapper(resp, encoding="utf-8")
        rows = list(csv.DictReader(text))

    stock = {}
    for row in rows:
        if row.get("category") != "Resistors":
            continue
        if row.get("subcategory") != "Chip Resistor - Surface Mount":
            continue
        package = row.get("package")
        if package not in KNOWN_PACKAGES:
            continue
        attrs = json.loads(row["attributes"] or "{}")
        if attrs.get("Tolerance") != "±1%":
            continue
        value = attrs.get("Resistance")
        if not value:
            continue
        label = value.replace("Ω", "")  # "2.2kΩ" -> "2.2k", matches app.js's parseRVal
        stock.setdefault(label, {})[package] = "C" + row["lcsc"]  # CSV stores the bare LCSC number
    return stock


def build_data(catalog, resistor_values, stock, fetched_on):
    resistors = {value: stock.get(value, {}) for value in resistor_values["values"]}
    missing = sorted(v for v, pkgs in resistors.items() if not pkgs)
    if missing:
        print(f"note: {len(missing)} curated value(s) have no current JLCPCB stock: {', '.join(missing)}", file=sys.stderr)

    meta = dict(catalog["meta"])
    meta["resistorSource"] = f"JLCPCB Basic/Extended stock (jlcparts snapshot via CDFER), fetched {fetched_on}"

    return {
        "meta": meta,
        "resistors": resistors,
        "support": catalog["support"],
        "regulators": catalog["regulators"],
        "fixed": catalog["fixed"],
        "jelly": catalog["jelly"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-d", "--dist", required=True, type=Path, help="output directory to write data.json into")
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR, help="directory holding catalog.json and resistor-values.json")
    args = parser.parse_args()

    catalog = json.loads((args.data_dir / "catalog.json").read_text())
    resistor_values = json.loads((args.data_dir / "resistor-values.json").read_text())

    print(f"fetching JLCPCB resistor stock from {STOCK_CSV_URL}", file=sys.stderr)
    stock = fetch_resistor_stock()

    data = build_data(catalog, resistor_values, stock, datetime.date.today().isoformat())

    args.dist.mkdir(parents=True, exist_ok=True)
    out_path = args.dist / "data.json"
    with out_path.open("w") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {out_path} ({len(data['resistors'])} resistor values, {sum(1 for p in data['resistors'].values() if p)} stocked)", file=sys.stderr)
