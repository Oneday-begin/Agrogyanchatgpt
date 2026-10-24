# Credential handling and audit

## Where credentials belong

Keep production values only in Render's Environment settings. Use an ignored
local `.env` for local development. The tracked `.env.example` must have empty
API key, password, password hash and database connection fields.

Never paste real credentials into source, reports, screenshots, Git commit
messages, issue descriptions or chat. A password or API key that has been
shared should be replaced at its provider, even if a source scan is clean.

## Protections configured on 25 October 2026

- GitHub secret scanning and secret scanning push protection are enabled for
  `Oneday-begin/Agrogyanchatgpt`. These detect supported credential formats;
  they do not detect every arbitrary password or private record.
- Ignore rules exclude environment files, local databases, private keys,
  credential configuration files, previews, audit output and the local nested
  `Agrogyanchatgpt/` checkout. Ignoring that duplicate does not delete it.
- `.githooks/pre-commit` inspects the exact staged bytes, rather than merely
  the working file. `.githooks/pre-push` inspects the commits being uploaded,
  including credentials that were deleted again before the final commit.
- `tools/check_credentials.py` rejects private database/key/config paths,
  recognizes several API key formats, and checks literal credentials and
  credential-bearing database URLs. It prints locations and rule names only.
- Public deployment database archives are allowed only at their two known
  paths, with exactly the `gr_documents` or `pages` table respectively. Their
  text cells are also scanned. Report and knowledge PDF text is extracted and
  checked with pypdf.
- The `Credential protection` GitHub Actions workflow runs current-file and
  new-history checks plus checksum-verified Gitleaks with standard provider
  rules and an additional low-entropy administrator password rule. It receives
  no production credentials and has read-only repository permissions. A CI
  failure is a warning after upload; local hooks and GitHub push protection are
  the controls that can stop an upload before it succeeds.

## Enable the local checks after every new clone

From the repository root, after installing the application requirements:

```powershell
git config --local core.hooksPath .githooks
python tools/check_credentials.py
python tools/test_check_credentials.py
```

Python and pypdf must be available to the Python executable used by Git hooks.
The hooks fail closed if checking cannot finish. Do not use `--no-verify` to
bypass a failure. Keep the filename/rule output private while investigating;
do not post the contents of a suspicious file. Removing a leaked credential
from the latest file alone does not remove older committed copies.

The checks are deliberately conservative, not a mathematical guarantee that
all secrets are absent. Synthetic login passwords in unit tests and three
known password-label translation keys are narrowly exempted from the generic
literal rule. Provider-key detection still scans those files.

## Audit findings before historical cleanup

The current tracked application snapshot passed the credential checks. The
audit also inspected 23 reachable local commits and 956 historical file blobs.
Standard Gitleaks rules found no supported provider keys; the additional
project rule identified an old administrator password. No credential values
are recorded here.

The audit also removed an obsolete email-based exception from the current
admin page. Its page-level check now requires the administrator role; backend
administrator endpoints continue to enforce the authenticated server role.

Historical findings still requiring removal:

1. Earlier versions of `backend/main.py` contain a literal administrator
   password. Associated hardcoded administrator login identifiers should also
   be scrubbed from historical text and compiled artifacts containing them.
2. Two old `agrogyan.db` snapshots contain user records, password fields,
   community records and, in one snapshot, private query/farm information.
   These snapshots must be removed from history, including historical editor
   backups and compiled caches that could retain old credentials.

The public GR deployment archives are separate from the application database;
they contain only the approved farming-document tables and are retained.

History cleanup must be reviewed before replacing GitHub's existing branch:
commit identifiers change, and other clones must be cleaned or re-cloned to
avoid restoring the old data. Rotate old/reused administrator credentials and
any user passwords affected by the old database exposure. Do not assume
password hashes make a published user database safe.

GitHub recommends revoking/rotating exposed credentials first. A force push
does not erase somebody else's clone, download, cached view, or unrelated
repository. See [GitHub's sensitive-data removal instructions](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
