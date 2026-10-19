from __future__ import annotations

import math
import re
from collections import Counter


STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "to", "for", "of", "on", "in", "and", "or", "with",
    "from", "by", "can", "be", "about", "what", "which", "when", "how", "why", "who", "should", "could",
    "would", "into", "your", "their", "this", "that", "these", "those", "it", "as", "at", "if", "i",
    "we", "you", "they", "he", "she", "them", "our", "us", "me", "my", "does", "say", "mentioned",
    "mention", "document", "documents", "tell", "about"
}


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-zA-Z0-9]{2,}", (text or "").lower())
    return [word for word in words if word not in STOPWORDS]


def sentence_split(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", str(text or "").strip()) if part.strip()]


class Retriever:
    def __init__(self, documents: list[dict]):
        self.documents = documents
        self.index = [self._prepare_document(doc) for doc in documents]

    def _prepare_document(self, doc: dict) -> dict:
        content = doc.get("content") or doc.get("answer") or ""
        title = doc.get("title") or ""
        section = doc.get("section") or ""
        question = doc.get("question") or ""
        combined = f"{title} {section} {question} {content}"
        tokens = tokenize(combined)
        return {
            **doc,
            "_tokens": Counter(tokens),
            "_token_set": set(tokens),
            "_combined": combined,
        }

    def _score(self, query_tokens: list[str], doc: dict) -> float:
        if not query_tokens:
            return 0.0

        overlap = sum(doc["_tokens"].get(token, 0) for token in query_tokens)
        distinct_overlap = len(doc["_token_set"].intersection(query_tokens))
        coverage = distinct_overlap / max(1, len(set(query_tokens)))
        density = overlap / max(1, sum(doc["_tokens"].values()))

        title_tokens = set(tokenize(f"{doc.get('title', '')} {doc.get('section', '')}"))
        title_boost = len(title_tokens.intersection(query_tokens)) / max(1, len(query_tokens))
        state_boost = 0.08 if doc.get("state") and doc.get("state", "").lower() in " ".join(query_tokens) else 0
        qa_boost = 0.06 if doc.get("doc_type") == "legacy_qa" else 0

        score = (coverage * 0.58) + (min(1.0, density * 30) * 0.18) + (title_boost * 0.18) + state_boost + qa_boost
        return round(score, 4)

    def _rank(self, question: str, limit: int = 4) -> list[dict]:
        query_tokens = tokenize(question)
        ranked: list[dict] = []
        for doc in self.index:
            score = self._score(query_tokens, doc)
            if score <= 0:
                continue
            ranked.append({**doc, "_score": score})
        ranked.sort(key=lambda item: item["_score"], reverse=True)
        return ranked[:limit]

    def _build_references(self, documents: list[dict]) -> list[dict]:
        references = []
        for index, doc in enumerate(documents, start=1):
            references.append(
                {
                    "index": index,
                    "title": doc.get("title") or doc.get("source_name") or "Document",
                    "section": doc.get("section") or "Overview",
                    "state": doc.get("state") or "",
                    "source_name": doc.get("source_name") or "",
                    "source_path": doc.get("source_path") or "",
                    "source_url": doc.get("source_url") or "",
                    "score": round(doc.get("_score", 0), 2),
                }
            )
        return references

    def _build_follow_up_questions(self, question: str, documents: list[dict]) -> list[str]:
        tokens = [token for token in tokenize(question) if len(token) > 3]
        lead = tokens[0].title() if tokens else "this topic"
        state = next((doc.get("state") for doc in documents if doc.get("state")), "")
        candidates = [
            f"What are the main rules or steps related to {lead}?",
            f"Which document should I read first for {lead}{f' in {state}' if state else ''}?",
            f"What practical action should a farmer take next on {lead}?",
            f"Are there deadlines, approvals, or conditions I should not miss?",
        ]
        deduped = []
        for item in candidates:
            if item not in deduped:
                deduped.append(item)
        return deduped[:3]

    def _compose_answer(self, question: str, documents: list[dict]) -> str:
        lead = documents[0]
        intro = [
            "Based on the available documents, here is a grounded explanation.",
        ]
        if lead.get("state"):
            intro.append(f"The strongest supporting material in this answer comes from {lead['state']}.")

        body_lines = []
        for index, doc in enumerate(documents, start=1):
            sentences = sentence_split(doc.get("content", ""))[:3]
            excerpt = " ".join(sentences).strip()
            if not excerpt:
                continue
            heading = doc.get("section") or doc.get("title") or f"Reference {index}"
            body_lines.append(f"{index}. {heading}: {excerpt}")

        guidance = [
            "How to use this answer:",
            "Read the referenced points first, then match them with your crop, district, scheme, or compliance need before taking action.",
            "If your case depends on dates, eligibility, or state-specific conditions, cross-check the exact document cited in the references section.",
        ]

        return "\n\n".join([
            " ".join(intro),
            "\n".join(body_lines) if body_lines else "The documents contain relevant material, but I could not extract a clean explanatory passage.",
            "\n".join(guidance),
        ]).strip()

    def answer(self, question: str) -> dict:
        if not question.strip():
            return {
                "answer": "No answer found.",
                "confidence": 0.0,
                "references": [],
                "follow_up_questions": [],
                "matched_documents": [],
            }

        ranked = self._rank(question, limit=4)
        if not ranked or ranked[0]["_score"] < 0.08:
            return {
                "answer": "I could not find enough grounded material in the current dataset to answer that reliably.",
                "confidence": 0.0,
                "references": [],
                "follow_up_questions": [],
                "matched_documents": [],
            }

        answer = self._compose_answer(question, ranked)
        references = self._build_references(ranked)
        follow_ups = self._build_follow_up_questions(question, ranked)
        confidence = min(0.96, round(sum(item["_score"] for item in ranked) / max(1, math.sqrt(len(ranked)) * 1.6), 2))

        return {
            "answer": answer,
            "confidence": confidence,
            "references": references,
            "follow_up_questions": follow_ups,
            "matched_documents": [
                {
                    "title": item.get("title"),
                    "section": item.get("section"),
                    "state": item.get("state"),
                    "score": round(item.get("_score", 0), 2),
                }
                for item in ranked
            ],
        }
