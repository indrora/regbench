#!/usr/bin/env python3
"""Repeatable sync between data/catalog.json's family/variant model and
JLCPCB's parts data.

`sync` (used by `just ci-build`, i.e. on every deploy) matches each known
family's SEARCH_KEYWORDS against JLCPCB's live component-search API
directly -- see live_search_rows. The downloaded jlcparts sqlite snapshot
(`updater fetch-db`, a `jlc_components` table: lcsc, mfr [manufacturer part
number], manufacturer [company name], package, library_type
[base=Basic/expand=Extended], stock, category, subcategory, description;
jlcparts' own "source-db-v2" format) has been observed to silently omit
real, currently in-stock parts, so `sync` no longer depends on it by
default -- pass --offline to fall back to matching against --database
instead (e.g. for testing without network).

`migrate` (one-time, already run) and `discover` do a full-table scan that
only the downloaded snapshot can provide cheaply, so they still require
--database (the raw output of `updater fetch-db` works as-is).

Subcommands:
  migrate   one-time: convert the old regulators[]/fixed[] catalog shape
            into the families{} shape, then run a sync pass to populate
            skus[] for every variant from --database.
  sync      re-run SKU matching for an already-migrated catalog.json against
            live JLCPCB search (or --database with --offline): reports
            added / stale (stock==0) / removed SKUs per variant. Safe to
            re-run anytime.
  discover  scan --database for regulator chip families not yet present in
            the catalog at all, ranked by total stock, and emit draft
            families/variants for review.

Every mode only ever writes `skus`, `bestLcsc`, `bestTier` on existing
variants (plus, for discover, brand-new draft variants) -- hand-authored
engineering fields (referenceVoltage, topResistorRange, notes, etc.) are
never touched by this tool.
"""
import argparse
import json
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = REPO_ROOT / "data" / "catalog.json"

# `updater fetch-db` writes its raw, directly-usable output to ./cache.sqlite3
# by default; some setups instead keep a locally-named/renamed copy at
# ./db.sqlite3. Prefer db.sqlite3 if both happen to exist (it's the more
# specific, deliberately-placed name), otherwise use whichever is present so
# a fresh `just fetchdb` works with zero extra flags.
def _default_database_path():
    db_path, cache_path = REPO_ROOT / "db.sqlite3", REPO_ROOT / "cache.sqlite3"
    if db_path.exists() or not cache_path.exists():
        return db_path
    return cache_path


DEFAULT_DATABASE = _default_database_path()

# Subcategories worth loading at all -- narrows a 7M-row table down to the
# few hundred thousand rows that could plausibly be a voltage regulator,
# before any per-family regex matching happens in Python. Also includes
# rows with no subcategory at all: a growing slice of the live snapshot
# (tens of thousands of rows) carries a blank category/subcategory despite
# being real, in-stock parts -- e.g. XL1509A-5.0E1 -- and would otherwise
# be silently dropped before the per-family regex ever runs. The regex
# match itself is specific enough that pulling in the uncategorized rows
# doesn't introduce false positives.
SUBCATEGORY_FILTER = """
    subcategory LIKE '%Regulator%' OR subcategory LIKE '%LDO%'
    OR subcategory LIKE '%Dropout%' OR subcategory LIKE '%Voltage Reference%'
    OR subcategory LIKE '%DC-DC%' OR subcategory LIKE '%AC-DC%'
    OR subcategory = ''
"""

