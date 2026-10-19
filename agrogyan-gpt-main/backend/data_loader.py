from __future__ import annotations

import csv
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
