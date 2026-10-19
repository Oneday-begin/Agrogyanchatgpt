"""Import page-labelled mahGRs text without executing code from that repository.

Preview: python -m backend.import_maharashtra_grs --repository backend/external/mahGRs
Import: add --apply; use --all-departments to include every checked-out department.
"""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
from datetime import datetime, timezone
from urllib.parse import quote

from backend.pdf_ingestion import overlapping_chunks
from backend.gr_scope import farming_scope

ROOT = Path(__file__).resolve().parent
DEFAULT_CATALOG = ROOT / "knowledge" / "gr_catalog.sqlite3"
REPOSITORY_URL = "https://github.com/orgpedia/mahGRs"
AGRICULTURE = "Agriculture,_Dairy_Development,_Animal_Husbandry_and_Fisheries_Department"


def parse_pages(text):
    sections = re.split(r"(?m)^#\s*Page\s+(\d+)\s*$", text)
    if len(sections) < 3:
        raise ValueError("No '# Page N' markers; cannot establish page citations")
    pages = [(int(sections[i]), sections[i + 1].strip()) for i in range(1, len(sections), 2)]
    numbers = [p for p, _ in pages]
    if numbers != list(range(1, len(pages) + 1)) or any(not text for _, text in pages):
        raise ValueError("Missing, duplicate, out-of-order or empty pages")
    return pages


def extract_subject(first_page, fallback):
    header = re.search(r"(?im)^\s*\|?\s*(?:Government of Maharashtra|The Government of Maharashtra|महाराष्ट्र शासन)\b", first_page)
    subject = first_page[:header.start()] if header else next((line.strip() for line in first_page.splitlines() if line.strip()), fallback)
    return " ".join(line.strip().strip("| ") for line in subject.splitlines()
                    if line.strip() and not re.fullmatch(r"[| :\-]+", line.strip()))[:1000]


def prepare_document(path, repository, commit):
    path = path.resolve()
    if not path.is_relative_to(repository):
        raise ValueError("Source path escapes the repository")
    relative = path.relative_to(repository).as_posix()
    match = re.fullmatch(r"(\d{18,20})\.pdf\.(en|mr)\.txt", path.name)
    if not match:
        raise ValueError("Unsupported GR filename")
    if path.stat().st_size > 5 * 1024 * 1024:
        raise ValueError("GR text exceeds 5 MB")
    identifier, lang = match.groups()
    text = path.read_text(encoding="utf-8-sig")
    pages = parse_pages(text)
    # Subjects often wrap over several lines. Stop before the government header
    # so a department name or incidental body mention cannot approve a subject.
    title = extract_subject(pages[0][1], identifier)
    scope_title = title
    english = path.with_name(identifier + '.pdf.en.txt')
    if lang == 'mr' and english.exists():
        english_text = english.read_text(encoding='utf-8-sig')
        first = re.search(r"(?ms)^#\s*Page\s+1\s*\n(.*?)(?=^#\s*Page\s+\d+\s*$|\Z)", english_text)
        if first and first.group(1).strip():
            scope_title = extract_subject(first.group(1), identifier)
    issued = re.search(r"(?im)^Date\s*:\s*(.+)$", pages[0][1])
    gr_number = re.search(r"(?im)^Government Resolution (?:No|Number)\s*:?\s*(.+)$", pages[0][1])
    identifier_date = datetime.strptime(identifier[:8], "%Y%m%d").date().isoformat()
    source_key = REPOSITORY_URL + "/" + relative
    source_id = hashlib.sha256(source_key.encode()).hexdigest()[:20]
    metadata = {
        "source_id": source_id, "source_key": source_key,
        "source_file": relative, "source_name": path.name, "title": title, "scope_title": scope_title,
        "state": "Maharashtra", "department": path.parent.name.replace("_", " "),
        "language": "English" if lang == "en" else "Marathi", "gr_identifier": identifier,
        "gr_number": gr_number.group(1).strip() if gr_number else None,
        "issued_date_text": issued.group(1).strip() if issued else None,
        "identifier_date": identifier_date,
        "source_url": "https://gr.maharashtra.gov.in/Site/Upload/Government%20Resolutions/English/" + identifier + ".pdf",
        "repository_url": REPOSITORY_URL + "/blob/" + commit + "/" + quote(relative),
        "original_text_url": REPOSITORY_URL + "/blob/" + commit + "/" + quote(relative.replace(".pdf.en.txt", ".pdf.mr.txt")),
        "repository_commit": commit,
        "provenance": "machine_translation" if lang == "en" else "repository_extracted_original",
        "verification": "government_link_recorded_not_independently_verified",
        "imported_at": datetime.now(timezone.utc).isoformat(),
    }
    return source_key, metadata, pages, hashlib.sha256(text.encode()).hexdigest()


