"""Package only public reference databases; never user/session/translation data."""
import argparse
from contextlib import closing
import gzip
import hashlib
import json
import sqlite3
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "deploy" / "knowledge"
TABLES = {"gr_catalog.sqlite3": "gr_documents", "pdf_pages.sqlite3": "pages"}


def pack():
    BUNDLE.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, table in TABLES.items():
        source = ROOT / "backend" / "knowledge" / name
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as db:
            schema = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()[0]
            rows = db.execute(f"SELECT * FROM {table}").fetchall()
        # Reconstruct only allowlisted tables, excluding deleted pages and extra tables.
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / name
            with closing(sqlite3.connect(target)) as db, db:
                db.execute(schema)
                if rows:
                    db.executemany(f"INSERT INTO {table} VALUES ({','.join('?' for _ in rows[0])})", rows)
            raw = target.read_bytes()
        compressed = gzip.compress(raw, mtime=0)
        (BUNDLE / (name + ".gz")).write_bytes(compressed)
        manifest[name] = {"sha256": hashlib.sha256(raw).hexdigest(), "rows": len(rows), "bytes": len(raw)}
    (BUNDLE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


def unpack():
    manifest = json.loads((BUNDLE / "manifest.json").read_text(encoding="utf-8"))
    for name in TABLES:
        destination = ROOT / "backend" / "knowledge" / name
        raw = gzip.decompress((BUNDLE / (name + ".gz")).read_bytes())
        if hashlib.sha256(raw).hexdigest() != manifest[name]["sha256"]:
            raise ValueError(f"Invalid knowledge bundle: {name}")
        if destination.exists():
            raise RuntimeError(f"Refusing to overwrite existing knowledge database: {name}")
        destination.write_bytes(raw)
    print("Public farming knowledge restored; no user data imported.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["pack", "unpack"])
    args = parser.parse_args()
    (pack if args.action == "pack" else unpack)()
