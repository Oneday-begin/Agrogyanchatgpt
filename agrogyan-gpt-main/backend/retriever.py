"""Indexed, cached source-excerpt retrieval. No model generation on chat requests.

Source excerpts preserve uploaded claims, which still need source validation;
lexical relevance is not a guarantee of correctness or semantic answerability.
"""
from __future__ import annotations

import copy
import heapq
import hashlib
import logging
import math
import os
import re
import time
import unicodedata
from collections import Counter
from collections import OrderedDict, defaultdict
from threading import RLock
from typing import Any, Optional

import requests

logger = logging.getLogger("agrogyan.retriever")

STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "to", "for", "of", "on", "in", "and", "or", "with",
    "from", "by", "can", "be", "about", "what", "which", "when", "how", "why", "who", "should", "could",
    "would", "into", "your", "their", "this", "that", "these", "those", "it", "as", "at", "if", "i",
    "we", "you", "they", "he", "she", "them", "our", "us", "me", "my", "does", "do", "did", "say",
    "mentioned", "mention", "document", "documents", "tell", "please", "explain", "give", "get", "will",
    "there", "any", "some", "much", "many", "best", "way", "use", "says", "according", "where",
    "know", "want", "need", "help", "information", "details", "regarding", "related", "regards",
}

# Characters produced by broken PDF extraction (control bytes, replacement char).
_GARBAGE_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffd]")

# Answer source labels shared with the frontend.
SOURCE_DOCUMENTS = "documents"
SOURCE_GENERAL = "general"
SOURCE_NONE = "none"

STATES = (
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
    "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh",
    "Andaman and Nicobar Islands", "Lakshadweep", "Dadra and Nagar Haveli and Daman and Diu",
)

NOT_FOUND_MESSAGE = (
    "I couldn't find this in the AgroGyan knowledge base yet. Try naming the crop, "
    "state or scheme you're asking about, or contact your local Krishi Vigyan Kendra "
    "for field-specific advice."
)


def tokenize(text: str) -> list[str]:
    # Python's \w excludes Indic combining marks (vowels/virama). Keep each
    # complete Unicode word rather than indexing broken consonant fragments.
    normalized = unicodedata.normalize("NFC", text or "").casefold().replace('\u200d', '').replace('\u200c', '')
    normalized = ''.join(str(unicodedata.digit(c)) if c.isdecimal() else c for c in normalized)
    words = "".join(c if unicodedata.category(c)[0] in {"L", "N", "M"} else " "
                    for c in normalized).split()
    return [w for w in words if w not in STOPWORDS and len(w) > 1]


def sentence_split(text: str) -> list[str]:
    # PDF line wraps are not sentence boundaries. Keep paragraph/list boundaries.
    parts = re.split(r"(?<=[.!?\u0964])\s+|\n{2,}|\n(?=\s*(?:[•●*-]|\d+[.)]))", str(text or ""))
    return [_clean(p) for p in parts if p.strip()]


def _is_clean_sentence(sentence: str) -> bool:
    """Reject fragments and garbled OCR/PDF output so they never reach users."""
    if len(sentence) < 25:
        return False
    garbage = len(_GARBAGE_RE.findall(sentence))
    return garbage / max(1, len(sentence)) < 0.02


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", _GARBAGE_RE.sub("", text or "")).strip()


class OllamaClient:
    """Minimal Ollama client with a cached availability probe.

    The probe stops every request from waiting for the full generation timeout
    when Ollama simply isn't running.
    """

    def __init__(self) -> None:
        self.base_url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        self.model = os.getenv("OLLAMA_MODEL", "qwen3:0.6b")
        self.timeout = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90"))
        self._available: Optional[bool] = None
        self._checked_at = 0.0

    def is_available(self) -> bool:
        if self._available is not None and time.monotonic() - self._checked_at < 30:
            return self._available
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=1.5)
            resp.raise_for_status()
            models = {m.get("name", "") for m in resp.json().get("models", [])}
            self._available = (self.model if ":" in self.model else self.model + ":latest") in models
            if not self._available:
                logger.warning("Ollama is running but model '%s' is not pulled (have: %s)", self.model, sorted(models))
        except Exception:
            self._available = False
        self._checked_at = time.monotonic()
        return self._available



