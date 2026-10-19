# agrogyan-gpt

AgroGyan uses a local PDF retrieval and LLM pipeline. See this README for
indexed coverage, verification, settings and current limitations.

Install dependencies, start Ollama, install Tesseract, then run:

```powershell
python -m backend.setup_rag
python -m backend.build_vector_index
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/index.html`.


## Configuration and verification

Copy `.env.example` to `.env` and configure only the services you intend to use. Never commit credentials.
Local Ollama remains the default (`qwen3:0.6b`, `embeddinggemma`). If unavailable, ranked local BM25 retrieval over the loaded SQLite GR/PDF corpus provides cited extracts. Extractive answers are labelled; missing evidence results in abstention. Cloud model selection uses the same exact-source validation.

Chat supports English, Hindi, Marathi and Gujarati, plus automatic script-based detection. Local translation uses `translategemma:4b` (`ollama pull translategemma:4b`); set `TRANSLATION_MODEL` to override it. Official Google Translation is optional. Original question/source text remains available for comparison. Translation checks preserve numbers and citations, but meaning and names still need comparison with the original; unavailable Gujarati translation produces a Gujarati notice. Cloud providers receive text only when explicitly configured.

Authentication now uses a revocable HttpOnly session cookie. Log in again after this update. Admin access requires ADMIN_EMAIL plus ADMIN_PASSWORD_HASH; the old hardcoded login is removed. Generate a hash locally using `backend.passwords.hash_password`, never store a plaintext admin password. Existing user hashes upgrade to bcrypt-SHA256 after successful login; records and existing schema remain intact. OTP registration requires a configured SMS/WhatsApp transport; codes are never returned to the browser.

Set COOKIE_SECURE=true behind HTTPS. This local server uses an in-process rate limiter; multi-worker deployments need a shared limiter. SQLite session storage is separate from agrogyan.db.

Weather uses Open-Meteo and the saved farm location or browser coordinates. Unavailable data is labelled. Stored seed market prices are labelled reference benchmarks. No automatic delivery completion, invented ROI, disease diagnosis or paid-expert response promise is provided. Crop decisions show dated district market observations and the registered season; they do not invent yield/cost forecasts.

### Add agriculture GRs

The mirror is `backend/external/mahGRs`; the importer applies conservative farming-subject and page-quality checks. Run `python -m backend.import_maharashtra_grs --help` to inspect import options before applying an update, then `python -m backend.build_vector_index` to embed new accepted passages. Existing unchanged embeddings are reused. Retain original PDF/source links and page metadata. Current known corpus: 662 Maharashtra GRs, 3 Gujarat GRs and one soil reference and 18 sourced farming Q&A entries (4,303 passages). Do not import unrelated administration or staffing GRs.

### Tests

`python -m unittest discover -s tests -v` uses a temporary database and mocks only external transports. Real SMS delivery and paid provider access require configured credentials. Local translation needs the installed TranslateGemma model, and may take several seconds on CPU. A consistent pre-remediation SQLite backup is in the ignored `backups` directory.

### Retrieval and responsiveness

Reviewed farming questions and native-language aliases use a cited lookup without model latency. Other questions use semantic search plus BM25, with question-intent checks so paperwork questions do not receive funding amounts or definitions receive budget mentions. When related evidence exists but a complete answer cannot be verified, it is displayed as related excerpts. Original citations and state/GR boundaries are retained. Embedding queries fall back to BM25 after a bounded wait.

Curated references live in `backend/knowledge/farming_reference.json`; each needs a question, aliases, content, and a primary source URL. After adding or editing entries, run `python -m backend.build_vector_index` and restart the app to load the new index. No fixed document limit is applied; more GRs should still pass the agriculture and extraction-quality filters.

The home page loads only its required data, suppresses decorative motion, batches chat scrolling and textarea resizing, and offers localized waiting/cancel/retry controls. Stop waiting cancels the browser request; a local model call already running may finish in the background.


### Chat workspace
Home is the landing page; the AgroGyanGPT top-bar link opens the dedicated chat.html conversation workspace. New chat creates a separate conversation; the sidebar reopens saved conversations without sending the question again. Conversation history, drafts, language choices and new source links are stored in this browser, scoped by user ID (or guest). Existing local question history is imported as individual conversations. This is browser-local storage, not cross-device conversation sync. On small screens, use the history menu to open the sidebar.
