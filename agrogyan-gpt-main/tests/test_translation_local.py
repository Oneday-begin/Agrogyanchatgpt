"""Local translation must preserve evidence metadata and fail without inventing it."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import requests

from backend import translation


class LocalTranslationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.cache = patch.object(translation, 'CACHE_PATH', Path(self.directory.name) / 'translations.db')
        self.cache.start()
        self.addCleanup(self.cache.stop)
        self.environment = patch.dict(os.environ, {'GOOGLE_TRANSLATE_API_KEY': '', 'TRANSLATION_MODEL': 'test-local'})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.request_patch = patch.object(translation.requests, 'post')
        self.request = self.request_patch.start()
        self.addCleanup(self.request_patch.stop)
        translation.translate_cached.cache_clear()
        translation._local_retry_after = 0
        self.addCleanup(translation.translate_cached.cache_clear)
        self.addCleanup(setattr, translation, '_local_retry_after', 0)

    def reply(self, value, reason='stop'):
        self.request.return_value.json.return_value = {'message': {'content': value}, 'done_reason': reason}

    def test_trailing_source_citations_are_preserved_without_model_reproduction(self):
        self.reply('ટ્રેક્ટર માટે 50% અથવા રૂ. 1.25 લાખની સબસિડી મળે છે.')
        answer = translation.translate_cached('Tractor subsidy is 50% or Rs. 1.25 lakh. [1] [2]', 'gu')
        self.assertTrue(answer.endswith('[1] [2]'))
        self.assertNotIn('[1]', self.request.call_args.kwargs['json']['messages'][0]['content'])

    def test_internal_citations_cannot_be_lost(self):
        self.reply('પ્રથમ યોજના. બીજી યોજના.')
        with self.assertRaises(RuntimeError):
            translation.translate_cached('First scheme [1]. Second scheme [2]', 'gu')

    def test_changed_amount_fails_and_is_not_cached(self):
        text = 'The subsidy limit is Rs. 1.25 lakh. [1]'
        self.reply('સબસિડીની મર્યાદા રૂ. 2.25 લાખ છે.')
        with self.assertRaises(RuntimeError):
            translation.translate_cached(text, 'gu')
        self.reply('સબસિડીની મર્યાદા રૂ. 1.25 લાખ છે.')
        self.assertTrue(translation.translate_cached(text, 'gu').endswith('[1]'))
        self.assertEqual(self.request.call_count, 2)

    def test_indic_digits_and_internal_reference_ids_are_checked_and_normalized(self):
        self.reply('સબસિડી ૫૦% છે [૧]. અરજી કરો.')
        answer = translation.translate_cached('Subsidy is 50% [1]. Apply now. [2]', 'gu')
        self.assertIn('[1]', answer)
        self.assertTrue(answer.endswith('[2]'))

    def test_marathi_script_is_not_misclassified_as_hindi_output(self):
        self.reply('अर्ज सादर करावा.')
        answer = translation.translate_cached('Submit the application.', 'mr')
        self.assertEqual(answer, 'अर्ज सादर करावा.')

    def test_explicit_source_overrides_ambiguous_devanagari_detection(self):
        self.reply('आवेदन जमा करें.')
        answer = translation.translate_cached('अर्ज सादर करा.', 'hi', 'mr')
        self.assertEqual(answer, 'आवेदन जमा करें.')
        prompt = self.request.call_args.kwargs['json']['messages'][0]['content']
        self.assertIn('Marathi (mr) to Hindi (hi)', prompt)

    def test_network_timeout_has_short_cooldown_but_static_greeting_still_works(self):
        self.request.side_effect = requests.Timeout
        with self.assertRaises(RuntimeError):
            translation.translate_cached('First agricultural question', 'gu')
        with self.assertRaises(RuntimeError):
            translation.translate_cached('Second agricultural question', 'gu')
        self.assertEqual(self.request.call_count, 1)
        self.assertEqual(translation.translate_cached('hi', 'gu'), 'નમસ્તે')

    def test_persistent_cache_avoids_repeat_model_work(self):
        self.reply('ખેડૂત અરજી કરી શકે છે.')
        first = translation.translate_cached('The farmer can apply.', 'gu')
        translation.translate_cached.cache_clear()
        self.assertEqual(translation.translate_cached('The farmer can apply.', 'gu'), first)
        self.assertEqual(self.request.call_count, 1)

    def test_cache_is_specific_to_translation_model(self):
        self.reply('ખેડૂત અરજી કરી શકે છે.')
        translation.translate_cached('The farmer can apply.', 'gu')
        translation.translate_cached.cache_clear()
        with patch.dict(os.environ, {'TRANSLATION_MODEL': 'different-local'}):
            translation.translate_cached('The farmer can apply.', 'gu')
        self.assertEqual(self.request.call_count, 2)

    def test_wrong_script_and_truncation_are_rejected(self):
        for value, reason in [('This is mostly an English answer with one word માટી.', 'stop'),
                              ('ખેડૂત અરજી કરી શકે છે.', 'length')]:
            with self.subTest(value=value):
                self.reply(value, reason)
                with self.assertRaises(RuntimeError):
                    translation.translate_cached('The farmer can apply.', 'gu')

    def test_static_soil_translation_does_not_discard_extra_source_sentence(self):
        text = "Soil is the loose mineral and organic material at the Earth's surface in which land plants grow. Test the soil before applying fertilizer. [1]"
        self.reply('માટી પૃથ્વીની સપાટી પર છે. ખાતર નાખતા પહેલાં માટીનું પરીક્ષણ કરો.')
        answer = translation.translate_cached(text, 'gu')
        self.request.assert_called_once()
        self.assertIn('પરીક્ષણ', answer)
        self.assertTrue(answer.endswith('[1]'))


if __name__ == '__main__':
    unittest.main()
