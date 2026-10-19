from __future__ import annotations

import csv
import json
import html
import re
from pathlib import Path
from typing import Iterable

from bs4 import BeautifulSoup


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CSV_PATH = BASE_DIR / "backend" / "uploads" / "data.csv"
DEFAULT_KNOWLEDGE_DIR = BASE_DIR / "backend" / "knowledge" / "states"


def normalize_text(text: str) -> str:
    cleaned = html.unescape(str(text or ""))
    cleaned = cleaned.replace("\xa0", " ")
    cleaned = re.sub(r"\s+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def chunk_text(text: str, max_chars: int = 1500) -> Iterable[str]:
    text = normalize_text(text)
    if not text:
        return []

    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if len(paragraph) <= max_chars:
            current = paragraph
            continue

        sentences = re.split(r"(?<=[.!?])\s+", paragraph)
        current = ""
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            candidate = f"{current} {sentence}".strip() if current else sentence
            if len(candidate) <= max_chars:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = sentence
        if current:
            chunks.append(current)
            current = ""
    if current:
        chunks.append(current)
    return chunks


def load_csv_documents(csv_path: Path) -> list[dict]:
    if not csv_path.exists():
        return []

    qa_pairs: list[dict] = []
    with csv_path.open(newline="", encoding="utf-8") as file_handle:
        reader = csv.DictReader(file_handle)
        reader.fieldnames = [header.strip().lower() for header in reader.fieldnames or []]
        for index, row in enumerate(reader, start=1):
            question = normalize_text(row.get("question", ""))
            answer = normalize_text(row.get("answer", ""))
            if not question or not answer:
                continue
            qa_pairs.append(
                {
                    "id": f"csv-{index}",
                    "doc_type": "legacy_qa",
                    "title": "Legacy verified Q&A",
                    "section": question[:120],
                    "question": question,
                    "answer": answer,
                    "content": answer,
                    "state": row.get("state", "") or "",
                    "source_path": str(csv_path),
                    "source_name": csv_path.name,
                    "source_url": "",
                }
            )
    return qa_pairs


def extract_html_sections(html_path: Path) -> list[dict]:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    page_title = normalize_text(soup.title.text if soup.title else html_path.stem)
    state = normalize_text((soup.find("meta", attrs={"name": "state"}) or {}).get("content", ""))
    source_url = normalize_text((soup.find("meta", attrs={"name": "source_url"}) or {}).get("content", ""))

    sections: list[dict] = []
    for index, section in enumerate(soup.find_all("section"), start=1):
        heading_node = section.find(["h2", "h3", "h4"])
        heading = normalize_text(heading_node.get_text(" ", strip=True) if heading_node else f"Section {index}")
        body_parts = [normalize_text(node.get_text(" ", strip=True)) for node in section.find_all(["p", "li"])]
        body = "\n\n".join(part for part in body_parts if part)
        if not body:
            continue
        for chunk_index, chunk in enumerate(chunk_text(body), start=1):
            sections.append(
                {
                    "id": f"{slugify(html_path.stem)}-{index}-{chunk_index}",
                    "doc_type": "state_knowledge",
                    "title": page_title,
                    "section": heading,
                    "question": "",
                    "answer": "",
                    "content": chunk,
                    "state": state,
                    "source_path": str(html_path),
                    "source_name": html_path.name,
                    "source_url": source_url,
                }
            )

    if sections:
        return sections

    fallback_text = normalize_text(soup.get_text("\n", strip=True))
    return [
        {
            "id": f"{slugify(html_path.stem)}-full-{index}",
            "doc_type": "state_knowledge",
            "title": page_title,
            "section": "Overview",
            "question": "",
            "answer": "",
            "content": chunk,
            "state": state,
            "source_path": str(html_path),
            "source_name": html_path.name,
            "source_url": source_url,
        }
        for index, chunk in enumerate(chunk_text(fallback_text), start=1)
    ]


def load_html_documents(knowledge_dir: Path) -> list[dict]:
    if not knowledge_dir.exists():
        return []

    documents: list[dict] = []
    for html_path in sorted(knowledge_dir.glob("*.html")):
        documents.extend(extract_html_sections(html_path))
    return documents


def load_documents(csv_path: str | Path = DEFAULT_CSV_PATH, knowledge_dir: str | Path = DEFAULT_KNOWLEDGE_DIR) -> list[dict]:
    csv_documents = load_csv_documents(Path(csv_path))
    html_documents = load_html_documents(Path(knowledge_dir))
    documents = html_documents + csv_documents
    print(f"Loaded {len(documents)} knowledge documents ({len(html_documents)} HTML chunks, {len(csv_documents)} legacy Q&A rows)")
    return documents


def load_farming_references(path=None):
    """Small reviewed Q&A entries with source URLs; indexed alongside GR pages."""
    path = Path(path) if path else BASE_DIR / "backend" / "knowledge" / "farming_reference.json"
    if not path.exists():
        return []
    records = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(records, dict):
        records = records["entries"]
    documents = []
    for item in records:
        content = item.get("content") or item.get("answer")
        if not content or not item.get("question") or not item.get("source_url", "").startswith("https://"):
            raise ValueError("Farming references need a question, answer and HTTPS source")
        documents.append({**item, "id": "reference-" + item["id"],
                          "doc_type": "reviewed_reference", "content": content,
                          "section": item["question"], "source_name": path.name,
                          "state": item.get("state", ""), "source_path": str(path),
                          "retrieval_aliases": " ".join(item.get("aliases", [])),
                          "provenance": "reviewed_summary"})
    return documents


def load_corpus():
    """Load PDFs directly, plus curated HTML/CSV, without duplicate PDF exports."""
    from backend.pdf_ingestion import IMPORT_DIR, load_pdf_documents
    from backend.build_knowledge_base import STATE_MAP
    from backend.import_maharashtra_grs import load_gr_documents
    pdf_docs, report = load_pdf_documents()
    exclusions_path = BASE_DIR / "backend" / "knowledge" / "source_exclusions.json"
    exclusions = json.loads(exclusions_path.read_text(encoding="utf-8")) if exclusions_path.exists() else {}
    from backend.gr_scope import farming_scope
    subjects = {}
    for doc in pdf_docs:
        subjects.setdefault(doc["source_file"], doc["content"])
    for source, text in subjects.items():
        subject = re.split(r"The Government of Maharashtra|Government of Maharashtra|ગુજરાત\s+સરકાર|महाराष्ट्र\s+शासन", text, maxsplit=1, flags=re.I)[0][:400]
        allowed, reason = farming_scope(subject)
        if not allowed:
            exclusions.setdefault(source, reason)
    report["excluded_sources"] = exclusions
    pdf_docs = [doc for doc in pdf_docs if doc.get("source_file") not in exclusions]
    report["active_pdf_chunks"] = len(pdf_docs)
    generated = {STATE_MAP.get(folder.name, ("", slugify(folder.name)))[1] + ".html"
                 for folder in IMPORT_DIR.iterdir() if folder.is_dir() and list(folder.glob("*.pdf"))} if IMPORT_DIR.exists() else set()
    curated = [d for d in load_html_documents(DEFAULT_KNOWLEDGE_DIR) if d["source_name"] not in generated]
    for doc in curated:
        if doc['source_name'] == 'soil_basics.html':
            doc.update(doc_type='reviewed_reference', question='What is soil?', scope='general education',
                       aliases=['soil', 'soil meaning', 'माती म्हणजे काय?', 'माती काय आहे?',
                                'मिट्टी क्या है?', 'માટી શું છે?', 'માટી એટલે શું?',
                                'mitti kya hai', 'mati mhanje kay', 'mati shu che'])
    gr_docs, gr_report = load_gr_documents()
    references = load_farming_references()
    documents = pdf_docs + curated + references + load_csv_documents(DEFAULT_CSV_PATH) + gr_docs
    report["reviewed_references"] = len(references)
    report["repository_grs"] = gr_report
    report["total_chunks"] = len(documents)
    return documents, report
