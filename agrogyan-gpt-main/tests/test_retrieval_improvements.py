import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.data_loader import load_farming_references
from backend.rag import RAGRetriever
from backend.retrieval_policy import answers_intent, source_fits_request, topic_coverage


class RetrievalImprovementTests(unittest.TestCase):
    def make_rag(self, docs, scores=None):
        index = SimpleNamespace(search=lambda q, limit: [{**d, '_semantic_score': (scores or {}).get(d['id'], .6)} for d in docs],
                                embedder=SimpleNamespace(model='test'))
        return RAGRetriever(docs, SimpleNamespace(model='test', base_url='http://local', is_available=lambda: True), index, enabled=True)

    def test_reviewed_basics_and_native_aliases_need_no_model_or_embedding(self):
        rag = self.make_rag(load_farming_references())
        for question in ['What is organic farming?', 'What is VNMKV?', 'What is crop rotation?',
                         'जैविक खेती क्या है', 'સેન્દ્રિય ખેતી શું છે', 'सेंद्रिय शेती म्हणजे काय']:
            with self.subTest(question=question), patch.object(rag, '_generate') as generation, \
                 patch.object(rag.vector_store, 'search') as search:
                result = rag.answer(question)
                self.assertEqual(result['answer_mode'], 'reviewed_reference')
                self.assertTrue(result['references'][0]['source_url'].startswith('https://'))
                self.assertIn('[1]', result['answer'])
                generation.assert_not_called()
                search.assert_not_called()

    def test_question_matching_does_not_drop_new_constraints_or_question_intent(self):
        rag = self.make_rag(load_farming_references())
        for q in ['What is organic farming in 2099?', 'Why is crop rotation?',
                  'What is organic farming pesticide dose?', 'What is not organic farming?']:
            self.assertIsNone(rag._reviewed_answer(q))

    def test_stored_gujarati_wording_is_tied_to_exact_source_version(self):
        docs = load_farming_references()
        rag = self.make_rag(docs)
        result = rag.answer('What is organic farming?')
        self.assertTrue(result['localized_answers']['gu'].endswith('[1]'))
        changed = [{**d, 'content': d['content'] + ' Updated source wording.'} for d in docs]
        result = self.make_rag(changed).answer('What is organic farming?')
        self.assertNotIn('localized_answers', result)

    def test_paperwork_is_not_answered_by_a_subsidy_amount(self):
        self.assertFalse(answers_intent('Tractor subsidy is 50% of the cost.', 'Which documents are required for tractor subsidy?'))
        self.assertTrue(answers_intent('Submit Aadhaar and land certificates for the tractor subsidy.', 'Which documents are required for tractor subsidy?'))

    def test_definition_rejects_incidental_budget_text_before_model_selection(self):
        doc = {'id': 'organic', 'content': 'The organic farming mission received funding for its implementation.'}
        rag = self.make_rag([doc])
        with patch('backend.rag.requests.post') as post:
            result = rag._generate('What is organic farming?', [doc], None)
        self.assertFalse(result['answerable'])
        post.assert_not_called()
        self.assertFalse(answers_intent('As a result, the ecological balance is disturbed and the soil is destroyed.', 'माती म्हणजे काय?'))

    def test_scheme_queries_do_not_use_general_reference_as_scheme_evidence(self):
        general = next(d for d in load_farming_references() if d['id'] == 'reference-organic-farming')
        self.assertFalse(source_fits_request('What does the Gujarat GR say about organic farming?', general))
        self.assertFalse(source_fits_request('Which soil scheme is available?', {**general, 'scope': 'general education; no field-specific fertilizer dose'}))
        self.assertTrue(source_fits_request('What is organic farming?', general))

    def test_native_source_matches_english_topic_without_general_reference(self):
        doc = {'content': 'ગુજરાત સેન્દ્રિય ખેતી નીતિ અંતર્ગત ખેડૂતોને સહાય પુરી પાડવાની યોજના'}
        self.assertGreaterEqual(topic_coverage('What does Gujarat GR say about organic farming in 2025-26?', doc), .65)

    def test_relevant_abstention_shows_related_sources_without_claiming_answer(self):
        doc = {'id': 'tractor', 'title': 'Tractor scheme', 'content': 'Tractor subsidy is provided by the agricultural mechanization programme.', 'page': 3}
        rag = self.make_rag([doc])
        with patch.object(rag, '_generate', return_value={'answerable': False, 'claims': []}):
            result = rag.answer('Which documents are required for tractor subsidy?')
        self.assertEqual(result['answer_mode'], 'source_excerpt')
        self.assertIn('not a confirmed answer', result['answer'])
        self.assertEqual(result['references'][0]['page'], 3)
        self.assertFalse(rag._cache)

    def test_unrelated_abstention_has_no_source_claim(self):
        doc = {'id': 'soil', 'content': 'Soil is the mineral material in which plants grow.'}
        rag = self.make_rag([doc])
        with patch.object(rag, '_generate', return_value={'answerable': False, 'claims': []}):
            result = rag.answer('How much pesticide should I apply?')
        self.assertEqual(result['source_type'], 'none')
        self.assertEqual(result['references'], [])

    def test_lexical_hit_survives_low_semantic_score(self):
        doc = {'id': 'drip', 'content': 'Drip irrigation supports crop watering through small emitters.'}
        rag = self.make_rag([doc], {'drip': .1})
        with patch.object(rag, '_generate', return_value={'answerable': False, 'claims': []}) as generation:
            rag.answer('Tell me about drip irrigation')
        self.assertEqual(generation.call_args.args[1][0]['id'], 'drip')

    def test_starting_ollama_later_reconnects_without_blocking_the_chat(self):
        rag = self.make_rag([])
        rag.vector_store = None
        ready = SimpleNamespace(status=lambda: {'ready': True})
        def thread(**kwargs):
            return SimpleNamespace(start=kwargs['target'])
        with patch('backend.rag.Thread', side_effect=thread), \
             patch('backend.rag.OllamaEmbeddings'), patch('backend.rag.VectorStore', return_value=ready) as build:
            rag._maybe_reconnect_vectors()
            rag._maybe_reconnect_vectors()
        build.assert_called_once()
        self.assertTrue(rag.status()['ready'])
        self.assertFalse(rag._vector_loading)

    def test_failed_reconnect_has_cooldown_and_preserves_keyword_index(self):
        doc = {'id': 'drip', 'content': 'Drip irrigation supports crop watering through small emitters.'}
        rag = self.make_rag([doc])
        rag.vector_store = None
        def thread(**kwargs):
            return SimpleNamespace(start=kwargs['target'])
        with patch('backend.rag.Thread', side_effect=thread), \
             patch('backend.rag.OllamaEmbeddings', side_effect=RuntimeError('offline')) as connect:
            rag._maybe_reconnect_vectors()
            rag._maybe_reconnect_vectors()
        connect.assert_called_once()
        self.assertEqual(rag._rank(['drip'], None)[0]['id'], 'drip')
        self.assertFalse(rag.status()['ready'])


if __name__ == '__main__':
    unittest.main()
