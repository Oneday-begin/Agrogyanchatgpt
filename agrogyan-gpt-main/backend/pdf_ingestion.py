"""Page-aware PDF ingestion; never cap the number of imported pages/sections."""
import hashlib
import logging
import re
import sqlite3
import os
import subprocess
import tempfile
import shutil
from pathlib import Path

from pypdf import PdfReader

logger = logging.getLogger("agrogyan.ingestion")
ROOT = Path(__file__).resolve().parent
IMPORT_DIR = ROOT / "knowledge_imports"
STATE_MAP = {"GR (guju)": "Gujarat", "GR (punjab)": "Punjab",
             "GR (maharastra)": "Maharashtra", "farming units": "Maharashtra"}
OCR_DATA = ROOT / "ocr" / "tessdata"
PAGE_CACHE = ROOT / "knowledge" / "pdf_pages.sqlite3"


def ocr_page(path, page_number):
    import fitz
    from PIL import Image
    with fitz.open(path) as pdf:
        pixmap = pdf[page_number - 1].get_pixmap(dpi=240, alpha=False)
        image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
        language = "guj+eng" if path.parent.name == "GR (guju)" else "eng"
        with tempfile.TemporaryDirectory(prefix="agrogyan-ocr-") as temp:
            image_path = Path(temp) / "page.png"
            image.save(image_path)
            result = subprocess.run([shutil.which("tesseract") or "tesseract", str(image_path), "stdout",
                                     "--tessdata-dir", str(OCR_DATA), "-l", language, "--psm", "3"],
                                    capture_output=True, timeout=35, check=True)
            return result.stdout.decode("utf-8")


def overlapping_chunks(text: str, size: int = 1400, overlap: int = 200):
    if size <= 0 or overlap < 0 or overlap >= size:
        raise ValueError("Chunk size must be positive with a smaller overlap")
    text = re.sub(r"\s+", " ", text).strip()
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            boundary = text.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary
        yield text[start:end].strip(), start, end
        if end == len(text):
            break
        start = end - overlap


def load_pdf_documents(import_dir: Path = IMPORT_DIR):
    docs, files = [], []
    cache_path = Path(os.getenv("PDF_PAGE_CACHE_PATH", str(PAGE_CACHE)))
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache = sqlite3.connect(cache_path, timeout=60)
    cache.execute("CREATE TABLE IF NOT EXISTS pages (file_hash TEXT, page INTEGER, version TEXT, content TEXT, method TEXT, PRIMARY KEY(file_hash, page, version))")
    for path in sorted(import_dir.rglob("*.pdf")):
        relative = path.relative_to(import_dir).as_posix()
        file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        source_id = hashlib.sha256(relative.encode()).hexdigest()[:20]
        report = {"file": relative, "pages": 0, "chunks": 0, "ocr_pages": [], "unreadable_pages": [], "errors": []}
        try:
            reader = PdfReader(path)
            report["pages"] = len(reader.pages)
            for page_number, page in enumerate(reader.pages, 1):
                cached = cache.execute("SELECT content, method FROM pages WHERE file_hash=? AND page=? AND version='ocr-v1'", (file_hash, page_number)).fetchone()
                try:
                    text, method = cached if cached else (page.extract_text() or "", "text")
                except Exception:
                    report["errors"].append(f"Page {page_number}: text extraction failed")
                    continue
                requires_ocr = len(re.sub(r"\s", "", text)) < 20 or (path.parent.name == "GR (guju)" and not re.search(r"[\u0a80-\u0aff]", text))
                if requires_ocr and not cached:
                    try:
                        text, method = ocr_page(path, page_number), "ocr"
                        logger.info("OCR %s page %d/%d", relative, page_number, report["pages"])
                    except Exception:
                        report["errors"].append(f"Page {page_number}: OCR unavailable or failed")
                if method == "ocr":
                    report["ocr_pages"].append(page_number)
                if not cached and len(re.sub(r"\s", "", text)) >= 20:
                    cache.execute("INSERT OR REPLACE INTO pages VALUES (?, ?, 'ocr-v1', ?, ?)", (file_hash, page_number, text, method))
                    cache.commit()
                if len(re.sub(r"\s", "", text)) < 20:
                    report["unreadable_pages"].append(page_number)
                    continue
                for chunk_number, (content, start, end) in enumerate(overlapping_chunks(text), 1):
                    docs.append({
                        "id": f"pdf-{source_id}-p{page_number}-c{chunk_number}",
                        "doc_type": "pdf", "title": path.stem, "section": f"Page {page_number}",
                        "content": content, "state": STATE_MAP.get(path.parent.name, ""),
                        "source_path": str(path.resolve()), "source_name": path.name,
                        "source_url": "", "source_id": source_id, "source_file": relative,
                        "file_hash": file_hash, "page": page_number, "chunk": chunk_number,
                        "char_start": start, "char_end": end,
                        "extraction_method": method,
                    })
                    report["chunks"] += 1
        except Exception:
            report["errors"].append("PDF could not be opened")
        files.append(report)
    cache.close()
    logger.info("Imported %d PDFs into %d page-aware chunks", len(files), len(docs))
    return docs, {"files": files, "pdf_files": len(files), "pages": sum(f["pages"] for f in files),
                  "pdf_chunks": len(docs), "unreadable_pages": sum(len(f["unreadable_pages"]) for f in files),
                  "ocr_pages": sum(len(f["ocr_pages"]) for f in files),
                  "errors": sum(len(f["errors"]) for f in files)}
