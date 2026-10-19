import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.multilingual import search_plan
from backend.rag import RAGRetriever
from backend.retriever import tokenize


class MultilingualTests(unittest.TestCase):
    def test_indic_words_keep_vowels_and_virama(self):
        for word in ['सेंद्रिय', 'मिट्टी', 'સેન્દ્રિય', 'ખેડૂતો']:
            self.assertEqual(tokenize(word), [word])
        self.assertEqual(tokenize('शे\u200dती'), ['शेती'])
        self.assertEqual(tokenize('२०२५-२६ ૨૦૨૫-૨૬'), ['2025', '26', '2025', '26'])

    def test_offline_concepts_do_not_replace_original_constraints(self):
        for question in ['महाराष्ट्रात सेंद्रिय शेती योजना नाही का?',
                         'महाराष्ट्र में जैविक खेती की योजना क्या है?',
                         'ગુજરાતમાં સેન્દ્રિય ખેતી યોજના શું છે?']:
            plan = search_plan(question)
            self.assertEqual(plan['original'], question)
            self.assertIn('organic farming', plan['semantic'])
        plan = search_plan('GR २०१८०७०२१५१२३१६२०१ कोणत्या प्रदेशासाठी आहे?')
        self.assertIn('201807021512316201', plan['original'])
        self.assertEqual(search_plan('मिट्टी क्या है?')['definition'], 'soil')
        self.assertNotIn('fertilizer', search_plan('खतरा क्या है?')['hints'])

    def test_native_alias_lexical_result_can_enter_semantic_context(self):
        doc = {'id': 'organic', 'title': 'Organic farming scheme',
               'retrieval_aliases': 'सेंद्रिय शेती योजना',
               'content': 'Organic farming is supported under the programme.', 'page': 1}
        other = {'id': 'other', 'content': 'Livestock productivity improvement programme.'}
        index = SimpleNamespace(search=lambda q, limit: [{**other, '_semantic_score': .55}],
                                embedder=SimpleNamespace(model='test'))
        llm = SimpleNamespace(model='test', is_available=lambda: True)
        rag = RAGRetriever([doc, other], llm, index, enabled=True)
        with patch.object(rag, '_generate', return_value={'answerable': False, 'claims': []}) as generate:
            rag.answer('सेंद्रिय शेती योजना')
        self.assertIn('organic', [d['id'] for d in generate.call_args.args[1]])

    def test_selector_returns_only_exact_evidence_and_rejects_invalid_choice(self):
        doc = {'id': 'soil', 'content': 'Soil is the loose mineral material in which plants grow.'}
        rag = RAGRetriever([doc], SimpleNamespace(base_url='http://local', model='test'),
                           SimpleNamespace(), enabled=True)
        with patch('backend.rag.requests.post') as post:
            response = post.return_value.__enter__.return_value
            response.iter_lines.return_value = [json.dumps({'message': {'content': '{"choice":1}'}, 'done': True}).encode()]
            data = rag._generate('What is soil?', [doc], None)
            self.assertEqual(data['claims'][0]['text'], doc['content'])
            self.assertIsNotNone(rag._validate(data, [{**doc, '_score': .8}]))
            for choice in [99, -1, True, '1']:
                response.iter_lines.return_value = [json.dumps({'message': {'content': json.dumps({'choice': choice})}, 'done': True}).encode()]
                with self.assertRaises(ValueError):
                    rag._generate('What is soil?', [doc], None)

    def test_failed_generation_cannot_escape_named_source(self):
        target = {'id': 'a', 'gr_identifier': '201807021512316201',
                  'content': 'The micro irrigation scheme covers Marathwada region.'}
        other = {'id': 'b', 'content': 'Irrigation benefits apply in another region for all farmers.'}
        rag = RAGRetriever([target, other], SimpleNamespace(), SimpleNamespace(), enabled=True)
        result = rag._fallback('Explain irrigation GR 201807021512316201', None, 'Unavailable',
                               [{**target, '_score': .8}])
        for evidence in result.get('evidence', []):
            self.assertNotIn('another region', evidence['text'])

    def test_definition_intent_is_explained_without_discarding_question(self):
        doc = {'id': 'soil', 'content': 'Soil is the loose mineral material in which plants grow.'}
        index = SimpleNamespace(search=lambda q, limit: [{**doc, '_semantic_score': .8}],
                                embedder=SimpleNamespace(model='test'))
        rag = RAGRetriever([doc], SimpleNamespace(is_available=lambda: True, model='test'), index, enabled=True)
        with patch.object(rag, '_generate', return_value={'answerable': False, 'claims': []}) as generate:
            rag.answer('माती म्हणजे काय?')
        question = generate.call_args.args[0]
        self.assertIn('माती म्हणजे काय?', question)
        self.assertIn('What is soil?', question)

    def test_topic_filter_excludes_generic_budget_paragraph(self):
        doc = {'id': 'organic', 'content': 'Organic farming support is provided by this scheme. The budget is to be spent only for this scheme.'}
        rag = RAGRetriever([doc], SimpleNamespace(base_url='http://local', model='test'), SimpleNamespace(), enabled=True)
        with patch('backend.rag.requests.post') as post:
            response = post.return_value.__enter__.return_value
            response.iter_lines.return_value = [b'{"message":{"content":"{\\"choice\\":1}"},"done":true}']
            rag._generate('महाराष्ट्रात सेंद्रिय शेती योजना', [doc], None)
            payload = json.loads(post.call_args.kwargs['json']['messages'][1]['content'])
        self.assertTrue(payload['passages'])
        self.assertTrue(all('Organic farming' in p['text'] for p in payload['passages']))


if __name__ == '__main__':
    unittest.main()
