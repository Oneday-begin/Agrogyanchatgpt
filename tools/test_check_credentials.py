"""Regression checks for credential leakage prevention, using synthetic values."""
import gzip
import importlib.util
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('credential_gate', Path(__file__).with_name('check_credentials.py'))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class CredentialGateTests(unittest.TestCase):
    def test_sensitive_filenames(self):
        for path in ['.env', 'backend/.env.production', 'backend/agrogyan.db', 'credentials.json', 'server.pem', 'output/screenshots.json', 'Agrogyanchatgpt/.git']:
            with self.subTest(path=path):
                self.assertTrue(gate.scan(path, b'no secret text required'))

    def test_empty_environment_template(self):
        self.assertFalse(gate.scan('.env.example', b'GROQ_API_KEY=\nDATABASE_URL=\n'))
        field = b'GROQ_' + b'API_KEY'
        self.assertTrue(gate.scan('.env.example', field + b'=' + b'not-a-real-value'))

    def test_realistic_provider_format_even_inside_tests(self):
        value = 'gsk_' + 'A' * 40
        self.assertTrue(gate.scan('app/tests/fixture.py', value.encode()))

    def test_password_and_database_uri(self):
        code = 'ADMIN_PASSWORD' + ' = ' + repr('synthetic-private-value')
        uri = 'postgresql://' + 'user:synthetic-private-value@localhost/db'
        self.assertTrue(gate.scan('backend/main.py', code.encode()))
        self.assertTrue(gate.scan('settings.txt', uri.encode()))

    def test_private_key_header(self):
        header = '-----BEGIN ' + 'PRIVATE KEY-----'
        self.assertTrue(gate.scan('settings.txt', header.encode()))

    def test_public_database_cannot_contain_users(self):
        db = sqlite3.connect(':memory:')
        db.execute('CREATE TABLE users (password TEXT)')
        packed = gzip.compress(db.serialize())
        db.close()
        path = 'agrogyan-gpt-main/deploy/knowledge/gr_catalog.sqlite3.gz'
        self.assertTrue(gate.scan(path, packed))

    def test_public_database_text_is_scanned(self):
        db = sqlite3.connect(':memory:')
        db.execute('CREATE TABLE pages (content TEXT)')
        db.execute('INSERT INTO pages VALUES (?)', ('gsk_' + 'B' * 40,))
        packed = gzip.compress(db.serialize())
        db.close()
        path = 'agrogyan-gpt-main/deploy/knowledge/pdf_pages.sqlite3.gz'
        self.assertTrue(gate.scan(path, packed))

    def test_findings_never_contain_secret_value(self):
        secret = 'gsk_' + 'C' * 40
        result = gate.scan('example.js', secret.encode())
        self.assertNotIn(secret, repr(result))
        self.assertTrue(result)

    def test_exact_staging_and_deleted_secret_in_history(self):
        original_root = gate.ROOT
        temp_parent = original_root / 'tmp'
        temp_parent.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temp_parent) as folder:
            repo = Path(folder)

            def git(*args):
                return subprocess.check_output(['git', '-C', folder, *args], stderr=subprocess.DEVNULL)

            try:
                git('init', '-q')
                git('config', 'user.name', 'Credential gate test')
                git('config', 'user.email', 'test@example.invalid')
                git('config', 'core.hooksPath', 'disabled-hooks')
                gate.ROOT = repo
                target = repo / 'settings.txt'
                target.write_text('safe initial content')
                git('add', 'settings.txt')
                git('commit', '-qm', 'Initial test snapshot')
                base = git('rev-parse', 'HEAD').decode().strip()
                synthetic = 'gsk_' + 'D' * 40
                target.write_text(synthetic)
                git('add', 'settings.txt')
                oid = git('rev-parse', ':settings.txt').decode().strip()
                target.write_text('safe unstaged content')
                self.assertTrue(gate.object_findings([(oid, 'settings.txt')]))
                git('commit', '-qm', 'Synthetic fixture commit')
                git('add', 'settings.txt')
                git('commit', '-qm', 'Remove synthetic fixture')
                self.assertTrue(gate.scan_range(base + '..HEAD'))
                self.assertFalse(gate.scan('settings.txt', target.read_bytes()))
            finally:
                gate.ROOT = original_root


if __name__ == '__main__':
    unittest.main()