# ---------------------------------------------------------------------------
# FAMILIES: family_id -> {"name": ..., "variants": [(variant_id, kind, regex)]}
# `regex` matches against jlc_components.mfr (the manufacturer's part number,
# e.g. "AMS1117-ADJ"), case-insensitive. This table is both the sync tool's
# matcher AND (for `migrate`) the seed for family/variant assignment of the
# 48 entries in today's catalog.
# ---------------------------------------------------------------------------
FAMILIES = {
    "lm317": {"name": "LM317 positive adjustable linear", "variants": [
        ("lm317", "adjustable", r"^LM317"),
    ]},
    "lm337": {"name": "LM337 negative adjustable linear", "variants": [
        ("lm337", "adjustable", r"^LM337"),
    ]},
    "ams1117": {"name": "1117-style LDO (AMS1117/LM1117 and clones)", "variants": [
        ("1117adj", "adjustable", r"1117\w*-ADJ"),
        ("ams1117-3.3", "fixed", r"1117\w*-3\.?3\b"),
        ("ams1117-5.0", "fixed", r"1117\w*-5\.?0?\b"),
    ]},
    "xl1509": {"name": "XL1509 buck (and clones)", "variants": [
        ("xl1509", "adjustable", r"X?XL1509\w*-ADJ"),
        ("xl1509-5.0", "fixed", r"X?XL1509\w*-5\.?0?\b"),
        ("xl1509-3.3", "fixed", r"XL1509\w*-3\.?3\b"),
        ("xl1509-12", "fixed", r"XL1509\w*-12"),
    ]},
    "lm2596": {"name": "LM2596 buck", "variants": [
        ("lm2596", "adjustable", r"^LM2596S?X?-ADJ"),
        ("lm2596-5.0", "fixed", r"^LM2596S?X?-5\.?0?\b"),
    ]},
    "lm2576": {"name": "LM2576 buck", "variants": [
        ("lm2576", "adjustable", r"^LM2576S?X?-ADJ"),
        ("lm2576-5.0", "fixed", r"^LM2576S?X?-5\.?0?\b"),
    ]},
    "tps54331": {"name": "TPS54331 buck", "variants": [("tps54331", "adjustable", r"^TPS54331")]},
    "tps5430": {"name": "TPS5430 buck", "variants": [("tps5430", "adjustable", r"^TPS5430(?!\d)")]},
    "mp1584-mp2338": {"name": "MP1584 / MP2338 buck (NRND successor pair)", "variants": [
        ("mp1584", "adjustable", r"^MP1584"),
        ("mp2338", "adjustable", r"^MP2338"),
    ]},
    "tps54560": {"name": "TPS54560 buck", "variants": [("tps54560", "adjustable", r"^TPS54560")]},
    "tps54202": {"name": "TPS54202 buck", "variants": [("tps54202", "adjustable", r"^TPS54202")]},
    "xl4015": {"name": "XL4015 buck", "variants": [("xl4015", "adjustable", r"^XL4015")]},
    "xl7015": {"name": "XL7015 buck", "variants": [("xl7015", "adjustable", r"^XL7015")]},
    "sy8089": {"name": "SY8089 buck", "variants": [("sy8089", "adjustable", r"^SY8089")]},
    "sy8113": {"name": "SY8113 buck", "variants": [("sy8113", "adjustable", r"^SY8113")]},
    "mp2315": {"name": "MP2315 buck", "variants": [("mp2315", "adjustable", r"^MP2315")]},
    "mp2307": {"name": "MP2307 buck", "variants": [("mp2307", "adjustable", r"^MP2307")]},
    "mp1482": {"name": "MP1482 buck", "variants": [("mp1482", "adjustable", r"^MP1482")]},
    "mp2451": {"name": "MP2451 buck", "variants": [("mp2451", "adjustable", r"^MP2451")]},
    "mp2359": {"name": "MP2359 buck", "variants": [("mp2359", "adjustable", r"^MP2359")]},
    "tps562200": {"name": "TPS562208 buck", "variants": [("tps562200", "adjustable", r"^TPS562208")]},
    "mc34063": {"name": "MC34063 buck/boost/inverter (and clones)", "variants": [
        ("mc34063", "adjustable", r"^(MC34063|AZ34063)"),
    ]},
    "mt3608": {"name": "MT3608 boost", "variants": [("mt3608", "adjustable", r"^MT3608")]},
    "tps6200x": {"name": "TPS6200x buck family (adjustable + fixed siblings)", "variants": [
        ("tps62000", "adjustable", r"^TPS62000(?!\d)"),
        ("tps62001", "fixed", r"^TPS62001(?!\d)"),
        ("tps62002", "fixed", r"^TPS62002(?!\d)"),
        ("tps62003", "fixed", r"^TPS62003(?!\d)"),
        ("tps62004", "fixed", r"^TPS62004(?!\d)"),
        ("tps62005", "fixed", r"^TPS62005(?!\d)"),
        ("tps62006", "fixed", r"^TPS62006(?!\d)"),
        ("tps62007", "fixed", r"^TPS62007(?!\d)"),
        ("tps62008", "fixed", r"^TPS62008(?!\d)"),
    ]},
    "tps61040": {"name": "TPS61040 boost", "variants": [("tps61040", "adjustable", r"^TPS61040")]},
    "tl431": {"name": "TL431 / CJ431 shunt reference", "variants": [
        ("tl431", "adjustable", r"^(TL431|CJ431)"),
    ]},
    "xc6206": {"name": "XC6206 LDO", "variants": [("xc6206p332", "fixed", r"^XC6206P332")]},
    "ht7500": {"name": "HT7500-series low-Iq LDO", "variants": [
        ("ht7533-1", "fixed", r"^HT7533"),
        ("ht7550-1", "fixed", r"^HT7550"),
    ]},
    "78xx": {"name": "78xx-style fixed linear regulator", "variants": [
        ("l78m05", "fixed", r"^L78M05"),
        ("78l05", "fixed", r"^78L05"),
        ("78l12", "fixed", r"^78L12"),
    ]},
}

