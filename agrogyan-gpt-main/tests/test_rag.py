import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend.pdf_ingestion import load_pdf_documents, overlapping_chunks
from backend.rag import RAGRetriever
from backend.vector_store import VectorStore


class FakeEmbeddings:
    model = "test-embeddings"
    fingerprint = "model-digest-v1"

    def __init__(self):
        self.calls = 0

    def embed(self, texts):
        self.calls += len(texts)
        return [[1.0, 0.0] if "Irrigation" in t else [0.0, 1.0] for t in texts]

    def query(self, text):
        # Deliberately use a paraphrase without matching document words.
        return [1.0, 0.0] if text == "watering crops" else [0.0, 1.0]


class VectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "vectors.sqlite3"
        self.docs = [{"id": "a", "title": "Irrigation", "content": "Irrigation supplies water to plants."},
                     {"id": "b", "title": "Soil", "content": "Soil contains mineral material."}]

    def tearDown(self):
        self.temp.cleanup()

    def test_semantic_search_and_persistent_float_vectors(self):
        store = VectorStore(self.docs, FakeEmbeddings(), self.path)
        self.assertEqual(store.search("watering crops")[0]["id"], "a")
        with closing(sqlite3.connect(self.path)) as db:
            row = db.execute("SELECT dimension, typeof(vector), length(vector) FROM embeddings LIMIT 1").fetchone()
            self.assertEqual(row, (2, "blob", 8))
            self.assertEqual(db.execute("SELECT COUNT(*) FROM chunks").fetchone()[0], 2)

    def test_restart_reuses_embeddings_without_regeneration(self):
        VectorStore(self.docs, FakeEmbeddings(), self.path)
        embedder = FakeEmbeddings()
        store = VectorStore(self.docs, embedder, self.path)
        self.assertEqual(embedder.calls, 0)
        self.assertEqual(store.reused, 2)

    def test_changed_deleted_and_model_changed_sources(self):
        VectorStore(self.docs, FakeEmbeddings(), self.path)
        changed = [{**self.docs[0], "content": "Updated irrigation source."}]
        store = VectorStore(changed, FakeEmbeddings(), self.path)
        self.assertEqual(store.created, 1)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM chunks").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0], 1)
        embedder = FakeEmbeddings()
        embedder.fingerprint = "changed-model-digest"
        self.assertEqual(VectorStore(changed, embedder, self.path).created, 1)

    def test_failed_rebuild_preserves_committed_index(self):
        VectorStore(self.docs, FakeEmbeddings(), self.path)
        embedder = FakeEmbeddings()
        with patch.object(embedder, "embed", side_effect=RuntimeError("offline")):
            with self.assertRaises(RuntimeError):
                VectorStore([{**self.docs[0], "content": "changed"}], embedder, self.path)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM chunks").fetchone()[0], 2)

    def test_interrupted_bulk_build_resumes_completed_embedding_batches(self):
        VectorStore(self.docs,FakeEmbeddings(),self.path)
        docs=[{"id":f"new-{i}","content":f"New source content {i}"} for i in range(10)]
        embedder=FakeEmbeddings()
        real=embedder.embed
        count=0
        def fail_second(texts):
            nonlocal count
            count+=1
            if count==2:raise RuntimeError('interrupted')
            return real(texts)
        with patch.object(embedder,'embed',side_effect=fail_second):
            with self.assertRaises(RuntimeError):VectorStore(docs,embedder,self.path)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM chunks').fetchone()[0],2)
        resumed=VectorStore(docs,FakeEmbeddings(),self.path)
        self.assertEqual(resumed.reused,8)
        self.assertEqual(resumed.created,2)


