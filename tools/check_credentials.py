"""Offline Git credential gate. Findings contain locations only, never values.

This supplements GitHub push protection and Gitleaks; it cannot prove that every
possible secret is absent. No credentials are sent to external services.
"""
import argparse
import gzip
import io
import logging
from pathlib import Path, PurePosixPath
import re
import sqlite3
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
logging.getLogger('pypdf').setLevel(logging.CRITICAL)
TEMPLATES = {'.env.example', '.env.sample', '.env.template'}
PUBLIC_DATABASES = {
    'agrogyan-gpt-main/deploy/knowledge/gr_catalog.sqlite3.gz': {'gr_documents'},
    'agrogyan-gpt-main/deploy/knowledge/pdf_pages.sqlite3.gz': {'pages'},
}
PATTERNS = {
    'private-key': re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'),
    'provider-api-key': re.compile(r'\b(?:gsk_[A-Za-z0-9]{20,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sb_secret_[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b'),
    'database-credentials': re.compile(r'(?i)\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s/@:]+:[^\s@]+@[^\s]+'),
    'jwt-token': re.compile(r'\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b'),
    'hardcoded-email-access-check': re.compile(r'''\bemail\s*(?:===|!==|==|!=)\s*["'][^"'\s]+@'''),
}
ASSIGNMENT = re.compile(
    r'''(?ix)\b([a-z0-9_]*(?:password|passwd|api_key|apikey|client_secret|secret_key|access_token|auth_token|database_url)[a-z0-9_]*)\b["']?\s*(?::|={1,3})\s*(["'])([^\r\n"']{3,})\2'''
)
PLACEHOLDER = re.compile(r'(?i)^(?:test[-_]|fake[-_]|dummy[-_]|example|placeholder|your[-_\s]|<|\$\{|\{\{|changeme|replace[-_])')


def git(*args):
    # Do not forward Git stderr: a malformed remote may contain a password.
    result = subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True)
    if result.returncode:
        raise RuntimeError('Git operation failed; raw output suppressed for privacy')
    return result.stdout


def forbidden_path(path):
    p = PurePosixPath(path)
    name = p.name.lower()
    if name in TEMPLATES:
        return False
    if path in PUBLIC_DATABASES:
        return False
    return (
        name == '.env' or name.startswith('.env.')
        or name in {'.npmrc', '.pypirc', '.netrc', '.pgpass', 'credentials.json', 'application_default_credentials.json'}
        or name.startswith(('service-account', 'service_account', 'client_secret', 'id_rsa', 'id_ed25519'))
        or name.endswith(('.db', '.sqlite', '.sqlite3', '.db.gz', '.sqlite.gz', '.sqlite3.gz', '.pem', '.key', '.p12', '.pfx', '.keystore', '.jks', '.dump', '.bak', '.sql', '.tfstate'))
        or any(part in {'.git', '.history', '__pycache__', 'output', 'backups'} for part in p.parts)
        or path.startswith('Agrogyanchatgpt/')
    )


def text_findings(path, text):
    result = set()
    for line_number, line in enumerate(text.splitlines(), 1):
        for rule, pattern in PATTERNS.items():
            if pattern.search(line):
                result.add((path, line_number, rule))
        for match in ASSIGNMENT.finditer(line):
            name, _, value = match.groups()
            if path == 'agrogyan-gpt-main/frontend/i18n.js' and name in {'passwordPlaceholder', 'enterEmailPassword', 'passwordTooShort'}:
                continue
            # Ordinary synthetic login passwords in unit tests are deliberate.
            # API key/provider patterns still run on every test file.
            if '/tests/' in '/' + path and name.lower() in {'password', 'passwd'}:
                continue
            if not PLACEHOLDER.match(value) and not value.startswith(('sqlite:', 'http://127.0.0.1', 'http://localhost')):
                result.add((path, line_number, 'literal-credential'))
        if PurePosixPath(path).name in TEMPLATES and '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            if re.search(r'(?i)(?:api_key|password|secret|access_token|auth_token|database_url)', key) and value.strip().strip('"\''):
                result.add((path, line_number, 'nonempty-secret-template'))
    return result


