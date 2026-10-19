# Knowledge base workflow

The active chatbot indexes PDF files directly from `backend/knowledge_imports`.
The old generated state HTML pages are excluded to avoid duplicate PDF content.
Curated HTML references and legacy CSV Q&A may supplement the PDFs.

1. Ensure Ollama and Tesseract are available.
2. Run `python -m backend.setup_rag` once to obtain the configured models and
   Gujarati/English OCR language data.
3. Place PDFs in the appropriate folders under `backend/knowledge_imports`.
4. Run `python -m backend.build_vector_index` and restart the backend.

Text is extracted per page. Scanned pages use OCR, and results are cached.
Chunks overlap and preserve filename, page, extraction method, character span,
and source fingerprint. There is no 120-section truncation in the active importer.

Embeddings and metadata persist in `vectors.sqlite3`; model/content fingerprints
reuse unchanged embeddings and rebuild changed ones. Generated databases and OCR
weights are ignored by Git and can be regenerated with the setup/index commands.

`/health?deep=true` reports page coverage, errors, vectors and model availability.
Citations open the original PDFs at the quoted page. Extracted text and LLM
answers still require source and OCR quality checks.