# variant_id -> keyword(s) to query JLCPCB's live component search with (see
# live_search_rows). Hand-picked per variant rather than derived from the
# regex above -- some patterns use alternation (mc34063, tl431) or optional
# leading groups (xl1509's "X?") that don't reduce to a single literal
# substring. These only need to be broad enough to surface candidates; the
# FAMILIES regex above still does the precise match/reject afterward, so
# over-matching here is harmless.
SEARCH_KEYWORDS = {
    "lm317": ("LM317",),
    "lm337": ("LM337",),
    "1117adj": ("1117",),
    "ams1117-3.3": ("1117",),
    "ams1117-5.0": ("1117",),
    "xl1509": ("XL1509",),
    "xl1509-5.0": ("XL1509",),
    "xl1509-3.3": ("XL1509",),
    "xl1509-12": ("XL1509",),
    "lm2596": ("LM2596",),
    "lm2596-5.0": ("LM2596",),
    "lm2576": ("LM2576",),
    "lm2576-5.0": ("LM2576",),
    "tps54331": ("TPS54331",),
    "tps5430": ("TPS5430",),
    "mp1584": ("MP1584",),
    "mp2338": ("MP2338",),
    "tps54560": ("TPS54560",),
    "tps54202": ("TPS54202",),
    "xl4015": ("XL4015",),
    "xl7015": ("XL7015",),
    "sy8089": ("SY8089",),
    "sy8113": ("SY8113",),
    "mp2315": ("MP2315",),
    "mp2307": ("MP2307",),
    "mp1482": ("MP1482",),
    "mp2451": ("MP2451",),
    "mp2359": ("MP2359",),
    "tps562200": ("TPS562208",),
    "mc34063": ("MC34063", "AZ34063"),
    "mt3608": ("MT3608",),
    "tps62000": ("TPS62000",),
    "tps62001": ("TPS62001",),
    "tps62002": ("TPS62002",),
    "tps62003": ("TPS62003",),
    "tps62004": ("TPS62004",),
    "tps62005": ("TPS62005",),
    "tps62006": ("TPS62006",),
    "tps62007": ("TPS62007",),
    "tps62008": ("TPS62008",),
    "tps61040": ("TPS61040",),
    "tl431": ("TL431", "CJ431"),
    "xc6206p332": ("XC6206",),
    "ht7533-1": ("HT7533",),
    "ht7550-1": ("HT7550",),
    "l78m05": ("L78M05",),
    "78l05": ("78L05",),
    "78l12": ("78L12",),
}