class Retriever:
    K1 = 1.5
    B = 0.75

    def __init__(self, documents: list[dict], llm: Optional[OllamaClient] = None):
        self.documents = documents
        self.llm = llm or OllamaClient()
        self._index: list[dict] = []
        self._doc_freqs: list[Counter] = []
        self._doc_len: list[int] = []
        self._idf: dict[str, float] = {}
        self._postings: dict[str, set[int]] = defaultdict(set)
        self._sentences: list[list[tuple[str, set[str]]]] = []
        self._cache: OrderedDict = OrderedDict()
        self._cache_lock = RLock()
        self._cache_limit = 256
        self._reference_lookup = {}

        df: Counter = Counter()
        for doc in documents:
            if doc.get("doc_type") == "reviewed_reference":
                for question in [doc.get("question", ""), *doc.get("aliases", [])]:
                    if question:
                        self._reference_lookup[self._question_key(question)] = doc
            combined = " ".join(
                str(doc.get(key) or "") for key in ("title", "section", "question", "content", "answer", "retrieval_aliases")
            )
            tokens = tokenize(combined)
            freqs = Counter(tokens)
            self._doc_freqs.append(freqs)
            self._doc_len.append(len(tokens))
            df.update(freqs.keys())
            self._index.append({**doc, "_combined_lower": combined.lower()})
            for token in freqs:
                self._postings[token].add(len(self._index) - 1)
            self._sentences.append([
                (_clean(s), set(tokenize(s)))
                for s in sentence_split(doc.get("content") or doc.get("answer", ""))
                if _is_clean_sentence(s)
            ])

        n_docs = max(1, len(documents))
        self._avgdl = sum(self._doc_len) / n_docs
        self._idf = {tok: math.log(1 + (n_docs - f + 0.5) / (f + 0.5)) for tok, f in df.items()}
        logger.info("Retriever indexed %d chunks (%d unique terms)", len(documents), len(self._idf))

    # ------------------------------------------------------------------ ranking
    def _bm25(self, query_tokens: list[str], i: int) -> float:
        freqs, length = self._doc_freqs[i], self._doc_len[i]
        score = 0.0
        for tok in query_tokens:
            tf = freqs.get(tok)
            if not tf:
                continue
            norm = tf + self.K1 * (1 - self.B + self.B * length / max(1.0, self._avgdl))
            score += self._idf.get(tok, 0.0) * tf * (self.K1 + 1) / norm
        return score

    def _rank(self, query_tokens: list[str], profile: Optional[dict], limit: int = 4) -> list[dict]:
        if not query_tokens:
            return []
        ranked = []
        candidates = set().union(*(self._postings.get(t, set()) for t in query_tokens))
        query_states = {state.casefold() for state in STATES if set(tokenize(state)) <= set(query_tokens)}
        for i in sorted(candidates):
            doc = self._index[i]
            if query_states and doc.get("state") and str(doc["state"]).lower() not in query_states:
                continue
            score = self._bm25(query_tokens, i)
            if score <= 0:
                continue
            if profile:  # small tie-breaker toward the farmer's own state/crop
                text = doc["_combined_lower"]
                for key, weight in (("state", 0.4), ("crop_name", 0.3), ("district", 0.2)):
                    value = str(profile.get(key) or "").lower()
                    if value and value in text:
                        score += weight
            ranked.append({**doc, "_score": score, "_index_id": i})
        ranked = heapq.nlargest(limit, ranked, key=lambda d: d["_score"])
        if not ranked:
            return []
        floor = ranked[0]["_score"] * 0.35  # drop long-tail weak matches
        return [d for d in ranked[:limit] if d["_score"] >= floor]

    @staticmethod
    def _coverage(query_tokens: list[str], docs: list[dict]) -> float:
        if not query_tokens or not docs:
            return 0.0
        found = set(query_tokens) & set().union(*(set(tokenize(d["_combined_lower"])) for d in docs))
        return len(found) / len(set(query_tokens))

    @staticmethod
    def _best_sentences(query_tokens: set[str], doc: dict, limit: int = 3) -> list[str]:
        sentences = [s for s in sentence_split(doc.get("content", "")) if _is_clean_sentence(s)]
        scored = []
        for pos, sentence in enumerate(sentences):
            overlap = len(set(tokenize(sentence)) & query_tokens)
            if overlap:
                scored.append((overlap, -pos, sentence))
        scored.sort(reverse=True)
        top = sorted(scored[:limit], key=lambda item: -item[1])  # restore reading order
        return [_clean(s) for _, _, s in top]

    # -------------------------------------------------------------- formatting
    @staticmethod
    def _references(docs: list[dict]) -> list[dict]:
        return [
            {
                "index": i,
                "title": d.get("title") or d.get("source_name") or "Document",
                "section": d.get("section") or "Overview",
                "state": d.get("state") or "",
                "source_name": d.get("source_name") or "",
                "source_url": d.get("source_url") or "",
                "source_id": d.get("source_id"),
                "source_file": d.get("source_file"),
                "page": d.get("page"),
                "source_excerpt_url": d.get("source_excerpt_url"),
                "provenance": d.get("provenance"),
                "repository_url": d.get("repository_url"),
                "gr_number": d.get("gr_number"),
                "issued_date_text": d.get("issued_date_text"),
                "score": round(d.get("_score", 0.0), 2),
            }
            for i, d in enumerate(docs, start=1)
        ]

    # ----------------------------------------------------------------- answer
    @staticmethod
    def _question_key(question):
        normalized = unicodedata.normalize("NFC", question).casefold()
        return " ".join("".join(c if unicodedata.category(c)[0] in {"L", "N", "M"}
                                 else " " for c in normalized).split())

    def _reviewed_answer(self, question):
        # Only exact question/alias matches, including punctuation/case
        # normalization. Added dates, crops, amounts and negation remain in key.
        doc = self._reference_lookup.get(self._question_key(question))
        if not doc:
            return None
        selected = {**doc, "_score": 1.0}
        result = self._result(doc["content"] + " [1]", 1.0, SOURCE_DOCUMENTS,
                              references=self._references([selected]), matched=[selected])
        result.update(evidence=[{"index": 1, "text": doc["content"], "page": doc.get("page")}],
                      answer_mode="reviewed_reference", retrieval_method="reviewed_question_match",
                      generation_ms=0, context_chunks=1)
        if doc.get('localization_content_hash') == hashlib.sha256(doc['content'].encode()).hexdigest():
            result['localized_answers'] = {lang: text + ' [1]' for lang, text in doc.get('localized_answers', {}).items()}
        return result

    def answer(self, question: str, profile: Optional[dict] = None) -> dict:
        """Return source excerpts only; model output is never treated as evidence.

        Cache is bounded and scoped to the retrieval-relevant profile. The index
        and cache share a lifetime, so rebuilding the index invalidates answers.
        Confidence describes lexical relevance, not factual correctness.
        """
        question = (question or "").strip()
        if not question:
            return self._result(NOT_FOUND_MESSAGE, 0.0, SOURCE_NONE)
        started = time.perf_counter()
        key = (" ".join(question.casefold().split()), tuple(
            str((profile or {}).get(k) or "").casefold() for k in ("state", "crop_name", "district")))
        with self._cache_lock:
            cached = self._cache.get(key)
            if cached is not None:
                self._cache.move_to_end(key)
                result = copy.deepcopy(cached)
                result["cache_hit"] = True
                result["generation_ms"] = 0
                result["retrieval_ms"] = round((time.perf_counter() - started) * 1000, 2)
                return result
        result = self._extract(question, profile)
        result.setdefault("answer_mode", "extractive")
        result.update(cache_hit=False,
                      confidence_kind="retrieval_relevance", freshness="unverified")
        result.setdefault("retrieval_ms", round((time.perf_counter() - started) * 1000, 2))
        with self._cache_lock:
            if result.get("_cacheable", True) and result.get("source_type") != SOURCE_NONE:
                self._cache[key] = copy.deepcopy(result)
            if len(self._cache) > self._cache_limit:
                self._cache.popitem(last=False)
        return result

    def _extract(self, question: str, profile: Optional[dict]) -> dict:
        if re.fullmatch(r"\s*(?:h+i+|hello+|hey+|namaste|good morning|good evening)[!.\s]*", question, re.I):
            result = self._result("Hello! I'm AgroGyan. Ask me about soil, crops, farming, or agricultural schemes. What would you like help with?", 0.0, "conversation")
            result["answer_mode"] = "conversation"
            result["follow_up_questions"] = ["What is soil?", "What is VNMKV?"]
            return result
        if self._needs_cts_clarification(question):
            locality = re.search(r"\b(?:of|in|at)\s+([\w -]{2,80})", question, re.I)
            location = f" in {locality.group(1).strip().title()}" if locality else ""
            result = self._result(
                f"Do you mean the City Survey (CTS) number of a property{location}? "
                "Please share the specific plot, survey reference, or land-record document. "
                "I can't identify a property's CTS number from the locality name alone.", 0.0, "clarification")
            result["answer_mode"] = "clarification"
            return result
        if re.search(r"\b(today|current|currently|latest|live|now|updated|this year)\b", question, re.I):
            return self._result(
                "I cannot verify current prices, weather, deadlines or rules from the stored documents. "
                "Please check the relevant official live source or your local agriculture office.",
                0.0, SOURCE_NONE)
        reviewed = self._reviewed_answer(question)
        if reviewed:
            return reviewed
        tokens = set(tokenize(question))
        definition = self._definition_target(question)
        numbers = {t for t in tokens if t.isdigit()}
        ranked = self._rank(sorted(tokens), profile, limit=8)
        evidence, selected, seen = [], [], set()
        for doc in ranked:
            # Evaluate each chunk separately: unrelated chunks must not combine
            # to create an apparently complete answer.
            if self._coverage(list(tokens), [doc]) < 0.75:
                continue
            sentences = self._sentences[doc["_index_id"]]
            windows = []
            for pos, (text, terms) in enumerate(sentences):
                if definition:
                    # Mentions such as 'soil health management' do not define soil.
                    pattern = r"(?<!\w)" + re.escape(definition) + r"\s+(?:is|are|means|refers to|stands for)\b"
                    match = re.search(pattern, text, re.I)
                    if not match:
                        continue
                    text = text[match.start():]
                    terms = set(tokenize(text))
                elif len(text) < 100 and not text.startswith(("•", "●", "-", "*")) and pos + 1 < len(sentences):
                    text += " " + sentences[pos + 1][0]
                    terms = terms | sentences[pos + 1][1]
                windows.append((pos, text, terms))
            scored = [(len(terms & tokens), -pos, text) for pos, text, terms in windows
                      if len(terms & tokens) / max(1, len(tokens)) >= 0.75
                      and numbers <= terms and len(text) <= 900]
            # Prefer complete individual sentences over overlapping windows.
            top = heapq.nlargest(2, scored, key=lambda item: (item[0], -len(item[2]), item[1]))
            excerpts = []
            for _, _, text in top:
                if any(self._overlaps(text, previous) for previous in seen):
                    continue
                seen.add(text)
                excerpts.append(text)
                if definition:
                    break
            if not excerpts:
                continue
            selected.append(doc)
            citation = len(selected)
            for text in excerpts:
                seen.add(text)
                evidence.append({"index": citation, "text": text})
            if definition or len(selected) >= 3:
                break
        if not evidence:
            if definition:
                return self._result(
                    f"I don't have a sourced definition of {definition} yet. "
                    "A document mentioning the term is not enough to explain it accurately. "
                    "Could you give more context or share a relevant document?", 0.0, SOURCE_NONE)
            return self._result(NOT_FOUND_MESSAGE, 0.0, SOURCE_NONE)
        body = "\n".join(f"- {e['text']} [{e['index']}]" for e in evidence)
        if definition:
            body = f"{evidence[0]['text']} [1]"
        result = self._result(
            body if definition else "From the knowledge base:\n\n" + body,
            round(min(0.9, self._coverage(list(tokens), selected)), 2), SOURCE_DOCUMENTS,
            references=self._references(selected), matched=selected)
        result["evidence"] = evidence
        if definition:
            result["answer_mode"] = "definition"
        return result

    @staticmethod
    def _needs_cts_clarification(question):
        return bool(re.search(r"\bcts\b", question, re.I)) and not Retriever._definition_target(question) and not re.search(
            r"\b(?:gr|resolution|document|notice|road|transfer)\b", question, re.I)

    @staticmethod
    def _definition_target(question: str) -> Optional[str]:
        normalized = question.strip().lower().rstrip("?!. ")
        match = re.fullmatch(r"(?:what (?:is|are)|define|meaning of)\s+(?:(?:a|an|the)\s+)?(.+)", normalized)
        if match:
            return match.group(1)
        match = re.fullmatch(r"(.+?)\s+meaning", normalized)
        if match:
            return match.group(1)
        if re.fullmatch(r"[a-z]{2,}", normalized):
            return normalized
        return None

    @staticmethod
    def _overlaps(text: str, previous: str) -> bool:
        a, b = text.casefold(), previous.casefold()
        if a in b or b in a:
            return True
        a_terms, b_terms = set(tokenize(a)), set(tokenize(b))
        return len(a_terms & b_terms) / max(1, len(a_terms | b_terms)) >= 0.8

    def _result(self, answer: str, confidence: float, source_type: str, *,
                references: Optional[list] = None, follow_ups: Optional[list] = None,
                matched: Optional[list] = None) -> dict:
        return {
            "answer": answer,
            "confidence": confidence,
            "source_type": source_type,
            "references": references or [],
            "follow_up_questions": follow_ups or [],
            "matched_documents": [
                {"title": d.get("title"), "section": d.get("section"), "state": d.get("state"),
                 "score": round(d.get("_score", 0.0), 2)}
                for d in (matched or [])
            ],
            "model": None,
        }