def scan(path, data):
    if forbidden_path(path):
        return {(path, 0, 'private-or-local-file')}
    if path in PUBLIC_DATABASES:
        try:
            db = sqlite3.connect(':memory:')
            db.deserialize(gzip.decompress(data))
            tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if tables != PUBLIC_DATABASES[path]:
                return {(path, 0, 'unexpected-public-database-tables')}
            findings = set()
            for table in tables:
                for row in db.execute('SELECT * FROM "' + table + '"'):
                    for cell in row:
                        if isinstance(cell, str):
                            findings.update(text_findings(path, cell))
            return findings
        except Exception:
            return {(path, 0, 'public-database-check-failed')}
        finally:
            if 'db' in locals():
                db.close()
    if path.lower().endswith('.pdf'):
        try:
            from pypdf import PdfReader
            return text_findings(path, '\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(data)).pages))
        except ImportError:
            raise RuntimeError('PDF checks require pypdf: install the project requirements') from None
        except Exception:
            return {(path, 0, 'pdf-check-failed')}
    if path.lower().endswith(('.zip', '.7z', '.tar', '.gz', '.pkl', '.pickle')):
        return {(path, 0, 'unreviewed-archive')}
    # Scan binary strings too, including accidental keys in binary assets.
    return text_findings(path, data.decode('utf-8', errors='replace'))


def object_findings(entries):
    findings = set()
    with subprocess.Popen(['git', '-C', str(ROOT), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as process:
        try:
            for oid, path in entries:
                process.stdin.write((oid + '\n').encode())
                process.stdin.flush()
                parts = process.stdout.readline().split()
                if len(parts) != 3:
                    raise RuntimeError('Cannot read Git object')
                data = process.stdout.read(int(parts[2]))
                process.stdout.read(1)
                if parts[1] == b'blob':
                    findings.update(scan(path, data))
        finally:
            process.stdin.close()
        process.wait()
    return findings


def scan_range(revision):
    entries = []
    for line in git('rev-list', '--objects', revision, '--').decode().splitlines():
        oid, _, path = line.partition(' ')
        if path:
            entries.append((oid, path))
    findings = object_findings(entries)
    findings.update(text_findings('commit-messages', git('log', '--format=%B', revision, '--').decode(errors='replace')))
    return findings


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--staged', action='store_true', help='Scan exact index contents before committing')
    mode.add_argument('--range', dest='revision', help='Scan every added blob and message in a Git revision range')
    mode.add_argument('--pre-push', action='store_true', help='Read Git pre-push ref updates from stdin')
    args = parser.parse_args(argv)
    if args.staged:
        entries = []
        for record in git('ls-files', '--stage', '-z').decode().split('\0'):
            if record:
                meta, path = record.split('\t', 1)
                filemode, oid, stage = meta.split()
                if stage != '0' or filemode == '160000':
                    raise RuntimeError('Unmerged files or nested repository cannot pass this check')
                entries.append((oid, path))
        findings = object_findings(entries)
    elif args.revision:
        findings = scan_range(args.revision)
    elif args.pre_push:
        findings = set()
        for line in sys.stdin:
            _, local_oid, _, remote_oid = line.split()
            if set(local_oid) == {'0'}:
                continue
            revision = local_oid if set(remote_oid) == {'0'} else remote_oid + '..' + local_oid
            findings.update(scan_range(revision))
    else:
        findings = set()
        for path in git('ls-files', '-z').decode().split('\0'):
            if path and (ROOT / path).is_file():
                findings.update(scan(path, (ROOT / path).read_bytes()))
    for path, line, rule in sorted(findings):
        print(f'BLOCKED {path}:{line} [{rule}] (value hidden)')
    print(f'Credential check: {len(findings)} finding(s). Values are never printed.')
    return 1 if findings else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        detail = str(error) if isinstance(error, RuntimeError) else type(error).__name__ + ' (details suppressed)'
        print('Credential check could not complete:', detail, file=sys.stderr)
        sys.exit(2)
