# Free demonstration deployment

This configuration uses Render Free, a separate Supabase Free PostgreSQL project,
and Groq Free. Do not add payment details or upgrade any plan. Free services can
sleep, pause or rate-limit requests. This is a demonstration configuration, not an
uptime guarantee. Provider policies can change.

## Setup

1. Create `agrogyan-demo` in a FREE Supabase organization. Disable **Enable Data API**
   and **Automatically expose new tables**: this app connects through its backend,
   not through Supabase public client APIs. Keep the database password private.
2. In Connect, copy the PostgreSQL **session pooler** connection string (IPv4,
   port 5432). Substitute the URL-encoded password and require SSL (`sslmode=require`).
3. In Groq, use a Free account/project and create a restricted project API key.
   Configure keys privately in Render Environment, never in GitHub or chat.
4. Connect `Oneday-begin/Agrogyanchatgpt` in Render. Use the root `render.yaml`
   blueprint, or configure a Python Web Service with root directory
   `agrogyan-gpt-main`, instance **Free**, and the commands/environment below.
5. Set `DATABASE_URL` and `GROQ_API_KEY` privately. The blueprint sets the other values.
   Create a new demo login; local users and private farm histories are not copied.
6. Visit `/health`, `/login.html`, `/index.html`, and `/chat.html`. Test registration,
   login/logout, a cited answer in each language, and persistence after restart.

Build: `pip install -r requirements.txt && python -m backend.deployment_knowledge unpack`

Start: `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers`

## Data and retrieval

- App records and opaque sessions persist in Supabase PostgreSQL.
- Only public government/reference tables are shipped in `knowledge/*.gz`; hashes
  are verified when restoring them. User, session and translation databases are excluded.
- Rebuild after local GR updates with `python -m backend.deployment_knowledge pack`.
- Render uses BM25/native-language query aliases with Groq selecting exact evidence.
  `SEMANTIC_ENABLED=false` avoids trying to run Ollama on the small free instance.
  The local default still supports Ollama and its vector database.
- Groq translates supplied text with amount/citation/script checks. Those checks
  cannot prove translation meaning; compare important details to original sources.
- If cloud AI is unavailable or rate-limited, display cited extracts and translation
  availability notices. Never silently switch to a paid provider.
- Translation caches are disposable on Render. Conversation sidebars are browser-local.
- SMS/WhatsApp delivery is not needed with `BASIC_REGISTRATION=true`; phone numbers
  remain unverified. Email ownership is not verified by basic password registration.
- Weather needs network access/location; live mandi data needs its configured source.
  OCR uploads require Tesseract, which the Python free-host image does not install.
  Existing packaged PDF OCR text remains searchable. Commerce/expert/diagnosis
  features retain the limitations described in the placement report.

## Validation so far

98 existing and registration tests passed. Four additional mocked cloud-provider
checks passed. Browser checks at 390px and 320px found no horizontal overflow in
chat; the cited soil response and mobile history drawer worked. Hosted PostgreSQL,
live Groq translation and the public URL require deployment-time verification.

## Free-plan operations

Open the URL before demonstrating to allow a sleeping service to start. Resume a
paused Supabase project from its dashboard. Do not use artificial keep-alive jobs.
Use HTTPS and keep `COOKIE_SECURE=true`. Keep one worker for the in-process limiter.
Never expose API keys in frontend files. Do not enable Supabase Data API for these
tables without explicit row-level security policies.
