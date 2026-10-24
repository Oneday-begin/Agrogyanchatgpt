import os
import unittest
from unittest.mock import Mock, patch

from backend.rag import RAGRetriever
from backend import translation


class CloudDemoTests(unittest.TestCase):
    def test_groq_selector_uses_only_configured_endpoint(self):
        response = Mock()
        response.json.return_value = {'choices': [{'message': {'content': '{"choice":1}'}}]}
        with patch.dict(os.environ, {'LLM_PROVIDER': 'groq', 'LLM_MODEL': 'openai/gpt-oss-120b', 'GROQ_API_KEY': 'test-placeholder'}), patch('backend.rag.requests.post', return_value=response) as post:
            self.assertTrue(RAGRetriever._cloud_configured())
            result = RAGRetriever._cloud_select(None, 'Choose evidence', 'What is soil?', [{'id': 1, 'text': 'Soil is material.'}])
            self.assertEqual(result, {'choice': 1})
            self.assertEqual(post.call_args.args[0], 'https://api.groq.com/openai/v1/chat/completions')
            self.assertEqual(post.call_args.kwargs['json']['reasoning_effort'], 'low')

    def test_cloud_translation_rejects_changed_amount(self):
        response = Mock()
        response.json.return_value = {'choices': [{'finish_reason': 'stop', 'message': {'content': 'મદદ 500 રૂપિયા છે. [1]'}}]}
        with patch.dict(os.environ, {'GROQ_API_KEY': 'test-placeholder', 'LLM_MODEL': 'test-model'}), patch.object(translation, '_retry_after', 0), patch('backend.translation.requests.post', return_value=response):
            with self.assertRaises(RuntimeError):
                translation.groq_translate('Assistance is 100 rupees. [1]', 'gu')

    def test_cloud_translation_keeps_citation(self):
        response = Mock()
        response.json.return_value = {'choices': [{'finish_reason': 'stop', 'message': {'content': 'મદદ 100 રૂપિયા છે. [1]'}}]}
        with patch.dict(os.environ, {'GROQ_API_KEY': 'test-placeholder', 'LLM_MODEL': 'test-model'}), patch.object(translation, '_retry_after', 0), patch('backend.translation.requests.post', return_value=response):
            self.assertEqual(translation.groq_translate('Assistance is 100 rupees. [1]', 'gu'), 'મદદ 100 રૂપિયા છે. [1]')

    def test_disabled_semantic_search_never_initializes_ollama(self):
        with patch.dict(os.environ, {'SEMANTIC_ENABLED': 'false'}), patch('backend.rag.OllamaEmbeddings', side_effect=AssertionError('No local model on hosted demo')):
            retriever = RAGRetriever([], enabled=True)
            retriever._maybe_reconnect_vectors()
            self.assertIsNone(retriever.vector_store)
