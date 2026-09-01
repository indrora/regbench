"""Builds dist/data.json for the regulator-toy app.

The app needs one JSON file: a curated catalog (chip families, each with
adjustable/fixed variants and their known JLCPCB SKUs, plus BOM jelly and
support parts) plus a resistor stock map (which LCSC part number stocks a
given decade value in a given package). The catalog is hand-maintained under
data/ (variant SKU data is refreshed offline via tools/catalog_sync.py, not
at build time); the resistor stock map changes constantly because JLCPCB
inventory changes constantly, so it's fetched live here and never committed.

Stock data comes from CDFER/jlcpcb-parts-database, a community mirror of
the official JLCPCB catalog (itself built from yaqwsx/jlcparts) published
as a CSV of basic + preferred parts on GitHub Pages. See:
https://github.com/CDFER/jlcpcb-parts-database

`updater fetch-db` is a separate command (not part of the `build` step
above): it downloads and reassembles yaqwsx/jlcparts' full component
database snapshot (a split ZIP containing cache.sqlite3, several GB) --
the raw source that tools/catalog_sync.py's --database flag ultimately
wants, though catalog_sync.py expects the further-migrated jlc_components/
lcsc_components schema, not this raw cache.sqlite3 as-is.
"""

import argparse
import csv
import datetime
import io
import json
import struct
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

STOCK_CSV_URL = "https://cdfer.github.io/jlcpcb-parts-database/jlcpcb-components-basic-preferred.csv"

# The app's solver only ever asks for four packages; anything else (arrays,
# odd form factors) isn't useful as a discrete divider resistor.
KNOWN_PACKAGES = {"0402", "0603", "0805", "1206"}

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"

JLCPARTS_BASE_URL = "https://yaqwsx.github.io/jlcparts/data"
CACHE_MEMBER_NAME = "cache.sqlite3"


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
        "families": catalog["families"],
        "jelly": catalog["jelly"],
    }


def _download(url, dest, label, progress_every=50 << 20):
    """Stream a URL to `dest`, printing progress roughly every 50 MB (these
    are multi-GB transfers over several minutes -- silence for that long
    reads as a hang)."""
    print(f"downloading {label} from {url}", file=sys.stderr)
    with urllib.request.urlopen(url) as resp, dest.open("wb") as out:
        total = resp.headers.get("content-length")
        total = int(total) if total else None
        chunk_size = 1 << 20  # 1 MiB
        downloaded = 0
        next_report = progress_every
        while chunk := resp.read(chunk_size):
            out.write(chunk)
            downloaded += len(chunk)
            if downloaded >= next_report:
                pct = f" ({100 * downloaded / total:.0f}%)" if total else ""
                print(f"  {label}: {downloaded / 1e6:.0f} MB{pct}", file=sys.stderr)
                next_report += progress_every
        size_str = f"{downloaded / 1e6:.1f} MB" + (f" of {int(total) / 1e6:.1f} MB" if total else "")
        print(f"  {label}: done, {size_str}", file=sys.stderr)
    if total is not None and downloaded != total:
        raise ValueError(f"incomplete download of {url}: got {downloaded} bytes, expected {total}")


def _split_volume_count(final_part_path):
    """How many `.zNN` volumes precede the final segment (`cache.zip`),
    read from the standard End Of Central Directory record's "number of
    this disk" field. This is a split archive built the classic
    concatenation-splittable way (Info-ZIP `zip -s` convention): disk 0 is
    named `.z01`, disk 1 is `.z02`, ..., and the LAST disk (whatever its
    0-indexed disk number is) is the final segment, named plain `.zip`.
    So "number of this disk" on the final segment's EOCD record, read
    as-is, equals both the 0-indexed number of the last disk AND the count
    of `.zNN`-named volumes that precede it (they're numbered 1..N)."""
    EOCD_SIGNATURE = b"PK\x05\x06"
    with final_part_path.open("rb") as f:
        f.seek(0, 2)
        size = f.tell()
        read_size = min(size, 4096)  # EOCD is 22 bytes + up to a comment field
        f.seek(size - read_size)
        tail = f.read(read_size)
    pos = tail.rfind(EOCD_SIGNATURE)
    if pos == -1:
        raise ValueError(f"{final_part_path}: no End Of Central Directory record found -- not a zip file?")
    disk_no = struct.unpack("<H", tail[pos + 4:pos + 6])[0]
    return disk_no