# Old catalog "n" (fixed[]) values -> new variant id. Regulator variant ids
# are unchanged from their old "id" field (lm317, xl1509, tps62000, ...).
OLD_FIXED_NAME_TO_VARIANT = {
    "AMS1117-3.3": "ams1117-3.3",
    "AMS1117-5.0": "ams1117-5.0",
    "XC6206P332": "xc6206p332",
    "HT7533-1": "ht7533-1",
    "HT7550-1": "ht7550-1",
    "L78M05": "l78m05",
    "78L05": "78l05",
    "78L12": "78l12",
    "LM2596SX-5.0": "lm2596-5.0",
    "LM2576SX-5.0": "lm2576-5.0",
    "XL1509-5.0": "xl1509-5.0",
    "XL1509-3.3 (UMW)": "xl1509-3.3",
    "XL1509-12E1": "xl1509-12",
    "TPS62001": "tps62001",
    "TPS62002": "tps62002",
    "TPS62003": "tps62003",
    "TPS62004": "tps62004",
    "TPS62005": "tps62005",
    "TPS62008": "tps62008",
    "TPS62006": "tps62006",
    "TPS62007": "tps62007",
}

REG_FIELD_RENAME = {
    "mfr": "manufacturerNote",
    "topo": "topology",
    "pkgNote": "packageNote",
    "vref": "referenceVoltage",
    "vrefTol": "referenceVoltageTolerancePct",
    "iadjTyp": "adjustCurrentTypical",
    "iadjMax": "adjustCurrentMax",
    "raName": "topResistorName",
    "raPath": "topResistorPath",
    "rbName": "bottomResistorName",
    "rbPath": "bottomResistorPath",
    "rbRange": "bottomResistorRange",
    "rbHint": "bottomResistorHint",
    "hasIadj": "hasSignificantAdjustCurrent",
    "minV": "vOutMin",
    "fsw": "switchingFreqHz",
    "fswNote": "switchingFreqNote",
    "diode": "hasCatchDiode",
    "boost": "isBoost",
    "shunt": "isShunt",
    "negative": "isNegative",
    "support": "supportComponents",
}
# fields dropped outright during migration (superseded by skus[]/family
# grouping, or no longer meaningful). NOTE: "id" is re-added explicitly by
# migrate_regulator() below -- don't add "name" here, every consumer
# (part-picker rows, detail headers, sibling links) reads it.
REG_FIELD_DROP = {"id", "lcsc", "tier", "variants"}

FIXED_FIELD_RENAME = {
    "v": "vOutFixed",
    "n": "name",
    "d": "description",
    "i": "iOutMax",
    "pd": "powerDissipationMax",
    "vim": "vInMax",
}
FIXED_FIELD_DROP = {"c", "tier"}
CONVERTER_TYPE = {"lin": "linear", "buck": "buck"}

SUPPORT_ITEM_RENAME = {"d": "description"}  # "role"/"c"/"note" unchanged


def load_catalog(path):
    return json.loads(path.read_text())


