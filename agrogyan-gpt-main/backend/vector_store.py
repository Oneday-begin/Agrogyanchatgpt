"""Persistent float32 embeddings in SQLite, with exact cosine search.

The small local corpus needs no external vector database service. The stored
matrix is loaded once for fast queries; content/model fingerprints govern reuse.
"""
import hashlib
import json
import logging
import math
import os
import sqlite3
import time
from threading import BoundedSemaphore
from array import array
from functools import lru_cache
from contextlib import closing
from pathlib import Path

import requests
import numpy as np

DEFAULT_PATH = Path(__file__).resolve().parent / "knowledge" / "vectors.sqlite3"
logger = logging.getLogger(__name__)


class OllamaEmbeddings:
    def __init__(self):
        self.base_url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        self.model = os.getenv("EMBEDDING_MODEL", "embeddinggemma")
        self._query_slot = BoundedSemaphore(1)
        self._retry_after = 0.0
        response = requests.get(f"{self.base_url}/api/tags", timeout=(2, 5))
        response.raise_for_status()
        name = self.model if ":" in self.model else self.model + ":latest"
        entry = next((m for m in response.json().get("models", []) if m.get("name") == name), None)
        if not entry:
            raise RuntimeError(f"Embedding model {self.model} is missing; run ollama pull {self.model}")
        self.fingerprint = self.model + ":" + entry["digest"]

    def embed(self, texts: list[str], query=False):
        prefix = ("search_query: " if query else "search_document: ") if self.model.startswith("nomic-embed-text") else ""
        if self.model.startswith("embeddinggemma"):
            prefix = "task: search result | query: " if query else "title: none | text: "
        response = requests.post(f"{self.base_url}/api/embed", json={
            "model": self.model, "input": [prefix + t for t in texts],
            "truncate": False, "keep_alive": "30m",
        }, timeout=(2, float(os.getenv("EMBEDDING_QUERY_TIMEOUT_SECONDS", "5") if query else os.getenv("EMBEDDING_TIMEOUT_SECONDS", "120"))))
        response.raise_for_status()
        vectors = response.json()["embeddings"]
        if len(vectors) != len(texts):
            raise ValueError("Embedding count differs from chunk count")
        normalized = []
        for vector in vectors:
            if not vector or not all(math.isfinite(x) for x in vector):
                raise ValueError("Invalid embedding")
            norm = math.sqrt(sum(x * x for x in vector))
            if norm == 0:
                raise ValueError("Zero embedding")
            normalized.append([x / norm for x in vector])
        return normalized

    @lru_cache(maxsize=256)
    def query(self, text):
        if time.monotonic() < self._retry_after or not self._query_slot.acquire(blocking=False):
            raise RuntimeError("Embedding service busy; use lexical search")
        try:
            return self.embed([text], query=True)[0]
        except (requests.RequestException, ValueError, KeyError):
            self._retry_after = time.monotonic() + 15
            raise
        finally:
            self._query_slot.release()


class VectorStore:
    def __init__(self, documents, embedder, path=DEFAULT_PATH):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.embedder = embedder
        self.documents = documents
        self.dimension = 0
        self.vectors = []
        self.reused = 0
        self.created = 0
        self._build()

    @staticmethod
    def embedding_text(doc):
        return f"{doc.get('title', '')}\n{doc.get('state', '')}\n{doc['content']}"

    def _build(self):
        with closing(sqlite3.connect(self.path, timeout=30)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS embeddings (cache_key TEXT PRIMARY KEY, model TEXT NOT NULL, dimension INTEGER NOT NULL, vector BLOB NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, cache_key TEXT NOT NULL, metadata TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            keys, missing, pending, missing_keys = [], [], {}, set()
            for doc in self.documents:
                content = self.embedding_text(doc)
                key = hashlib.sha256((self.embedder.fingerprint + "\n" + content).encode()).hexdigest()
                keys.append(key)
                row = db.execute("SELECT dimension, vector FROM embeddings WHERE cache_key=?", (key,)).fetchone()
                if row:
                    vector = array("f")
                    vector.frombytes(row[1])
                    if len(vector) != row[0] or not all(math.isfinite(x) for x in vector):
                        raise ValueError("Stored vector is corrupt; rebuild the index")
                    pending[key] = vector
                    self.reused += 1
                elif key not in missing_keys:
                    missing.append((key, content))
                    missing_keys.add(key)
            # Cache each completed batch so a long CPU ingestion can resume.
            # Active chunks/index metadata swap only after every batch succeeds.
            logger.info("Embedding index: %s chunks, %s cached, %s new vectors", len(keys), self.reused, len(missing))
            for start in range(0, len(missing), 8):
                batch = missing[start:start + 8]
                vectors = self.embedder.embed([text for _, text in batch])
                for (key, _), vector in zip(batch, vectors):
                    pending[key] = array("f", vector)
                    db.execute("INSERT OR REPLACE INTO embeddings VALUES (?, ?, ?, ?)",
                               (key, self.embedder.fingerprint, len(vector), pending[key].tobytes()))
                    self.created += 1
                db.commit()
                if start % 64 == 0 or start + len(batch) == len(missing):
                    logger.info("Embedding progress: %s/%s new vectors saved", self.created, len(missing))
            dimensions = {len(v) for v in pending.values()}
            if len(dimensions) > 1:
                raise ValueError("Embedding dimensions differ")
            self.dimension = next(iter(dimensions), 0)
            db.execute("DELETE FROM chunks")
            db.executemany("INSERT INTO chunks VALUES (?, ?, ?)",
                           [(d["id"], k, json.dumps(d, ensure_ascii=False)) for d, k in zip(self.documents, keys)])
            db.execute("INSERT OR REPLACE INTO index_meta VALUES ('model', ?)", (self.embedder.fingerprint,))
            db.execute("INSERT OR REPLACE INTO index_meta VALUES ('dimension', ?)", (str(self.dimension),))
            db.execute("DELETE FROM embeddings WHERE cache_key NOT IN (SELECT cache_key FROM chunks)")
            self.vectors = [pending[k] for k in keys]
            self.matrix = np.asarray(self.vectors, dtype=np.float32)

    def search(self, question, limit=8):
        query = self.embedder.query(question)
        if len(query) != self.dimension:
            raise ValueError("Query and document embeddings differ in dimension")
        if not self.documents or limit <= 0:
            return []
        scores = self.matrix @ np.asarray(query, dtype=np.float32)
        count = min(limit, len(scores))
        indices = np.argpartition(-scores, count - 1)[:count]
        indices = sorted(indices, key=lambda i: (-float(scores[i]), -int(i)))
        return [{**self.documents[i], "_semantic_score": round(float(scores[i]), 5)} for i in indices]

    def status(self):
        return {"ready": bool(self.vectors), "chunks": len(self.vectors), "dimension": self.dimension,
                "embedding_model": self.embedder.model, "storage": "sqlite_float32", "persistent": True,
                "embeddings_created": self.created, "embeddings_reused": self.reused}