def _reassemble_split_zip(volume_paths, combined_path):
    """The "surgery": concatenate every volume (in order) into one file,
    then patch the multi-disk bookkeeping so a normal single-file zip
    reader accepts it.

    Byte concatenation alone reconstructs the archive's bytes correctly
    (that's how Info-ZIP-style splitting works), but Python's zipfile
    module unconditionally refuses to open anything whose End Of Central
    Directory record still claims a nonzero disk number ("zipfiles that
    span multiple disks are not supported") -- and because cache.sqlite3
    is multiple GB, this archive also carries ZIP64 records, which have
    their own parallel disk-number/offset fields to fix. Concretely:
      - the classic EOCD record's disk_no/disk_start fields -> 0
      - the ZIP64 locator's disk-with-EOCD field -> 0, and its EOCD offset
        (recorded relative to the start of whichever disk holds it)
        rewritten as an absolute offset into the combined file
      - the ZIP64 EOCD record's own disk_no/disk_start fields -> 0, and
        its central-directory offset likewise rebased to absolute
    Central directory *entries* are left untouched: this archive holds a
    single large file whose local header sits on disk 0 at a tiny offset,
    which is already correct as an absolute offset once disk 0 is
    equivalent to "the start of the combined file" -- true by
    construction, since disk 0 is volume 1 of the concatenation. This was
    verified against a real (already-downloaded) copy of this exact
    archive: the patched file round-trips through zipfile.testzip() with
    zero CRC errors across the full decompressed contents.
    """
    volume_sizes = [p.stat().st_size for p in volume_paths]
    disk_start_offset = [0]
    for sz in volume_sizes[:-1]:
        disk_start_offset.append(disk_start_offset[-1] + sz)

    print(f"concatenating {len(volume_paths)} volumes into {combined_path}", file=sys.stderr)
    with combined_path.open("wb") as out:
        for p in volume_paths:
            with p.open("rb") as part:
                while chunk := part.read(1 << 20):
                    out.write(chunk)

    EOCD, Z64_LOC, Z64_EOCD = b"PK\x05\x06", b"PK\x06\x07", b"PK\x06\x06"
    with combined_path.open("r+b") as f:
        f.seek(0, 2)
        size = f.tell()
        f.seek(max(0, size - 4096))
        tail = f.read()
        tail_base = size - len(tail)

        eocd_rel = tail.rfind(EOCD)
        if eocd_rel == -1:
            raise ValueError(f"{combined_path}: no End Of Central Directory record after concatenation")
        f.seek(tail_base + eocd_rel + 4)
        f.write(struct.pack("<HH", 0, 0))  # disk_no, disk_start

        loc_rel = tail.rfind(Z64_LOC)
        if loc_rel != -1:  # ZIP64 -- large member, always true for cache.sqlite3
            loc_abs = tail_base + loc_rel
            disk_with_eocd, z64_off_rel, _total_disks = struct.unpack("<IQI", tail[loc_rel + 4:loc_rel + 20])
            z64_off_abs = disk_start_offset[disk_with_eocd] + z64_off_rel
            f.seek(loc_abs + 4)
            f.write(struct.pack("<IQI", 0, z64_off_abs, 1))

            f.seek(z64_off_abs)
            z64rec = f.read(56)
            if z64rec[0:4] != Z64_EOCD:
                raise ValueError(f"{combined_path}: ZIP64 EOCD record not found at expected offset {z64_off_abs}")
            z_disk_cd = struct.unpack("<I", z64rec[20:24])[0]
            cd_off_rel = struct.unpack("<Q", z64rec[48:56])[0]
            cd_off_abs = disk_start_offset[z_disk_cd] + cd_off_rel
            f.seek(z64_off_abs + 16)
            f.write(struct.pack("<II", 0, 0))  # disk_no, disk_cd
            f.seek(z64_off_abs + 48)
            f.write(struct.pack("<Q", cd_off_abs))