def import_repository(repository, catalog=DEFAULT_CATALOG, departments=None, languages=("en",), limit=None, apply=False):
    repository = Path(repository).resolve()
    source = repository / "GRs"
    if not source.is_dir():
        raise ValueError("Expected a local mahGRs checkout containing the GRs directory")
    if limit is not None and limit < 1:
        raise ValueError("Limit must be positive")
    commit = subprocess.run(["git", "-C", str(repository), "rev-parse", "HEAD"],
                            capture_output=True, check=True, text=True).stdout.strip()
    report = {"repository": REPOSITORY_URL, "commit": commit, "apply": apply,
              "matched_files": 0, "documents": 0, "pages": 0, "chunks": 0,
              "created": 0, "updated": 0, "unchanged": 0, "errors": [], "out_of_scope": [], "removed_out_of_scope": 0}
    catalog = Path(catalog)
    db = None
    try:
        if apply:
            catalog.parent.mkdir(parents=True, exist_ok=True)
            db = sqlite3.connect(catalog, timeout=30)
            db.execute("CREATE TABLE IF NOT EXISTS gr_documents (source_key TEXT PRIMARY KEY, metadata TEXT NOT NULL, pages TEXT NOT NULL, content_hash TEXT NOT NULL)")
            db.execute("CREATE INDEX IF NOT EXISTS gr_source_id ON gr_documents(json_extract(metadata, '$.source_id'))")
            # Remove only imported catalog entries that violate the requested
            # farming-only scope. Original repository files remain recoverable.
            for key, metadata in db.execute("SELECT source_key, metadata FROM gr_documents").fetchall():
                meta = json.loads(metadata)
                if not farming_scope(meta.get("scope_title", meta.get("title")))[0]:
                    db.execute("DELETE FROM gr_documents WHERE source_key=?", (key,))
                    report["removed_out_of_scope"] += 1
        for path in sorted(source.rglob("*.txt")):
            if departments is not None and path.parent.name not in departments:
                continue
            if not any(path.name.endswith(f".pdf.{lang}.txt") for lang in languages):
                continue
            report["matched_files"] += 1
            if limit is not None and report["documents"] >= limit:
                continue
            try:
                key, metadata, pages, digest = prepare_document(path, repository, commit)
                allowed, reason = farming_scope(metadata["scope_title"])
                if not allowed:
                    if db is not None:
                        removed = db.execute("DELETE FROM gr_documents WHERE source_key=?", (key,)).rowcount
                        report["removed_out_of_scope"] += removed
                    report["out_of_scope"].append({"file":str(path.relative_to(repository)),"reason":reason})
                    continue
                metadata["scope"] = "agriculture_farming"
                metadata["scope_reason"] = reason
                if db is not None:
                    old = db.execute("SELECT content_hash FROM gr_documents WHERE source_key=?", (key,)).fetchone()
                    report["unchanged" if old and old[0] == digest else "updated" if old else "created"] += 1
                    db.execute("INSERT OR REPLACE INTO gr_documents VALUES (?, ?, ?, ?)",
                               (key, json.dumps(metadata, ensure_ascii=False), json.dumps(pages, ensure_ascii=False), digest))
                report["documents"] += 1
                report["pages"] += len(pages)
                report["chunks"] += sum(sum(1 for _ in overlapping_chunks(text)) for _, text in pages)
            except (ValueError, OSError, UnicodeError) as exc:
                report["errors"].append({"file": str(path.relative_to(repository)), "error": str(exc)})
        if db is not None:
            db.commit()
    finally:
        if db is not None:
            db.close()
    return report


def load_gr_documents(catalog=None):
    catalog = Path(catalog or os.getenv("GR_CATALOG_PATH", str(DEFAULT_CATALOG))).resolve()
    if not catalog.exists():
        return [], {"documents": 0, "pages": 0, "chunks": 0}
    docs, records, page_count = [], 0, 0
    with closing(sqlite3.connect(catalog.as_uri() + "?mode=ro", uri=True)) as db:
        rows = db.execute("SELECT metadata, pages FROM gr_documents ORDER BY source_key").fetchall()
        # Keep both source languages in the catalog, but retrieve a single
        # representative per GR. Prefer English; retain original-only GRs.
        english_ids = {m['gr_identifier'] for raw, _ in rows
                       if (m := json.loads(raw)).get('language') == 'English'}
        originals = {m['gr_identifier']: (m, dict(json.loads(pages))) for raw, pages in rows
                     if (m := json.loads(raw)).get('language') == 'Marathi'
                     and farming_scope(m.get('scope_title', m.get('title')))[0]}
        for metadata, raw_pages in rows:
            meta, pages = json.loads(metadata), json.loads(raw_pages)
            if not farming_scope(meta.get("scope_title", meta.get("title")))[0]:
                continue
            if meta.get('language') != 'English' and meta['gr_identifier'] in english_ids:
                continue
            records += 1
            page_count += len(pages)
            for number, text in pages:
                native = originals.get(meta['gr_identifier']) if meta.get('language') == 'English' else None
                aliases = (native[0]['title'] + '\n' + native[1].get(number, '')) if native else ''
                for chunk, (content, start, end) in enumerate(overlapping_chunks(text), 1):
                    docs.append({**meta, "id": f"gr-{meta['source_id']}-p{number}-c{chunk}",
                                 "doc_type": "repository_gr", "section": f"Page {number}",
                                 "content": content, "page": number, "chunk": chunk,
                                 "retrieval_aliases": aliases,
                                 "char_start": start, "char_end": end,
                                 "source_excerpt_url": f"/knowledge/gr/{meta['source_id']}?page={number}"})
    return docs, {"documents": records, "source_language_records": len(rows), "pages": page_count, "chunks": len(docs)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--department", action="append")
    parser.add_argument("--all-departments", action="store_true")
    parser.add_argument("--languages", nargs="+", choices=["en", "mr"], default=["en"])
    parser.add_argument("--limit", type=int)
    parser.add_argument("--apply", action="store_true", help="Write catalog; without this flag only preview")
    parser.add_argument("--report", type=Path, default=ROOT / "knowledge" / "gr_import_report.json")
    args = parser.parse_args()
    if args.all_departments and args.department:
        parser.error("Choose --department or --all-departments")
    report = import_repository(args.repository, args.catalog,
                               None if args.all_departments else args.department or [AGRICULTURE],
                               args.languages, args.limit, args.apply)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({**{key:value for key,value in report.items() if key not in {"errors","out_of_scope"}},
                      "error_count":len(report["errors"]), "out_of_scope_count":len(report["out_of_scope"]),
                      "report":str(args.report.resolve())}, indent=2))


if __name__ == "__main__":
    main()
