# AgroGyanGPT 🌱

A multilingual agricultural assistant with source-backed chat, government-resolution and PDF retrieval, farm profiles, weather information, and community tools.

AgroGyanGPT combines a FastAPI backend with an HTML, CSS, and JavaScript frontend. It uses local Ollama models by default and can return cited extracts when model-assisted answers are unavailable. The project is under active development; some advisory and commerce modules are foundations rather than complete services.

## Features

| Area | Current capabilities |
| --- | --- |
| Agricultural chat | Retrieval over curated references, state knowledge pages, PDFs, and imported government resolutions (GRs), with source links and evidence checks. |
| Regional languages | English, Hindi, Marathi, and Gujarati; script detection and local translation, with optional Google Translation. |
| Document tools | Text extraction from PDFs and scanned images using OCR; document insights and image-text questions. |
| Chat workspace | Separate conversations, saved history, drafts, language preferences, and source links stored in the browser. |
| Farm information | Farm profiles, crop and season context, weather information, market observations, and scheme-related assistance. |
| Community | Posts, comments, reactions, and community insights. |
| Accounts | OTP registration through a configured delivery provider, password hashing, revocable session cookies, and configurable admin access. |
| Marketplace | Inventory, produce listings, order records, and demand signals; payment and fulfilment services are not established by these records. |

## Technology

- **Backend:** Python, FastAPI, Uvicorn, SQLAlchemy.
- **Frontend:** HTML, CSS, and vanilla JavaScript, served by FastAPI.
- **Data:** SQLite by default; PostgreSQL supported through `DATABASE_URL`.
- **Retrieval:** Ollama embeddings, a persistent vector index, and BM25 keyword retrieval.
- **Local models:** `qwen3:0.6b` for answers, `embeddinggemma` for embeddings, and `translategemma:4b` for translation.
- **Documents:** PyMuPDF, pypdf, Pillow, and Tesseract OCR.
- **Optional integrations:** OpenAI or Gemini generation, Google Translation, Twilio OTP delivery, Open-Meteo weather, and configured market-data sources.

## Repository structure

```text
Agrogyanchatgpt/
├── README.md
├── .gitignore
├── start_agrogyan.bat           # Windows launcher from the repository root
└── agrogyan-gpt-main/           # Run Python commands from this directory
    ├── .env.example
    ├── README.md               # Additional retrieval and operational notes
    ├── requirements.txt
    ├── requirements-dev.txt
    ├── render.yaml
    ├── start_agrogyan.bat
    ├── backend/
    │   ├── main.py             # FastAPI routes and frontend serving
    │   ├── database.py         # Database engine and sessions
    │   ├── security.py         # Session authorization
    │   ├── passwords.py        # Password hashing and verification
    │   ├── rag.py              # Retrieval and answer orchestration
    │   ├── vector_store.py     # Persistent embeddings and search
    │   ├── translation.py
    │   ├── pdf_ingestion.py
    │   ├── document_processing.py
    │   ├── knowledge/          # Curated references and generated indexes
    │   └── knowledge_imports/  # Bundled source PDFs
    ├── frontend/               # Login, home, chat, farm, market, community
    └── tests/
```

Local databases, downloaded model/OCR resources, external GR checkouts, uploads, and backups are generated or supplied separately. A fresh clone does not include every document or index from a developer's machine.

## Run locally

### 1. Prepare the environment

Use Python 3.12 for the setup below. Install Git, Ollama, and Tesseract OCR. Start Ollama, and ensure the `tesseract` executable is on your `PATH`.

```powershell
git clone https://github.com/Oneday-begin/Agrogyanchatgpt.git
cd Agrogyanchatgpt/agrogyan-gpt-main
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` for the services you intend to use. The API loads this file at startup. Standalone setup/indexing commands read process environment variables; export custom model settings in your shell before running those commands.

### 2. Prepare local models and the knowledge index

With Ollama running:

```powershell
python -m backend.setup_rag
ollama pull translategemma:4b
python -m backend.build_vector_index
```

`setup_rag` downloads missing answer and embedding models, checks Tesseract, and downloads English, Hindi, Marathi, and Gujarati OCR language data. The translation model is installed separately. Initial downloads and indexing can take time and require internet access.

### 3. Start the application