class IngestionTests(unittest.TestCase):
    def test_overlap_preserves_every_character_and_bounds(self):
        text = " ".join(f"word{i}" for i in range(800))
        chunks = list(overlapping_chunks(text, size=200, overlap=40))
        self.assertTrue(all(len(chunk) <= 200 for chunk, _, _ in chunks))
        coverage = set()
        for chunk, start, end in chunks:
            self.assertEqual(chunk, text[start:end].strip())
            coverage.update(range(start, end))
        self.assertEqual(coverage, set(range(len(text))))
        self.assertEqual(chunks[1][1], chunks[0][2] - 40)

    def test_all_pages_metadata_and_ocr_cache(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "example.pdf").write_bytes(b"fake pdf")
            pages = [SimpleNamespace(extract_text=lambda: "Soil is the loose material in which plants grow."),
                     SimpleNamespace(extract_text=lambda: "")]
            with patch.dict(os.environ, {"PDF_PAGE_CACHE_PATH": str(root / "cache.sqlite3")}), \
                 patch("backend.pdf_ingestion.PdfReader", return_value=SimpleNamespace(pages=pages)), \
                 patch("backend.pdf_ingestion.ocr_page", return_value="Irrigation supplies water to crops through managed systems.") as ocr:
                docs, report = load_pdf_documents(root)
                self.assertEqual({d["page"] for d in docs}, {1, 2})
                self.assertEqual(report["unreadable_pages"], 0)
                self.assertEqual(report["files"][0]["ocr_pages"], [2])
                load_pdf_documents(root)
                self.assertEqual(ocr.call_count, 1)