def fetch_jlcparts_db(out_path, base_url=JLCPARTS_BASE_URL, work_dir=None, keep_parts=False):
    """Downloads and reassembles yaqwsx/jlcparts' split-zip database
    snapshot, extracting cache.sqlite3 to `out_path`. Returns out_path."""
    work_dir = work_dir or out_path.parent
    work_dir.mkdir(parents=True, exist_ok=True)

    final_part = work_dir / "cache.zip"
    _download(f"{base_url}/cache.zip", final_part, "cache.zip (final segment)")

    n_volumes = _split_volume_count(final_part)
    print(f"split archive has {n_volumes} preceding volume(s) (cache.z01..cache.z{n_volumes:02d})", file=sys.stderr)

    volume_paths = []
    for i in range(1, n_volumes + 1):
        name = f"cache.z{i:02d}"
        path = work_dir / name
        try:
            _download(f"{base_url}/{name}", path, name)
        except urllib.error.HTTPError as e:
            raise ValueError(f"failed to fetch volume {name} ({e}) -- the split-volume count from the EOCD record may not match what's actually published") from e
        volume_paths.append(path)
    volume_paths.append(final_part)

    combined_path = work_dir / "cache-combined.zip"
    _reassemble_split_zip(volume_paths, combined_path)

    print(f"extracting {CACHE_MEMBER_NAME}", file=sys.stderr)
    with zipfile.ZipFile(combined_path) as zf:
        bad = zf.testzip()
        if bad is not None:
            raise ValueError(f"CRC check failed for {bad} after reassembly -- a volume may be corrupt or truncated")
        with zf.open(CACHE_MEMBER_NAME) as member, out_path.open("wb") as out:
            while chunk := member.read(1 << 20):
                out.write(chunk)

    combined_path.unlink()
    if not keep_parts:
        for p in volume_paths:
            p.unlink()
    else:
        print(f"kept downloaded volumes in {work_dir}", file=sys.stderr)

    print(f"wrote {out_path} ({out_path.stat().st_size / 1e9:.2f} GB)", file=sys.stderr)
    return out_path


def cmd_build(args):
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


def cmd_fetch_db(args):
    fetch_jlcparts_db(args.out, base_url=args.base_url, work_dir=args.work_dir, keep_parts=args.keep_parts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_build = sub.add_parser("build", help="build dist/data.json from data/catalog.json + live resistor stock")
    p_build.add_argument("-d", "--dist", required=True, type=Path, help="output directory to write data.json into")
    p_build.add_argument("--data-dir", type=Path, default=DATA_DIR, help="directory holding catalog.json and resistor-values.json")
    p_build.set_defaults(func=cmd_build)

    p_fetch = sub.add_parser("fetch-db", help="download + reassemble yaqwsx/jlcparts' cache.sqlite3 snapshot (raw source for tools/catalog_sync.py's upstream data)")
    p_fetch.add_argument("-o", "--out", type=Path, default=REPO_ROOT / CACHE_MEMBER_NAME, help=f"where to write the extracted sqlite3 file (default: ./{CACHE_MEMBER_NAME})")
    p_fetch.add_argument("--base-url", default=JLCPARTS_BASE_URL, help="base URL the split-zip volumes are published under")
    p_fetch.add_argument("--work-dir", type=Path, default=None, help="scratch directory for downloaded volumes (default: alongside --out)")
    p_fetch.add_argument("--keep-parts", action="store_true", help="keep the downloaded .zNN volumes instead of deleting them after extraction")
    p_fetch.set_defaults(func=cmd_fetch_db)

    args = parser.parse_args()
    args.func(args)