```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000/** for the login page. After signing in, use the home page and the chat workspace at `/chat.html`.

Check **http://127.0.0.1:8000/health** for database and knowledge readiness. `/health?deep=true` also checks model availability and includes ingestion detail. Corpus counts depend on the documents imported on that installation.

**Windows shortcut:** after configuring `.env`, run `start_agrogyan.bat` from the repository root. It creates a `venv`, installs dependencies, runs model/OCR setup, and starts the API. Use the explicit indexing and translation-model commands above when preparing or updating those resources.

## Configuration

Keep real settings in the ignored `agrogyan-gpt-main/.env` file. Commit only templates with empty values or placeholders.

| Setting | Purpose |
| --- | --- |
| `LLM_PROVIDER` | `ollama` by default; `openai` and `gemini` are optional configured providers. |
| `OLLAMA_URL`, `OLLAMA_MODEL` | Local Ollama address and answer model. |
| `EMBEDDING_MODEL` | Local embedding model; defaults to `embeddinggemma`. |
| `TRANSLATION_MODEL` | Local translation model; defaults to `translategemma:4b`. |
| `LLM_MODEL`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | Model and credentials for optional cloud generation. |
| `GOOGLE_TRANSLATE_API_KEY` | Optional Google Translation credentials. |
| `DATABASE_URL` | Database override; defaults to local `agrogyan.db`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_NAME` | Configure admin access; use a password hash, not a plaintext password. |
| `OTP_PROVIDER` | Defaults to `mock`, which does not deliver registration codes; configure a real transport for registration. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` | Credentials and sender settings for Twilio delivery. |
| `COOKIE_SECURE` | Set to `true` when serving behind HTTPS. |
| `CORS_ORIGINS` | Comma-separated additional frontend origins when needed. |
| `DATA_GOV_API_KEY`, `AGMARKNET_RESOURCE_ID` | Optional market-data configuration. |
| `EMBEDDING_QUERY_TIMEOUT_SECONDS`, `RAG_MAX_CONTEXT_CHUNKS` | Bound embedding-query waits and retrieved context size. |

Generate an admin password hash locally from the application directory, then paste the resulting hash into `ADMIN_PASSWORD_HASH` in `.env`:

```powershell
python -c "from getpass import getpass; from backend.passwords import hash_password; print(hash_password(getpass('Admin password: ')))"
```

The password prompt hides input. Never commit plaintext passwords or `.env`. Credentials found in older commits must still be rotated; `.gitignore` does not remove them from history.

## Maintain the knowledge base

Curated questions and aliases live in `backend/knowledge/farming_reference.json`. Preserve primary source URLs when adding references. Bundled PDFs live in `backend/knowledge_imports/`; the loader also reads state knowledge pages and any locally imported GR catalog.

The Maharashtra GR importer expects a separate local checkout containing a `GRs` directory. Inspect the options and preview candidates before applying an import:

```powershell
python -m backend.import_maharashtra_grs --help
python -m backend.import_maharashtra_grs --repository backend/external/mahGRs
```

The command previews by default; add `--apply` after reviewing candidates to write the catalog. Keep agriculture-subject and extraction-quality filtering enabled. Preserve original source links and page metadata.

After editing references or importing documents:

```powershell
python -m backend.build_vector_index
```

Restart the API to reload its corpus. Existing unchanged embeddings are reused.

## Tests

From `agrogyan-gpt-main/`, with the virtual environment active:

```powershell
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```

Tests cover retrieval, API behavior, security, multilingual presentation, GR imports, and translation. External transports may be mocked; test success does not verify live SMS delivery, paid-provider access, or installed local-model readiness.

## Deployment and limitations

- `agrogyan-gpt-main/render.yaml` provides a Render service configuration. Set the service root to `agrogyan-gpt-main` so its dependency and startup commands resolve correctly. Supply credentials through the hosting environment.
- A hosted API needs reachable model services or a configured cloud provider for generated answers. Local Ollama installations and ignored knowledge indexes are not deployed automatically.
- Use HTTPS and secure cookies for hosted access. The in-process rate limiter needs a shared replacement for multi-worker deployments. Session storage is separate from the main application database.
- When generation or embeddings are unavailable, the assistant can use local keyword retrieval and labelled extracts. Missing evidence results in abstention or related excerpts rather than a verified answer.
- Chat conversations stay in the current browser, scoped by user or guest; they do not sync across devices.
- Translation checks help preserve numbers and citations, but names and meaning still need comparison with original sources.
- Weather and market information depend on available sources; reference prices and unavailable feeds are labelled. The application does not establish validated yield, profit, disease-diagnosis, or delivery guarantees.
- Cancelling a chat request stops the browser from waiting; a local model call already running may continue in the background.

## Authors

Harsh Shah, Hitanshi Jain, Divyansh Kanti, and Diya Mehtalia.