class RAGTests(unittest.TestCase):
    def setUp(self):
        self.doc = {"id": "soil", "title": "Soil", "content": "Soil is the loose mineral material in which plants grow.", "page": 2}
        self.llm = SimpleNamespace(model="test-llm", _available=True, is_available=lambda: True)
        self.index = SimpleNamespace(search=lambda q, limit: [{**self.doc, "_semantic_score": 0.8}],
                                     embedder=SimpleNamespace(model="test-embeddings"),
                                     status=lambda: {"ready": True})
        self.r = RAGRetriever([self.doc], self.llm, self.index, enabled=True)
        self.valid = {"answerable": True, "claims": [{"text": "Soil is loose mineral material in which plants grow.",
                                                     "quote": self.doc["content"], "source": 1}]}

    def test_model_receives_whole_retrieved_context_and_result_is_cited(self):
        with patch.object(self.r, "_generate", return_value=self.valid) as generation:
            result = self.r.answer("What supports plant roots?")
            self.assertEqual(generation.call_args.args[1][0]["content"], self.doc["content"])
            self.assertEqual(result["answer_mode"], "rag")
            self.assertEqual(result["model"], "test-llm")
            self.assertEqual(result["references"][0]["page"], 2)
            self.assertIn("[1]", result["answer"])
            self.r.answer("What supports plant roots?")
            self.assertEqual(generation.call_count, 1)

    def test_invented_citations_quotes_and_numbers_are_rejected(self):
        bad_claims = [
            {**self.valid["claims"][0], "source": 99},
            {**self.valid["claims"][0], "quote": "A fabricated quote that is not in any source."},
            {**self.valid["claims"][0], "text": "Soil gives a 50 percent yield increase."},
            {**self.valid["claims"][0], "text": "Soil is not loose mineral material in which plants grow."},
            {**self.valid["claims"][0], "text": "Soil is loose mineral material in which plants grow and cures cancer."},
        ]
        for claim in bad_claims:
            self.assertIsNone(self.r._validate({"answerable": True, "claims": [claim]}, [self.doc]))

    def test_model_abstention_is_not_replaced_with_general_advice(self):
        with patch.object(self.r, "_generate", return_value={"answerable": False, "claims": []}):
            result = self.r.answer("How much pesticide should I apply?")
            self.assertEqual(result["source_type"], "none")
            self.assertEqual(result["references"], [])

    def test_failed_model_fallback_is_visible_and_not_cached(self):
        with patch.object(self.r, "_generate", side_effect=TimeoutError):
            result = self.r.answer("what is soil")
            self.assertEqual(result["answer_mode"], "definition")
            self.assertTrue(result["warnings"])
            self.assertFalse(self.r._cache)

    def test_timeout_preserves_cross_language_semantic_evidence(self):
        doc = {"id": "gujarat", "title": "Organic farming GR", "state": "Gujarat",
               "content": "ગુજરાત સેન્દ્રિય ખેતી નીતિ અંતર્ગત ખેડૂતોને સહાય પુરી પાડવાની યોજના",
               "source_file": "GR (guju)/5.pdf", "page": 1}
        index = SimpleNamespace(search=lambda q, limit: [{**doc, "_semantic_score": 0.595}],
                                embedder=SimpleNamespace(model="test-embeddings"))
        r = RAGRetriever([doc], self.llm, index, enabled=True)
        with patch.object(r, "_generate", side_effect=TimeoutError):
            result = r.answer("What does Gujarat say about organic farming in 2025-26?")
        self.assertEqual(result["source_type"], "documents")
        self.assertEqual(result["answer_mode"], "source_excerpt")
        self.assertEqual(result["references"][0]["source_file"], "GR (guju)/5.pdf")
        self.assertEqual(result["references"][0]["page"], 1)
        self.assertEqual(result["evidence"][0]["text"], doc["content"])
        self.assertIn("not a confirmed answer", result["answer"])
        self.assertFalse(r._cache)

    def test_weak_semantic_match_is_not_presented_as_source_evidence(self):
        result = self.r._fallback("pesticide dosage", None, "Unavailable", [{**self.doc, "_score": 0.31}])
        self.assertEqual(result["source_type"], "none")
        self.assertEqual(result["references"], [])

    def test_numbered_passage_is_mapped_to_exact_source_text(self):
        claim={"text":"Soil is loose mineral material in which plants grow.","source":1,"passage":1}
        result=self.r._validate({"answerable":True,"claims":[claim]},[self.doc])
        self.assertEqual(result["evidence"][0]["text"],self.doc["content"])
        for value in (0,99,True,"1"):
            self.assertIsNone(self.r._validate({"answerable":True,"claims":[{**claim,"passage":value}]},[self.doc]))

    def test_timeout_records_actual_wait(self):
        import time
        def fail(*args):
            time.sleep(0.01)
            raise TimeoutError()
        with patch.object(self.r,"_generate",side_effect=fail):
            result=self.r.answer("what is soil")
        self.assertGreaterEqual(result["generation_ms"],9)
        self.assertEqual(result["generation_failure"],"timeout")

    def test_named_gr_does_not_mix_other_resolutions(self):
        target={**self.doc,"gr_identifier":"201803161624182101"}
        other={**self.doc,"id":"other","content":"Unrelated resolution material."}
        index=SimpleNamespace(search=lambda q,limit:[{**other,"_semantic_score":0.9}],embedder=self.index.embedder)
        retriever=RAGRetriever([target,other],self.llm,index,enabled=True)
        with patch.object(retriever,"_generate",return_value=self.valid) as generation:
            retriever.answer("Explain GR 201803161624182101")
        self.assertEqual([d['id'] for d in generation.call_args.args[1]],['soil'])
        with patch.object(retriever,"_generate") as generation:
            result=retriever.answer("Explain GR 209903161624182101")
        generation.assert_not_called()
        self.assertEqual(result['source_type'],'none')

    def test_document_number_abbreviation_is_not_negation(self):
        doc={"id":"gr","content":"CTS No. 589A is mentioned for the Aarey service road.","_score":0.8}
        data={"answerable":True,"claims":[{"text":"The CTS number for the Aarey service road is 589A.","source":1,"passage":1}]}
        self.assertIsNotNone(self.r._validate(data,[doc]))

    def test_gr_identity_uses_metadata_but_does_not_approve_invented_amounts(self):
        doc={"id":"gr","gr_identifier":"201807021512316201","content":"Micro irrigation scheme for Marathwada region.","_score":0.8}
        claim={"text":"Micro irrigation scheme in GR 201807021512316201 covers the Marathwada region.","source":1,"passage":1}
        self.assertIsNotNone(self.r._validate({"answerable":True,"claims":[claim]},[doc]))
        claim['text']='GR 201807021512316201 pays farmers 5000.'
        self.assertIsNone(self.r._validate({"answerable":True,"claims":[claim]},[doc]))


if __name__ == "__main__":
    unittest.main()
