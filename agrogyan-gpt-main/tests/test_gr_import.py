import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from backend.import_maharashtra_grs import AGRICULTURE, import_repository, load_gr_documents, parse_pages
from backend.passwords import hash_password, verify_password


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.folder=self.root/'GRs'/AGRICULTURE
        self.folder.mkdir(parents=True)
        self.path=self.folder/'201803161624182101.pdf.en.txt'
        self.text='# Page 1\nOrganic farming support\nGovernment Resolution No: TEST-1\nDate: 16 March 2018\nSupport is described for farmers.\n# Page 2\nConditions apply to the support programme.'
        self.path.write_text(self.text,encoding='utf-8')
        self.catalog=self.root/'catalog.sqlite3'
        self.git=patch('backend.import_maharashtra_grs.subprocess.run',return_value=SimpleNamespace(stdout='abc123\n'))
        self.git.start()

    def tearDown(self):
        self.git.stop();self.temp.cleanup()

    def test_preview_does_not_write_and_import_is_idempotent(self):
        report=import_repository(self.root,self.catalog,apply=False)
        self.assertEqual(report['documents'],1)
        self.assertFalse(self.catalog.exists())
        self.assertEqual(import_repository(self.root,self.catalog,apply=True)['created'],1)
        self.assertEqual(import_repository(self.root,self.catalog,apply=True)['unchanged'],1)
        docs,stats=load_gr_documents(self.catalog)
        self.assertEqual(stats['documents'],1)
        self.assertEqual({d['page'] for d in docs},{1,2})
        self.assertIn('/abc123/',docs[0]['repository_url'])
        self.assertEqual(docs[0]['provenance'],'machine_translation')
        self.assertTrue(docs[0]['source_url'].endswith('201803161624182101.pdf'))

    def test_partial_or_missing_pages_are_rejected(self):
        for text in ('no markers','# Page 1\ntext\n# Page 3\ntext','# Page 1\ntext\n# Page 2\n'):
            with self.assertRaises(ValueError):parse_pages(text)
        self.path.write_text('# Page 1\ntext\n# Page 3\ntext',encoding='utf-8')
        report=import_repository(self.root,self.catalog,apply=True)
        self.assertEqual(report['documents'],0)
        self.assertEqual(len(report['errors']),1)

    def test_long_government_identifiers_are_supported(self):
        self.path.rename(self.folder/'20250509144705046801.pdf.en.txt')
        self.assertEqual(import_repository(self.root,self.catalog,apply=True)['documents'],1)

    def test_wrapped_subject_is_checked_before_government_header(self):
        self.path.write_text('# Page 1\nTaluka seed centre\nConstruction of a defence wall\nGovernment of Maharashtra\nFarmers receive seeds.',encoding='utf-8')
        self.assertEqual(import_repository(self.root,self.catalog,apply=True)['documents'],0)
        self.path.write_text('# Page 1\nApproval for implementation of\nOrganic farming support\n| Government of Maharashtra |\nConditions apply.',encoding='utf-8')
        self.assertEqual(import_repository(self.root,self.catalog,apply=True)['documents'],1)
        docs,_=load_gr_documents(self.catalog)
        self.assertEqual(docs[0]['title'],'Approval for implementation of Organic farming support')

    def test_agriculture_department_does_not_approve_unrelated_subjects(self):
        from backend.gr_scope import farming_scope
        for title in ['Service road land transfer to Municipal Corporation','Temporary posts under Agriculture Commissionerate','Appointment of agriculture officers','Annual department accounts','Periodic transfers of Officers in the cadre of Livestock Development Officer','Printing of Farmers Magazine','New posts for PoCRA project','Office address for Livestock Development Board','Compensation for fishermen affected by a marine project','Construction of a defence wall at a seed centre']:
            self.assertFalse(farming_scope(title)[0],title)
        for title in ['Crop insurance support for farmers','Organic farming subsidy','Minimum support price for cotton','Animal disease control programme','Fodder production scheme','Nanaji Deshmukh Krishi Sanjeevani Project','Fish farming and fish seed production']:
            self.assertTrue(farming_scope(title)[0],title)
        self.path.write_text(self.text.replace('Organic farming support','Service road transfer to Municipal Corporation'),encoding='utf-8')
        report=import_repository(self.root,self.catalog,apply=True)
        self.assertEqual(report['documents'],0)
        self.assertEqual(len(report['out_of_scope']),1)

    def test_salted_hashes_and_legacy_verification(self):
        import hashlib
        first,second=hash_password('secret'),hash_password('secret')
        self.assertNotEqual(first,second)
        self.assertTrue(verify_password('secret',first))
        self.assertFalse(verify_password('wrong',first))
        self.assertTrue(verify_password('old',hashlib.sha256(b'old').hexdigest()))

    def test_original_uses_paired_subject_and_removes_previous_false_match(self):
        original=self.folder/'201803161624182101.pdf.mr.txt'
        original.write_text('# Page 1\nशेती सहाय्य\nमहाराष्ट्र शासन\nमाहिती.',encoding='utf-8')
        self.assertEqual(import_repository(self.root,self.catalog,languages=('en','mr'),apply=True)['documents'],2)
        docs,stats=load_gr_documents(self.catalog)
        self.assertEqual(stats['documents'],1)
        self.assertEqual(stats['source_language_records'],2)
        self.assertEqual({d['language'] for d in docs},{'English'})
        self.assertIn('शेती सहाय्य', docs[0]['retrieval_aliases'])
        self.assertNotIn('शेती सहाय्य', docs[0]['content'])
        self.path.write_text('# Page 1\nSeed centre\nConstruction of a defence wall\nGovernment of Maharashtra\nDetails.',encoding='utf-8')
        report=import_repository(self.root,self.catalog,languages=('en','mr'),apply=True)
        self.assertEqual(report['documents'],0)
        self.assertEqual(load_gr_documents(self.catalog)[1]['documents'],0)


if __name__=='__main__':unittest.main()