def load_regulator_rows(db_path):
    """Every row from the sqlite snapshot in a plausibly-regulator subcategory."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.execute(f"""
        SELECT lcsc, mfr, manufacturer, package, library_type, stock, description, subcategory
        FROM jlc_components
        WHERE {SUBCATEGORY_FILTER}
    """)
    rows = cur.fetchall()
    conn.close()
    return rows


# ---------------------------------------------------------------------------
# Live JLCPCB search (sync's default row source -- see SEARCH_KEYWORDS above)
#
# The downloaded jlcparts snapshot (load_regulator_rows, still used by
# migrate/discover) has been observed to silently omit real, currently
# in-stock parts -- e.g. TPS5430DDAR/C9864 (334k+ in stock on JLCPCB's own
# site) is simply absent from a freshly-fetched snapshot. `sync` only ever
# needs a handful of known keywords per run, so it queries JLCPCB's public
# component-search API directly instead -- the same endpoint jlcpcb.com's
# own search box calls, no API key required.
# ---------------------------------------------------------------------------
LIVE_SEARCH_URL = "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList"
LIVE_SEARCH_PAGE_SIZE = 50
LIVE_SEARCH_DELAY_S = 0.3
LIVE_SEARCH_RETRIES = 3


def _live_search_page(keyword, page):
    body = json.dumps({
        "keyword": keyword, "currentPage": page, "pageSize": LIVE_SEARCH_PAGE_SIZE, "searchSource": "search",
    }).encode()
    req = urllib.request.Request(LIVE_SEARCH_URL, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://jlcpcb.com",
        "Referer": "https://jlcpcb.com/parts",
        "User-Agent": "Mozilla/5.0 (compatible; regbench-catalog-sync/1.0; +https://github.com/indrora/regbench)",
    })
    last_err = None
    for attempt in range(LIVE_SEARCH_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.load(resp)
        # the WAF in front of this endpoint resets the connection outright
        # (not a clean HTTP error) if hit too fast -- OSError covers that
        # alongside URLError/TimeoutError.
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
            time.sleep(LIVE_SEARCH_DELAY_S * (attempt + 1))
    raise RuntimeError(f"JLCPCB live search failed for keyword {keyword!r} after {LIVE_SEARCH_RETRIES} attempts: {last_err}")


def live_search_rows(keyword):
    """All pages of JLCPCB's live component search for `keyword`, shaped
    like jlc_components rows (same field names sku_from_row/
    match_variant_skus already expect, via plain dict access)."""
    rows, page = [], 1
    while True:
        data = _live_search_page(keyword, page)
        info = data["data"]["componentPageInfo"]
        page_list = info.get("list") or []  # a no-results page comes back as list: null, not []
        for c in page_list:
            rows.append({
                "lcsc": int(c["componentCode"].lstrip("C")),
                "mfr": c.get("componentModelEn"),
                "manufacturer": c.get("componentBrandEn"),
                "package": c.get("componentSpecificationEn"),
                "library_type": c.get("componentLibraryType"),
                "stock": c.get("stockCount") or 0,
            })
        if not page_list or page * LIVE_SEARCH_PAGE_SIZE >= (info.get("total") or 0):
            break
        page += 1
        time.sleep(LIVE_SEARCH_DELAY_S)
    return rows


def static_row_source(rows):
    """row_source for migrate/discover: every variant matches against the
    same pre-loaded snapshot rows, as before."""
    return lambda variant_id, pattern: rows


def live_row_source():
    """row_source for sync: queries JLCPCB live search per variant's
    SEARCH_KEYWORDS, caching by keyword so variants sharing a root part
    number (e.g. ams1117's three variants, all "1117") only fetch once."""
    cache = {}

    def _source(variant_id, pattern):
        keywords = SEARCH_KEYWORDS.get(variant_id)
        if not keywords:
            raise KeyError(f"no SEARCH_KEYWORDS entry for variant '{variant_id}' -- required for live sync")
        rows = []
        for kw in keywords:
            if kw not in cache:
                print(f"  live search: {kw!r}", file=sys.stderr)
                cache[kw] = live_search_rows(kw)
            rows.extend(cache[kw])
        return rows

    return _source


def sku_from_row(row):
    return {
        "lcsc": "C" + str(row["lcsc"]),
        "partNumber": row["mfr"],
        "package": row["package"],
        "manufacturer": row["manufacturer"],
        "tier": "Basic" if row["library_type"] == "base" else "Extended",
        "stock": row["stock"],
    }


def rank_skus(skus, limit=15):
    skus = sorted(skus, key=lambda s: (s["tier"] != "Basic", -s["stock"]))
    return skus[:limit], len(skus) > limit


def match_variant_skus(rows, pattern):
    rx = re.compile(pattern, re.IGNORECASE)
    return [sku_from_row(r) for r in rows if r["mfr"] and rx.search(r["mfr"])]


# ---------------------------------------------------------------------------
# migrate
# ---------------------------------------------------------------------------
def rename_fields(obj, rename_map, drop_set):
    out = {}
    for k, v in obj.items():
        if k in drop_set:
            continue
        out[rename_map.get(k, k)] = v
    return out


def migrate_regulator(entry):
    variant = rename_fields(entry, REG_FIELD_RENAME, REG_FIELD_DROP)
    variant["id"] = entry["id"]
    variant["kind"] = "adjustable"
    if "supportComponents" in variant:
        variant["supportComponents"] = [
            rename_fields(item, SUPPORT_ITEM_RENAME, set()) for item in variant["supportComponents"]
        ]
    # best-effort vOutMax scrape from the free-text `limits` field, e.g.
    # "Vout 0.76-7 V" / "Vout 0.5-16 V" -- present on a handful of entries.
    m = re.search(r"Vout[^\d]*([\d.]+)\s*[–-]\s*([\d.]+)\s*V", entry.get("limits", ""))
    if m:
        variant["vOutMax"] = float(m.group(2))
    return variant


def migrate_fixed(entry):
    variant = rename_fields(entry, FIXED_FIELD_RENAME, FIXED_FIELD_DROP)
    variant["id"] = OLD_FIXED_NAME_TO_VARIANT[entry["n"]]
    variant["kind"] = "fixed"
    if "converterType" not in variant and "t" in entry:
        pass
    if "t" in entry:
        variant["converterType"] = CONVERTER_TYPE.get(entry["t"], entry["t"])
        del variant["t"]
    return variant


def build_families_skeleton(catalog):
    """Old regulators[]/fixed[] -> families{} skeleton (hand-authored fields
    only; skus/bestLcsc/bestTier get filled in by sync_families)."""
    variant_by_id = {}
    for entry in catalog["regulators"]:
        variant_by_id[entry["id"]] = migrate_regulator(entry)
    for entry in catalog["fixed"]:
        variant_by_id[OLD_FIXED_NAME_TO_VARIANT[entry["n"]]] = migrate_fixed(entry)

    families = {}
    for fam_id, fam in FAMILIES.items():
        variants = []
        for variant_id, kind, _pattern in fam["variants"]:
            v = variant_by_id.pop(variant_id, None)
            if v is None:
                print(f"warning: no catalog entry for variant '{variant_id}' in family '{fam_id}'", file=sys.stderr)
                continue
            assert v["kind"] == kind, f"{variant_id}: expected kind={kind}, got {v['kind']}"
            variants.append(v)
        families[fam_id] = {"name": fam["name"], "variants": variants}

    if variant_by_id:
        print(f"warning: {len(variant_by_id)} catalog entries not covered by FAMILIES: {sorted(variant_by_id)}", file=sys.stderr)

    return families


# ---------------------------------------------------------------------------
# sync
# ---------------------------------------------------------------------------
def sync_families(families, row_source, prune_stale=False):
    """Mutates `families` in place: recomputes skus/bestLcsc/bestTier for
    every variant against row_source(variant_id, pattern) (see
    static_row_source/live_row_source). Returns a report list of
    (family_id, variant_id, added, stale, truncated)."""
    report = []
    for fam_id, fam in FAMILIES.items():
        target = families.get(fam_id)
        if not target:
            continue
        variants_by_id = {v["id"]: v for v in target["variants"]}
        for variant_id, _kind, pattern in fam["variants"]:
            variant = variants_by_id.get(variant_id)
            if variant is None:
                continue
            matched = match_variant_skus(row_source(variant_id, pattern), pattern)
            matched_codes = {s["lcsc"] for s in matched}
            current = variant.get("skus", [])
            current_codes = {s["lcsc"] for s in current}

            # "stale" = currently-listed codes that no longer match, or whose
            # matched stock is now zero -- computed against the full match
            # set, independent of the top-15 display truncation.
            stale = {s["lcsc"] for s in current if s["lcsc"] not in matched_codes or _stock_of(matched, s["lcsc"]) == 0}

            if prune_stale:
                kept = [s for s in matched if s["stock"] > 0]
            else:
                # keep existing entries even if now stale (just flagged), add new ones
                kept_map = {s["lcsc"]: s for s in current}
                kept_map.update({s["lcsc"]: s for s in matched})
                kept = list(kept_map.values())

            ranked, truncated = rank_skus(kept)
            # "added" is measured against what actually lands in the
            # persisted (possibly truncated) list, not the raw match set --
            # otherwise every re-run of a truncated family reports its
            # off-list matches as "new" even though nothing changed.
            added = {s["lcsc"] for s in ranked} - current_codes

            variant["skus"] = ranked
            variant["bestLcsc"] = ranked[0]["lcsc"] if ranked else None
            variant["bestTier"] = ranked[0]["tier"] if ranked else None
            report.append((fam_id, variant_id, len(added), len(stale), truncated))
    return report


def _stock_of(skus, lcsc):
    for s in skus:
        if s["lcsc"] == lcsc:
            return s["stock"]
    return 0


def print_report(report):
    print(f"{'family':<16} {'variant':<16} {'+added':>7} {'stale':>7} {'note'}")
    for fam_id, variant_id, added, stale, truncated in report:
        note = "truncated to top 15" if truncated else ""
        print(f"{fam_id:<16} {variant_id:<16} {added:>7} {stale:>7} {note}")


# ---------------------------------------------------------------------------
# discover
# ---------------------------------------------------------------------------
SUFFIX_STRIP_RE = re.compile(
    r"[-/](ADJ|FIXED|\d+\.?\d*V?|[A-Z]\d?)(/[A-Z0-9]+)?$", re.IGNORECASE
)


def base_name(part_number):
    """Best-effort strip of the trailing voltage/mode suffix to find a
    'family base' for clustering, e.g. AMS1117-3.3 / AMS1117-ADJ -> AMS1117.
    Heuristic -- discover output is meant to be reviewed, not trusted blind."""
    name = part_number
    for _ in range(3):  # strip a couple of chained suffixes (e.g. "-5.0/NOPB")
        new = SUFFIX_STRIP_RE.sub("", name)
        if new == name:
            break
        name = new
    return name.rstrip("-_")


def already_known(mfr):
    for fam in FAMILIES.values():
        for _vid, _kind, pattern in fam["variants"]:
            if re.search(pattern, mfr, re.IGNORECASE):
                return True
    return False


def discover(rows, top_n=15, min_variants=2):
    clusters = {}  # base -> list of rows
    for row in rows:
        mfr = row["mfr"]
        if not mfr or already_known(mfr):
            continue
        base = base_name(mfr)
        if not base or len(base) < 3:
            continue
        clusters.setdefault(base.upper(), []).append(row)

    ranked = []
    for base, member_rows in clusters.items():
        distinct_variants = {r["mfr"] for r in member_rows}
        if len(distinct_variants) < min_variants:
            continue
        total_stock = sum(r["stock"] for r in member_rows)
        ranked.append((base, total_stock, member_rows))
    ranked.sort(key=lambda t: -t[1])
    return ranked[:top_n]


ADJ_KEYWORD_RE = re.compile(r"\bAdjustable\b", re.IGNORECASE)
VOUT_RANGE_RE = re.compile(r"([\d.]+)V\s*[~-]\s*([\d.]+)V")
VOUT_FIXED_RE = re.compile(r"\b([\d.]+)V\b(?!\s*[~-])")
CURRENT_RE = re.compile(r"([\d.]+)\s*A\b")
VIN_MAX_RE = re.compile(r"\b([\d.]+)V\b")


def draft_variant_from_cluster_row(row, variant_id):
    desc = row["description"] or ""
    is_adjustable = bool(ADJ_KEYWORD_RE.search(desc))
    variant = {
        "id": variant_id,
        "kind": "adjustable" if is_adjustable else "fixed",
        "name": row["mfr"],
        "packageNote": row["package"],
        # solver.js's topoTag()/adjustableFits() key off this free-text
        "topology": row["subcategory"] or "",
        "discovered": True,
        # Every discovered variant is unreviewed: the voltage/current fields
        # below are scraped from free-text JLCPCB descriptions with simple
        # regexes (e.g. dropout-voltage figures can get mistaken for Vout),
        # not verified against a datasheet. The UI must not present these as
        # trustworthy solver inputs until a human confirms them.
        "needsReview": True,
        "notes": [
            "Auto-discovered from db.sqlite3 description text -- fields "
            "below are a best-effort text scrape, not datasheet-verified. "
            "Confirm against the manufacturer's datasheet before use."
        ],
    }
    if is_adjustable:
        m = VOUT_RANGE_RE.search(desc)
        if m:
            variant["vOutMin"] = float(m.group(1))
            variant["vOutMax"] = float(m.group(2))
    else:
        m = VOUT_FIXED_RE.search(desc)
        if m:
            variant["vOutFixed"] = float(m.group(1))
    m = CURRENT_RE.search(desc)
    if m:
        variant["iOutMax"] = float(m.group(1))
    return variant


def build_discovery_families(clusters):
    families = {}
    for base, _stock, member_rows in clusters:
        fam_id = "disc-" + re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
        by_mfr = {}
        for row in member_rows:
            by_mfr.setdefault(row["mfr"], []).append(row)
        variants = []
        for i, (mfr, rows_for_mfr) in enumerate(sorted(by_mfr.items())):
            variant_id = f"{fam_id}-{i}"
            variant = draft_variant_from_cluster_row(rows_for_mfr[0], variant_id)
            ranked, truncated = rank_skus([sku_from_row(r) for r in rows_for_mfr])
            variant["skus"] = ranked
            variant["bestLcsc"] = ranked[0]["lcsc"] if ranked else None
            variant["bestTier"] = ranked[0]["tier"] if ranked else None
            variants.append(variant)
        families[fam_id] = {"name": f"{base} (auto-discovered, needs review)", "variants": variants, "discovered": True}
    return families


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=["migrate", "sync", "discover"])
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="path to data/catalog.json")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE, help="path to the sqlite JLCPCB snapshot (the raw output of `updater fetch-db` works as-is; defaults to ./db.sqlite3 or ./cache.sqlite3, whichever exists)")
    parser.add_argument("--dry-run", action="store_true", help="print the report but don't write catalog.json")
    parser.add_argument("--prune-stale-skus", action="store_true", help="(sync) drop skus with stock==0 or no longer matching, instead of just flagging them")
    parser.add_argument("--offline", action="store_true", help="(sync) match against the downloaded --database snapshot instead of live JLCPCB search")
    parser.add_argument("--top", type=int, default=15, help="(discover) how many new families to surface")
    parser.add_argument("--min-variants", type=int, default=2, help="(discover) minimum distinct part numbers to count as a family")
    args = parser.parse_args()

    # sync's default row source is live JLCPCB search (see SEARCH_KEYWORDS) --
    # no local snapshot needed unless --offline is passed. migrate/discover
    # still do a full-table scan, which only the snapshot can provide.
    needs_database = args.mode in ("migrate", "discover") or (args.mode == "sync" and args.offline)
    if needs_database:
        if not args.database.exists():
            sys.exit(f"database not found: {args.database} -- run `just fetchdb` (or `updater fetch-db`) first, or pass --database explicitly")
        rows = load_regulator_rows(args.database)
        print(f"loaded {len(rows)} candidate rows from {args.database}", file=sys.stderr)

    if args.mode == "migrate":
        catalog = load_catalog(args.catalog)
        if "families" in catalog:
            sys.exit("catalog.json already has a 'families' key -- already migrated; use 'sync' instead")
        families = build_families_skeleton(catalog)
        report = sync_families(families, static_row_source(rows), prune_stale=False)
        print_report(report)
        new_catalog = {"meta": catalog["meta"], "families": families, "jelly": catalog["jelly"], "support": catalog["support"]}
        if not args.dry_run:
            args.catalog.write_text(json.dumps(new_catalog, indent=1, ensure_ascii=False) + "\n")
            print(f"wrote {args.catalog}", file=sys.stderr)

    elif args.mode == "sync":
        catalog = load_catalog(args.catalog)
        if "families" not in catalog:
            sys.exit("catalog.json has no 'families' key -- run 'migrate' first")
        row_source = static_row_source(rows) if args.offline else live_row_source()
        report = sync_families(catalog["families"], row_source, prune_stale=args.prune_stale_skus)
        print_report(report)
        if not args.dry_run:
            args.catalog.write_text(json.dumps(catalog, indent=1, ensure_ascii=False) + "\n")
            print(f"wrote {args.catalog}", file=sys.stderr)

    elif args.mode == "discover":
        catalog = load_catalog(args.catalog)
        clusters = discover(rows, top_n=args.top, min_variants=args.min_variants)
        print(f"{'base':<20} {'#variants':>10} {'total stock':>12}")
        for base, stock, member_rows in clusters:
            print(f"{base:<20} {len({r['mfr'] for r in member_rows}):>10} {stock:>12}")
        new_families = build_discovery_families(clusters)
        if not args.dry_run:
            catalog = load_catalog(args.catalog)
            catalog.setdefault("families", {}).update(new_families)
            args.catalog.write_text(json.dumps(catalog, indent=1, ensure_ascii=False) + "\n")
            print(f"wrote {len(new_families)} draft families to {args.catalog}", file=sys.stderr)


if __name__ == "__main__":
    main()
